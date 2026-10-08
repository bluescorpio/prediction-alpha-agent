const UNDERLYINGS = ["BTC", "ETH", "SOL"] as const;
type Underlying = (typeof UNDERLYINGS)[number];

/** 数值近似标准正态 CDF。简化模型用，不追求尾部精度。 */
function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  const t = 1 / (1 + 0.2316419 * abs);
  const poly =
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const density = Math.exp(-0.5 * abs * abs) / Math.sqrt(2 * Math.PI);
  const upper = density * poly;
  return sign === 1 ? 1 - upper : upper;
}

export function parseStrike(question: string): number | null {
  const matched = question.match(/站上\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*美元/);
  if (!matched?.[1]) return null;
  const strike = Number(matched[1].replace(/,/g, ""));
  return Number.isFinite(strike) && strike > 0 ? strike : null;
}

export function parseUnderlying(question: string): Underlying | null {
  for (const symbol of UNDERLYINGS) {
    if (new RegExp(`\\b${symbol}\\b`, "i").test(question)) return symbol;
  }
  return null;
}

/**
 * 简化对数正态：假设漂移为 0，pModel = P(S_T > K) = Φ(d2)。
 * d2 = (ln(S/K) - 0.5 σ² t) / (σ √t)，t 用年化。这不是可交易的定价。
 */
export function probabilityAbove(
  spot: number,
  strike: number,
  volAnnual: number,
  horizonDays: number,
): number | null {
  if (spot <= 0 || strike <= 0 || volAnnual <= 0 || horizonDays <= 0) return null;
  const years = horizonDays / 365;
  const denom = volAnnual * Math.sqrt(years);
  if (denom <= 0) return null;
  const d2 = (Math.log(spot / strike) - 0.5 * volAnnual * volAnnual * years) / denom;
  const probability = normalCdf(d2);
  if (!Number.isFinite(probability)) return null;
  return Math.min(1, Math.max(0, probability));
}
