import { airbyteFromEnv } from "./airbyte";
import { postgresMarketingFromEnv, postgresMarketingTransformerFromEnv } from "./postgres";
import type { MarketingMartPort } from "./ports";
import { createMarketingIntelligence } from "./service";
import { marketingControl } from "./store";

const unavailableMart: MarketingMartPort = {
  getTrafficReport: async () => null,
  getAttributionReport: async () => null,
  getCampaignReport: async () => null,
};

export function marketingIntelligence() {
  return createMarketingIntelligence({
    control: marketingControl,
    mart: postgresMarketingFromEnv() ?? unavailableMart,
    rawAdmin: postgresMarketingTransformerFromEnv(),
    airbyte: airbyteFromEnv(),
  });
}
