import type { PmEvent, PmMarket } from "@paa/shared";
import { config } from "./config.js";

const BASE = config.jup.predictionBase;
/** 官方定价：1,000,000 原生单位 = $1.00，也就是隐含概率 1。 */
const MICRO_USD = 1_000_000;

async function jup<T>(path: string, init?: RequestInit, exitOnError = false): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "x-api-key": config.jup.apiKey,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    if (exitOnError) {
      console.error(`[ingest] ${path} status=${res.status}`);
      console.error(body);
      process.exit(1);
    }
    throw new Error(`Jupiter ${path} -> ${res.status} ${body}`);
  }
  return (await res.json()) as T;
}

export type PmCategory =
  | "all" | "crypto" | "sports" | "politics"
  | "esports" | "culture" | "economics" | "tech";
export type Provider = "polymarket" | "kalshi";
export type EventFilter = "new" | "live" | "trending";

/** GET /events —— 列事件（支持 category / filter / provider / includeMarkets / start / end） */
export function listEvents(
  params: {
    category?: PmCategory;
    filter?: EventFilter;
    provider?: Provider;
    includeMarkets?: boolean;
    start?: number;
    end?: number;
  } = {},
) {
  const q = new URLSearchParams();
  if (params.category) q.set("category", params.category);
  if (params.filter) q.set("filter", params.filter);
  if (params.provider) q.set("provider", params.provider);
  if (params.includeMarkets != null) q.set("includeMarkets", String(params.includeMarkets));
  if (params.start != null) q.set("start", String(params.start));
  if (params.end != null) q.set("end", String(params.end));
  return jup<unknown>(`/events?${q.toString()}`, undefined, true);
}

/** GET /events/search —— 关键词搜索 */
export function searchEvents(term: string) {
  return jup<unknown>(`/events/search?query=${encodeURIComponent(term)}`);
}

/** GET /events/{eventId} —— 事件详情 */
export function getEvent(eventId: string) {
  return jup<unknown>(`/events/${eventId}`);
}

/** GET /markets/{marketId} —— 市场实时定价与状态 */
export function getMarket(marketId: string) {
  return jup<unknown>(`/markets/${encodeURIComponent(marketId)}`);
}

/**
 * POST /orders —— 创建订单，返回【未签名交易】
 * 金额格式：所有 USD 值用原生单位，1,000,000 = $1.00
 * 签名与提交由前端钱包负责（见 apps/web）。
 */
export function createOrder(body: {
  ownerPubkey: string;
  marketId: string;
  side: "yes" | "no";
  amount: number; // 原生单位
  externalOrderId?: string;
}) {
  return jup<unknown>(`/orders`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** GET /orders?ownerPubkey= */
export function getOrders(ownerPubkey: string) {
  return jup<unknown>(`/orders?ownerPubkey=${ownerPubkey}`);
}

/** GET /positions?ownerPubkey= */
export function getPositions(ownerPubkey: string) {
  return jup<unknown>(`/positions?ownerPubkey=${ownerPubkey}`);
}

interface RawEvent {
  eventId: string;
  category?: string;
  metadata?: { title?: string };
  markets?: RawMarket[];
}

interface RawMarket {
  marketId: string;
  title?: string;
  status?: string;
  result?: string | null;
  provider?: string;
  pricing?: { buyYesPriceUsd?: number | null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readMarket(value: unknown): RawMarket | null {
  if (!isRecord(value) || typeof value.marketId !== "string" || !value.marketId) return null;
  const pricing = isRecord(value.pricing) ? value.pricing : undefined;
  const buyYes = pricing?.buyYesPriceUsd;
  return {
    marketId: value.marketId,
    title: typeof value.title === "string" ? value.title : undefined,
    status: typeof value.status === "string" ? value.status : undefined,
    result: typeof value.result === "string" || value.result === null ? value.result : undefined,
    provider: typeof value.provider === "string" ? value.provider : undefined,
    pricing: {
      buyYesPriceUsd: typeof buyYes === "number" ? buyYes : null,
    },
  };
}

/** 官方 GET /events 响应是 { data, pagination }，不是事件数组本身。 */
export function parseEventsBody(body: unknown): RawEvent[] {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new Error("GET /events 响应缺少 data 数组");
  }
  const events: RawEvent[] = [];
  for (const item of body.data) {
    if (!isRecord(item) || typeof item.eventId !== "string" || !item.eventId) {
      console.warn("[ingest] 跳过一条没有 eventId 的事件");
      continue;
    }
    const metadata = isRecord(item.metadata) ? item.metadata : undefined;
    const markets = Array.isArray(item.markets)
      ? item.markets.flatMap((market) => {
          const parsed = readMarket(market);
          return parsed ? [parsed] : [];
        })
      : [];
    events.push({
      eventId: item.eventId,
      category: typeof item.category === "string" ? item.category : undefined,
      metadata: {
        title: typeof metadata?.title === "string" ? metadata.title : undefined,
      },
      markets,
    });
  }
  return events;
}

/** 官方 GET /markets/{id} 直接返回扁平市场对象，没有 metadata 嵌套。 */
export function parseMarketBody(body: unknown): RawMarket {
  const market = readMarket(body);
  if (!market) throw new Error("GET /markets 响应缺少 marketId");
  return market;
}

function toStatus(status: string | undefined, result: string | null | undefined): PmMarket["status"] | null {
  if (result === "yes" || result === "no") return "settled";
  if (status === "open" || status === "closed") return status;
  // 官方还有 cancelled，共享类型里没有这一档，记成 closed。
  if (status === "cancelled") return "closed";
  return null;
}

export function toPmMarket(raw: RawMarket): PmMarket | null {
  const priceMicro = raw.pricing?.buyYesPriceUsd;
  if (priceMicro == null || !Number.isFinite(priceMicro)) {
    console.warn(`[ingest] 市场 ${raw.marketId} 没有 buyYesPriceUsd，跳过`);
    return null;
  }
  const status = toStatus(raw.status, raw.result);
  if (!status) {
    console.warn(`[ingest] 市场 ${raw.marketId} 状态无法识别: ${raw.status ?? "空"}`);
    return null;
  }
  return {
    id: raw.marketId,
    question: raw.title?.trim() || raw.marketId,
    yesPrice: priceMicro / MICRO_USD,
    status,
  };
}

export function toPmEvent(
  raw: RawEvent,
  markets: PmMarket[],
  provider: Provider,
): PmEvent {
  const title = raw.metadata?.title?.trim();
  if (!title) console.warn(`[ingest] 事件 ${raw.eventId} 没有 metadata.title，用 eventId 代替`);
  return {
    id: raw.eventId,
    title: title || raw.eventId,
    category: raw.category,
    provider,
    markets,
  };
}

export function marketIdsOf(raw: RawEvent): string[] {
  return (raw.markets ?? []).map((market) => market.marketId);
}
