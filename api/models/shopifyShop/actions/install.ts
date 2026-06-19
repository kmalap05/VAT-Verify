import { applyParams, save, ActionOptions } from "gadget-server";
import { ensureVatOrderMetafieldDefinition } from "../../../utils/pinVatOrderMetafieldDefinition";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ record, logger, connections }) => {
  const shopify = connections.shopify.current;

  if (!shopify) {
    logger.warn({ shopId: record.id }, "Shopify connection unavailable during install");
    return;
  }

  await ensureVatOrderMetafieldDefinition(shopify, logger);
};

export const options: ActionOptions = { actionType: "create" };
