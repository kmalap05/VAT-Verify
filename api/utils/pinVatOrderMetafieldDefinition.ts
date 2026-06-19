const VAT_METAFIELD_NAMESPACE = "$app:vat-verify";
const VAT_METAFIELD_KEY = "vat_number";

type ShopifyGraphqlClient = {
  graphql: (
    query: string,
    variables?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
};

/**
 * Ensures the app-owned $app:vat-verify.vat_number order metafield definition
 * exists and is pinned on order pages in Shopify Admin.
 */
export async function ensureVatOrderMetafieldDefinition(
  shopify: ShopifyGraphqlClient,
  logger: { info: (obj: unknown, msg: string) => void; warn: (obj: unknown, msg: string) => void },
) {
  try {
    const result = (await shopify.graphql(
      `#graphql
      mutation EnsureVatOrderMetafieldDefinition($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition {
            id
            namespace
            key
            pinnedPosition
          }
          userErrors {
            code
            field
            message
          }
        }
      }
    `,
      {
        definition: {
          name: "VAT Number",
          namespace: VAT_METAFIELD_NAMESPACE,
          key: VAT_METAFIELD_KEY,
          description: "Verified VAT number entered at checkout",
          type: "single_line_text_field",
          ownerType: "ORDER",
          pin: true,
          access: {
            admin: "MERCHANT_READ_WRITE",
          },
          capabilities: {
            cartToOrderCopyable: {
              enabled: true,
            },
          },
        },
      },
    )) as {
      metafieldDefinitionCreate?: {
        createdDefinition?: { id: string; namespace: string; key: string; pinnedPosition?: number | null } | null;
        userErrors?: { code?: string | null; field?: string[] | null; message: string }[];
      };
    };

    const userErrors = result.metafieldDefinitionCreate?.userErrors ?? [];
    const alreadyExists = userErrors.some(
      (e) =>
        e.code === "TAKEN" ||
        e.message.toLowerCase().includes("already exists"),
    );

    if (alreadyExists) {
      await pinExistingVatOrderMetafieldDefinition(shopify, logger);
      return;
    }

    const realErrors = userErrors.filter(
      (e) =>
        e.code !== "TAKEN" &&
        !e.message.toLowerCase().includes("already exists"),
    );

    if (realErrors.length > 0) {
      logger.warn({ userErrors: realErrors }, "Failed to create VAT order metafield definition");
      return;
    }

    if (result.metafieldDefinitionCreate?.createdDefinition) {
      logger.info(
        { createdDefinition: result.metafieldDefinitionCreate.createdDefinition },
        "Created and pinned VAT order metafield definition",
      );
    }
  } catch (error) {
    logger.warn({ error }, "Could not ensure VAT order metafield definition");
  }
}

async function pinExistingVatOrderMetafieldDefinition(
  shopify: ShopifyGraphqlClient,
  logger: { info: (obj: unknown, msg: string) => void; warn: (obj: unknown, msg: string) => void },
) {
  const result = (await shopify.graphql(
    `#graphql
    mutation PinVatOrderMetafieldDefinition($identifier: MetafieldDefinitionIdentifierInput!) {
      metafieldDefinitionPin(identifier: $identifier) {
        pinnedDefinition {
          id
          namespace
          key
          pinnedPosition
        }
        userErrors {
          code
          field
          message
        }
      }
    }
  `,
    {
      identifier: {
        namespace: VAT_METAFIELD_NAMESPACE,
        key: VAT_METAFIELD_KEY,
        ownerType: "ORDER",
      },
    },
  )) as {
    metafieldDefinitionPin?: {
      pinnedDefinition?: { id: string; namespace: string; key: string; pinnedPosition?: number | null } | null;
      userErrors?: { code?: string | null; field?: string[] | null; message: string }[];
    };
  };

  const userErrors = result.metafieldDefinitionPin?.userErrors ?? [];
  const alreadyPinned = userErrors.some(
    (e) =>
      e.code === "ALREADY_PINNED" ||
      e.message.toLowerCase().includes("already pinned"),
  );

  if (alreadyPinned) {
    return;
  }

  if (userErrors.length > 0) {
    logger.warn({ userErrors }, "Failed to pin VAT order metafield definition");
    return;
  }

  if (result.metafieldDefinitionPin?.pinnedDefinition) {
    logger.info(
      { pinnedDefinition: result.metafieldDefinitionPin.pinnedDefinition },
      "Pinned existing VAT order metafield definition",
    );
  }
}
