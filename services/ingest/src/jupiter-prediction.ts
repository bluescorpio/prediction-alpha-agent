import { config } from "./config.js";

const BASE = config.jup.predictionBase;

async function jup<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "x-api-key": config.jup.apiKey,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Jupiter ${path} -> ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export type PmCategory =
  | "all" | "crypto" | "sports" | "politics"
  | "esports" | "culture" | "economics" | "tech";
export type Provider = "polymarket" | "kalshi";
export type EventFilter = "new" | "live" | "trending";

/** GET /events —— 列事件（支持 category / filter / provider） */
export function listEvents(
  params: { category?: PmCategory; filter?: EventFilter; provider?: Provider } = {},
) {
  const q = new URLSearchParams();
  if (params.category) q.set("category", params.category);
  if (params.filter) q.set("filter", params.filter);
  if (params.provider) q.set("provider", params.provider);
  return jup<unknown>(`/events?${q.toString()}`);
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
  return jup<unknown>(`/markets/${marketId}`);
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
