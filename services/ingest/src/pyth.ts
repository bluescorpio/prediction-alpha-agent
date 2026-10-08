import { config } from "./config.js";
import type { PricePoint } from "@paa/shared";

/**
 * Pyth：链上是 pull 预言机（阅读 PriceUpdateV2 账户）。
 * 链下 ingest 走 Hermes HTTP API 取最新价格。
 *
 * 已核实的两个要点，动手前先确认：
 *  1) Pyth Core 升级后，Hermes 现在【需要 API Key】；
 *  2) pyth-solana-receiver-sdk 与 anchor-lang 版本不匹配会编译报错。
 *
 * TODO(确认端点): 用当前 Hermes 文档核对「最新价格」端点的确切路径与响应结构，
 * 再替换下面的实现。这里先返回空数组，保证类型与调用链成立。
 */
export async function fetchLatestPrices(feedIds: string[]): Promise<PricePoint[]> {
  if (!config.pyth.hermesUrl || !config.pyth.apiKey) {
    console.warn("[pyth] 未配置 PYTH_HERMES_URL / PYTH_API_KEY，跳过价格拉取");
    return [];
  }
  // TODO: 调用 Hermes 最新价格端点并映射为 PricePoint[]
  void feedIds;
  return [];
}
