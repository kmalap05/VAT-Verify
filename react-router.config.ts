import { reactRouterConfigOptions } from "gadget-server/react-router";
import type { Config } from "@react-router/dev/config";

export default {
  ...reactRouterConfigOptions,
  future: {
    ...(reactRouterConfigOptions as Config).future,
    v8_trailingSlashAwareDataRequests: true,
    v8_splitRouteModules: true,
  },
} satisfies Config;
