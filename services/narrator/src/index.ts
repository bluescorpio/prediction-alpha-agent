import type { IntelCard, Signal, SignalType } from "@paa/shared";
import { chatClient, type LlmCorrection } from "./llm.js";

const SIGNAL_TYPES: readonly SignalType[] = [
  "cross_market_divergence",
  "crowding_warning",
  "unreacted_window",
];

let fallbackBannerShown = false;

function warnFallback(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (!fallbackBannerShown) {
    console.warn("============================================================");
    console.warn("[narrator] WARN: LLM 不可用或情报卡校验失败，已回退到模板化文案。");
    console.warn("[narrator] WARN: 下面的情报卡不是模型生成的，只复用了信号里已有的字段。");
    console.warn("============================================================");
    fallbackBannerShown = true;
  }
  console.warn(`[narrator] WARN: ${message}`);
}

function isSignalType(value: unknown): value is SignalType {
  return typeof value === "string" && SIGNAL_TYPES.includes(value as SignalType);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** 去掉模型偶尔包上的 markdown 代码块，再交给 JSON.parse。 */
function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

export function parseIntelCard(text: string): IntelCard {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(text));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`JSON.parse 失败: ${message}`);
  }
  return validateIntelCard(parsed);
}

export function validateIntelCard(value: unknown): IntelCard {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("根节点必须是 JSON 对象");
  }
  const row = value as Record<string, unknown>;
  const errors: string[] = [];

  if (!nonEmptyString(row.event)) errors.push("event 必须是非空字符串");

  const marketRef = row.marketRef;
  let provider = "";
  let marketId = "";
  if (typeof marketRef !== "object" || marketRef === null || Array.isArray(marketRef)) {
    errors.push("marketRef 必须是对象");
  } else {
    const ref = marketRef as Record<string, unknown>;
    if (!nonEmptyString(ref.provider)) errors.push("marketRef.provider 必须是非空字符串");
    else provider = ref.provider;
    if (!nonEmptyString(ref.marketId)) errors.push("marketRef.marketId 必须是非空字符串");
    else marketId = ref.marketId;
  }

  if (!isSignalType(row.signalType)) {
    errors.push("signalType 必须是 cross_market_divergence、crowding_warning 或 unreacted_window");
  }
  if (!nonEmptyString(row.direction)) errors.push("direction 必须是非空字符串");
  if (typeof row.confidence !== "number" || !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1) {
    errors.push("confidence 必须是 0 到 1 的数字");
  }
  if (!Array.isArray(row.evidence) || row.evidence.length === 0 || !row.evidence.every(nonEmptyString)) {
    errors.push("evidence 必须是非空字符串数组");
  }
  if (!nonEmptyString(row.historicalAnalog)) errors.push("historicalAnalog 必须是非空字符串");
  if (!nonEmptyString(row.suggestedAction)) errors.push("suggestedAction 必须是非空字符串");
  if (!nonEmptyString(row.riskNotes)) errors.push("riskNotes 必须是非空字符串");
  if (typeof row.generatedAt !== "number" || !Number.isFinite(row.generatedAt) || row.generatedAt <= 0) {
    errors.push("generatedAt 必须是正数时间戳");
  }

  if (errors.length > 0) throw new Error(errors.join("；"));

  return {
    event: row.event as string,
    marketRef: { provider, marketId },
    signalType: row.signalType as SignalType,
    direction: row.direction as string,
    confidence: row.confidence as number,
    evidence: [...(row.evidence as string[])],
    historicalAnalog: row.historicalAnalog as string,
    suggestedAction: row.suggestedAction as string,
    riskNotes: row.riskNotes as string,
    generatedAt: row.generatedAt as number,
  };
}

/** 不调用模型。文案只拼接信号里已经有的字段，不补充未提供的历史事实。 */
export function templateCard(signal: Signal): IntelCard {
  const evidence = signal.evidence.filter(nonEmptyString);
  return validateIntelCard({
    event: signal.eventRef.question,
    marketRef: {
      provider: signal.eventRef.provider,
      marketId: signal.eventRef.marketId,
    },
    signalType: signal.type,
    direction: signal.direction,
    confidence: signal.confidence,
    evidence: evidence.length > 0 ? evidence : ["信号未提供证据条目"],
    historicalAnalog: "模板回退：输入未提供历史类比，此处不编造。",
    suggestedAction: "仅供研究：对照 evidence 复核该信号是否仍成立。不构成投资建议。",
    riskNotes: "这是模板化文案，不是模型解读。简化模型、样例价格和结算条件都可能使结论失效。不构成投资建议。",
    generatedAt: Date.now(),
  });
}

/**
 * 调 LLM 生成情报卡。解析或字段校验失败时，把错误回填给模型再试一次。
 * 配置缺失、网络失败或第二次仍不合法时，回退模板，不向外抛出。
 */
export async function narrate(signal: Signal): Promise<IntelCard> {
  try {
    const draft = await chatClient.complete(signal);
    try {
      return parseIntelCard(draft);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[narrator] 解析或校验失败，把错误回填给模型并重试一次: ${message}`);
      const correction: LlmCorrection = { error: message, previous: draft };
      const revised = await chatClient.complete(signal, correction);
      return parseIntelCard(revised);
    }
  } catch (error) {
    warnFallback(error);
    return templateCard(signal);
  }
}
