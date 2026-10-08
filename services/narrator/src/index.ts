import { config } from "./config.js"; // TODO: 与 ingest/config.ts 同构，读 LLM_* 变量
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import type { Signal, IntelCard } from "@paa/shared";

/**
 * TODO: 接一个兼容 OpenAI Chat Completions 的端点：
 *  POST ${LLM_BASE_URL}/chat/completions
 *  header: Authorization: Bearer ${LLM_API_KEY}
 *  body: { model: LLM_MODEL, messages: [...] }
 * 并对返回做 JSON 解析 + schema 校验，失败则重试一次。
 */
export async function narrate(signal: Signal): Promise<IntelCard> {
  void config;
  void SYSTEM_PROMPT;
  void buildUserPrompt;
  void signal;
  throw new Error("TODO: 实现 narrator");
}
