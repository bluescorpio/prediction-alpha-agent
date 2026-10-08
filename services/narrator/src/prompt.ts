import type { Signal, IntelCard } from "@paa/shared";

export const SYSTEM_PROMPT = `你是资深加密衍生品交易员兼风险官。
你会收到一个结构化的市场信号（JSON）。请生成一段不超过 200 字的中文解读，
并给出显著的风险提示。

硬性约束：
- 只使用输入中提供的数据，绝不编造数字或事实。
- 明确标注这是研究/情报，不构成投资建议。
- 严格按给定 JSON schema 返回，不要输出多余文字。`;

export function buildUserPrompt(signal: Signal): string {
  return `信号数据：\n${JSON.stringify(signal, null, 2)}\n\n
请输出符合 IntelCard 结构的 JSON：
{
  "event": string,
  "marketRef": { "provider": string, "marketId": string },
  "signalType": string,
  "direction": string,
  "confidence": number,
  "evidence": string[],
  "historicalAnalog": string,
  "suggestedAction": string,
  "riskNotes": string,
  "generatedAt": number
}`;
}

export type NarratorOutput = IntelCard;
