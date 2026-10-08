// 预测市场事件
export interface PmEvent {
  id: string;
  title: string;
  category?: string;
  provider: "polymarket" | "kalshi";
  markets: PmMarket[];
}

// 预测市场（某事件下的某个可交易市场）
export interface PmMarket {
  id: string;
  question: string;
  yesPrice: number; // 0.01 - 0.99，即隐含概率
  status: "open" | "closed" | "settled";
}

// 价格点（Pyth）
export interface PricePoint {
  feedId: string;
  symbol: string;
  price: number;
  ts: number;
}

// 永续资金费率点
export interface FundingPoint {
  symbol: string;
  fundingRate: number; // 每期费率
  ts: number;
}

// 信号类型
export type SignalType = "cross_market_divergence" | "crowding_warning" | "unreacted_window";

// 信号
export interface Signal {
  id: string;
  type: SignalType;
  direction: "pm_overpriced" | "pm_underpriced";
  confidence: number; // 0-1
  eventRef: { provider: string; marketId: string; question: string };
  evidence: string[];
  createdAt: number;
}

// AI 情报卡
export interface IntelCard {
  event: string;
  marketRef: { provider: string; marketId: string };
  signalType: SignalType;
  direction: string;
  confidence: number;
  evidence: string[];
  historicalAnalog?: string;
  suggestedAction: string;
  riskNotes: string;
  generatedAt: number;
}
