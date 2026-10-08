import { config } from "./config.js";
import type { FundingPoint } from "@paa/shared";

/**
 * 永续资金费率/基差。
 * 现状：Jupiter Perps API 官方标注为 WIP。
 * 策略：定义一个可替换的数据源接口，先返回占位，后续切到真实来源。
 *
 * TODO(数据源): 二选一接真实数据
 *   a) 解析 Jupiter Perps 程序 IDL，读取池/费率账户；
 *   b) 用 Drift SDK 或公开数据源取资金费率。
 */
export interface FundingSource {
  fetchFundingRates(symbols: string[]): Promise<FundingPoint[]>;
}

const mockSource: FundingSource = {
  async fetchFundingRates(symbols) {
    console.warn("[perp] MOCK 资金费率。Jupiter Perps API 仍是占位，这些数字不是真实行情");
    return symbols.map((symbol) => ({
      symbol,
      fundingRate: 0,
      ts: Date.now(),
    }));
  },
};

export const fundingSource: FundingSource =
  config.perp.source === "placeholder"
    ? mockSource
    : mockSource; // TODO: 新增真实实现并在此分支返回
