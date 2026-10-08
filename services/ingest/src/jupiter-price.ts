import type { PricePoint } from "@paa/shared";
import { config } from "./config.js";
import { requestJson } from "./http.js";

/** 官方 Price API V3：GET /price/v3?ids={mints}，响应按 mint 做 key，价格字段是 usdPrice。 */
const PRICE_URL = "https://api.jup.ag/price/v3";
/** 官方 Token Search：用符号查 mint。Price API 只接受 mint，不接受 SOL/BTC 这种符号。 */
const TOKEN_SEARCH_URL = "https://api.jup.ag/tokens/v2/search";

/**
 * 官方价格文档把这枚 mint 标成 SOL。
 * https://developers.jup.ag/docs/guides/how-to-get-token-price
 */
const SOL_MINT = "So11111111111111111111111111111111111111112";

const DOCUMENTED_MINTS: Record<string, string> = {
  SOL: SOL_MINT,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function jupGet(url: string): Promise<unknown> {
  return requestJson(url, {
    headers: { "x-api-key": config.jup.apiKey },
    exitOnHttpError: true,
  });
}

function normalizeSymbol(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  if (upper === "SOL/USD") return "SOL";
  if (upper === "BTC/USD") return "BTC";
  return upper;
}

/** 在已验证、符号正好是 BTC 的结果里，取 organicScore 最高的一枚。 */
async function resolveBtcMint(): Promise<string> {
  const body = await jupGet(`${TOKEN_SEARCH_URL}?query=BTC`);
  if (!Array.isArray(body)) {
    throw new Error("GET /tokens/v2/search 响应不是数组");
  }
  const matches = body.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (item.symbol !== "BTC" || item.isVerified !== true || typeof item.id !== "string") return [];
    const score = typeof item.organicScore === "number" ? item.organicScore : 0;
    const name = typeof item.name === "string" ? item.name : "BTC";
    return [{ id: item.id, name, score }];
  });
  matches.sort((left, right) => right.score - left.score);
  const chosen = matches[0];
  if (!chosen) {
    throw new Error("Token Search 没有返回 symbol=BTC 且 isVerified 的 mint");
  }
  console.log(`[price] BTC 选用已验证代币 ${chosen.name} ${chosen.id}`);
  return chosen.id;
}

async function mintFor(symbol: string): Promise<string> {
  const documented = DOCUMENTED_MINTS[symbol];
  if (documented) return documented;
  if (symbol === "BTC") return resolveBtcMint();
  throw new Error(`没有已核实的 mint 映射: ${symbol}`);
}

function readUsdPrice(value: unknown): number | null {
  if (!isRecord(value) || typeof value.usdPrice !== "number" || !Number.isFinite(value.usdPrice)) {
    return null;
  }
  return value.usdPrice;
}

export async function fetchLatestPrices(symbols: string[]): Promise<PricePoint[]> {
  const requested = symbols.map(normalizeSymbol);
  const mints = await Promise.all(requested.map((symbol) => mintFor(symbol)));
  const body = await jupGet(`${PRICE_URL}?ids=${mints.join(",")}`);
  if (!isRecord(body)) {
    throw new Error("GET /price/v3 响应不是以 mint 为 key 的对象");
  }

  const fetchedAt = Date.now();
  const points: PricePoint[] = [];
  for (let index = 0; index < requested.length; index += 1) {
    const symbol = requested[index];
    const mint = mints[index];
    const usdPrice = readUsdPrice(body[mint]);
    if (usdPrice == null) {
      console.warn(`[price] ${symbol} (${mint}) 没有 usdPrice，官方会省略没有可靠价格的代币`);
      continue;
    }
    points.push({
      feedId: mint,
      symbol,
      price: usdPrice,
      ts: fetchedAt,
    });
    console.log(`[price] ${symbol}=${usdPrice}`);
  }
  return points;
}
