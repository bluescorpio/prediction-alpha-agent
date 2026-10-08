import type { PmEvent, PmMarket, PricePoint } from "@paa/shared";
import { assertKeys, config } from "./config.js";
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
import { loadFixtureEvents } from "./fixture.js";
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
  const useFixtureOnly = config.ingest.source === "fixture";
  if (!useFixtureOnly) assertKeys();

  console.log("[ingest] 拉取预测市场事件…");
  let events: PmEvent[];
  let usingFixture = useFixtureOnly;
  if (useFixtureOnly) {
    console.warn("[ingest] WARN: INGEST_SOURCE=fixture，读取本地样例，跳过网络");
    events = loadFixtureEvents();
  } else {
    try {
      events = await loadEvents();
    } catch (error) {
      if (!config.ingest.fallbackFixture) throw error;
      console.warn("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
      console.warn("[ingest] WARN: live 请求失败，已回退到 fixtures/events.sample.json。这不是实时数据。");
      console.warn("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
      console.warn(error);
      usingFixture = true;
      events = loadFixtureEvents();
    }
  }
  save("events", events);

  console.log("[ingest] 拉取价格…");
  let prices: PricePoint[] = [];
  if (usingFixture) {
    console.warn("[ingest] WARN: 使用 fixture，跳过现货价网络请求");
  } else {
    try {
      prices = await fetchLatestPrices(["SOL", "BTC"]);
    } catch (error) {
      if (!config.ingest.fallbackFixture) throw error;
      console.warn("[ingest] WARN: 现货价网络失败，已跳过，不阻塞事件落库");
      console.warn(error);
    }
  }
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
