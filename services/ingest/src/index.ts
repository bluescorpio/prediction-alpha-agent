import type { PmEvent, PmMarket } from "@paa/shared";
import { assertKeys } from "./config.js";
import {
  getMarket,
  listEvents,
  marketIdsOf,
  parseEventsBody,
  parseMarketBody,
  toPmEvent,
  toPmMarket,
} from "./jupiter-prediction.js";
import { fetchLatestPrices } from "./jupiter-price.js";
import { fundingSource } from "./perp.js";
import { save } from "./store.js";

const EVENT_LIMIT = 10;
const PROVIDER = "polymarket" as const;

async function loadMarkets(raw: ReturnType<typeof parseEventsBody>[number]): Promise<PmMarket[]> {
  const markets: PmMarket[] = [];
  for (const marketId of marketIdsOf(raw)) {
    try {
      const fresh = toPmMarket(parseMarketBody(await getMarket(marketId)));
      if (fresh) markets.push(fresh);
    } catch (error) {
      console.warn(`[ingest] GET /markets/${marketId} 失败，改用 /events 里的定价`);
      console.warn(error);
      const embedded = raw.markets?.find((market) => market.marketId === marketId);
      if (!embedded) continue;
      const fallback = toPmMarket(embedded);
      if (fallback) markets.push(fallback);
    }
  }
  return markets;
}

async function loadEvents(): Promise<PmEvent[]> {
  const body = await listEvents({
    category: "crypto",
    filter: "trending",
    provider: PROVIDER,
    includeMarkets: true,
    start: 0,
    end: EVENT_LIMIT,
  });
  const rawEvents = parseEventsBody(body).slice(0, EVENT_LIMIT);
  const events: PmEvent[] = [];
  for (const raw of rawEvents) {
    events.push(toPmEvent(raw, await loadMarkets(raw), PROVIDER));
  }
  return events;
}

async function main() {
  assertKeys();

  console.log("[ingest] 拉取预测市场事件…");
  const events = await loadEvents();
  save("events", events);

  console.log("[ingest] 拉取价格…");
  const prices = await fetchLatestPrices(["SOL", "BTC"]);
  save("prices", prices);

  console.log("[ingest] 拉取资金费率…");
  const funding = await fundingSource.fetchFundingRates(["SOL", "BTC"]);
  save("funding", funding);

  const marketCount = events.reduce((count, event) => count + event.markets.length, 0);
  console.log(
    `[ingest] 完成。events=${events.length} markets=${marketCount} prices=${prices.length} funding=${funding.length}`,
  );
}

main().catch((error) => {
  console.error("[ingest] 失败:", error);
  process.exit(1);
});
