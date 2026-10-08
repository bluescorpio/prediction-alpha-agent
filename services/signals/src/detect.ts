import type { Signal } from "@paa/shared";

/**
 * 信号类型 A：跨市场定价分歧。
 * 用市场隐含概率与模型概率之差，按历史标准差标准化（z-score）。
 * z = (p_market - p_model) / sigma_hist
 */
export function crossMarketSignal(args: {
  marketId: string;
  provider: string;
  question: string;
  pMarket: number;
  pModel: number;
  sigmaHist: number;
  zThreshold?: number;
}): Signal | null {
  const { pMarket, pModel, sigmaHist, zThreshold = 2 } = args;
  if (sigmaHist <= 0) return null;

  const z = (pMarket - pModel) / sigmaHist;
  if (Math.abs(z) < zThreshold) return null;

  return {
    id: `${args.marketId}:${Date.now()}`,
    type: "cross_market_divergence",
    direction: z > 0 ? "pm_overpriced" : "pm_underpriced",
    confidence: Math.min(1, Math.abs(z) / 4),
    eventRef: {
      provider: args.provider,
      marketId: args.marketId,
      question: args.question,
    },
    evidence: [
      `市场隐含概率 ${pMarket.toFixed(3)}`,
      `模型概率 ${pModel.toFixed(3)}`,
      `z=${z.toFixed(2)}`,
    ],
    createdAt: Date.now(),
  };
}
