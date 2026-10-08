import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PmEvent, PricePoint, Signal } from "@paa/shared";
import { crossMarketSignal } from "./detect.js";
import { parseStrike, parseUnderlying, probabilityAbove } from "./model.js";
import { load, save } from "./store.js";

const Z_THRESHOLD = 2;
const PRICE_FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/prices.sample.json");

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} 不是数字: ${raw}`);
  return value;
}

function isPricePoint(value: unknown): value is PricePoint {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.symbol === "string" && typeof row.price === "number" && Number.isFinite(row.price);
}

function loadPrices(): PricePoint[] {
  const saved = load<PricePoint>("prices").filter(isPricePoint);
  if (saved.length > 0) return saved;
  console.warn("[signals] WARN: prices.json 为空，回退读取 fixtures/prices.sample.json。这不是实时行情。");
  const body: unknown = JSON.parse(readFileSync(PRICE_FIXTURE, "utf8"));
  if (!Array.isArray(body)) throw new Error("fixtures/prices.sample.json 必须是数组");
  return body.filter(isPricePoint);
}

function spotFor(symbol: string, prices: PricePoint[]): number | null {
  const wanted = symbol.toUpperCase();
  const match = prices.find((price) => price.symbol.split("/")[0]?.toUpperCase() === wanted);
  return match && match.price > 0 ? match.price : null;
}

function buildSignals(events: PmEvent[], prices: PricePoint[]): Signal[] {
  const volAnnual = readNumber("SIGNAL_VOL_ANNUAL", 0.6);
  const horizonDays = readNumber("SIGNAL_HORIZON_DAYS", 30);
  // sigmaHist 是简化常数，不是从历史收益估出来的。
  const sigmaHist = readNumber("SIGNAL_SIGMA_HIST", 0.08);
  const signals: Signal[] = [];

  for (const event of events) {
    for (const market of event.markets) {
      const strike = parseStrike(market.question);
      const underlying = parseUnderlying(market.question);
      if (strike == null || underlying == null) {
        console.warn(`[signals] 跳过无法解析阈值或标的的市场: ${market.question}`);
        continue;
      }
      const spot = spotFor(underlying, prices);
      if (spot == null) {
        console.warn(`[signals] 跳过没有现货价的标的 ${underlying}: ${market.question}`);
        continue;
      }
      const pModel = probabilityAbove(spot, strike, volAnnual, horizonDays);
      if (pModel == null) continue;
      const signal = crossMarketSignal({
        marketId: market.id,
        provider: event.provider,
        question: market.question,
        pMarket: market.yesPrice,
        pModel,
        sigmaHist,
        zThreshold: Z_THRESHOLD,
      });
      if (signal) signals.push(signal);
    }
  }
  return signals;
}

function main() {
  const events = load<PmEvent>("events");
  const prices = loadPrices();
  const signals = buildSignals(events, prices);
  save("signals", signals);
  console.log(`[signals] 完成。signals=${signals.length}`);
  for (const signal of signals) {
    console.log(
      `[signals] ${signal.direction} ${signal.eventRef.question}（${signal.evidence.join("，")}）`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error("[signals] 失败:", error);
  process.exit(1);
}
