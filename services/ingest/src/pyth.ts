import { config } from "./config.js";
import type { PricePoint } from "@paa/shared";

/**
 * Hermes 最新价。
 * GET {PYTH_HERMES_URL}/v2/updates/price/latest?ids[]=
 * 鉴权：Authorization: Bearer PYTH_API_KEY
 * 文档里的价格换算：实际价格 = price * 10^expo
 * 来源：https://docs.pyth.network/price-feeds/core/fetch-price-updates
 */
const DEFAULT_HERMES_URL = "https://pyth.dourolabs.app/hermes";

/** 官方 Price Feed IDs：https://docs.pyth.network/llms-price-feeds-core.txt */
const KNOWN_FEEDS: Record<string, string> = {
  "BTC/USD": "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "SOL/USD": "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
};

function normalizeFeedId(feedId: string): string {
  return feedId.toLowerCase().replace(/^0x/, "");
}

function resolveFeed(input: string): { feedId: string; symbol: string } | null {
  const known = KNOWN_FEEDS[input];
  if (known) return { feedId: known, symbol: input };
  if (/^0x[0-9a-fA-F]{64}$/.test(input)) return { feedId: input, symbol: input };
  return null;
}

function mockPrices(feeds: { feedId: string; symbol: string }[]): PricePoint[] {
  console.warn("[pyth] MOCK 未配置 PYTH_API_KEY，下面的价格是占位，不是行情");
  return feeds.map((feed) => ({
    feedId: feed.feedId,
    symbol: feed.symbol,
    price: 0,
    ts: Date.now(),
  }));
}

interface HermesPrice {
  price: string;
  expo: number;
  publish_time: number;
}

function readHermesPrice(value: unknown): HermesPrice | null {
  if (typeof value !== "object" || value === null) return null;
  const price = value as Record<string, unknown>;
  if (typeof price.price !== "string" || typeof price.expo !== "number") return null;
  return {
    price: price.price,
    expo: price.expo,
    publish_time: typeof price.publish_time === "number" ? price.publish_time : 0,
  };
}

export async function fetchLatestPrices(feedIds: string[]): Promise<PricePoint[]> {
  const feeds = feedIds.flatMap((feedId) => {
    const feed = resolveFeed(feedId);
    if (!feed) {
      console.warn(`[pyth] 跳过未核实的价格标识 ${feedId}`);
      return [];
    }
    return [feed];
  });
  if (!config.pyth.apiKey) return mockPrices(feeds);

  const base = (config.pyth.hermesUrl || DEFAULT_HERMES_URL).replace(/\/$/, "");
  const query = new URLSearchParams();
  for (const feed of feeds) query.append("ids[]", feed.feedId);
  const response = await fetch(`${base}/v2/updates/price/latest?${query.toString()}`, {
    headers: { Authorization: `Bearer ${config.pyth.apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`Hermes /v2/updates/price/latest -> ${response.status} ${await response.text()}`);
  }

  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !Array.isArray((body as { parsed?: unknown }).parsed)) {
    throw new Error("Hermes 响应缺少 parsed 数组");
  }
  const byId = new Map(feeds.map((feed) => [normalizeFeedId(feed.feedId), feed.symbol]));
  const points: PricePoint[] = [];
  for (const item of (body as { parsed: unknown[] }).parsed) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string") continue;
    const quote = readHermesPrice(row.price);
    if (!quote) continue;
    const raw = Number(quote.price);
    if (!Number.isFinite(raw)) continue;
    const symbol = byId.get(normalizeFeedId(row.id));
    if (!symbol) continue;
    points.push({
      feedId: row.id,
      symbol,
      price: raw * 10 ** quote.expo,
      ts: quote.publish_time > 0 ? quote.publish_time * 1000 : Date.now(),
    });
  }
  return points;
}
