import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossShopDataAccess } from "gadget-server/shopify";
import { ensureVatOrderMetafieldDefinition } from "../../../utils/pinVatOrderMetafieldDefinition";

export const run: ActionRun = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await preventCrossShopDataAccess(params, record);
  await save(record);
};

export const onSuccess: ActionOnSuccess = async ({ record, logger, connections }) => {
  const shopify = connections.shopify.current;

  if (!shopify) {
    logger.warn({ shopId: record.id }, "Shopify connection unavailable during reinstall");
    return;
  }

  await ensureVatOrderMetafieldDefinition(shopify, logger);
};

export const options: ActionOptions = { actionType: "update" };
