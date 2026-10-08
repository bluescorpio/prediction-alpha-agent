import type { Signal } from "@paa/shared";
import { requestJson } from "../../ingest/src/http.js";
import { assertLlmConfig, config } from "./config.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";

export interface LlmCorrection {
  error: string;
  previous: string;
}

/** 可替换的对话客户端。当前实现只接 OpenAI 兼容的 Chat Completions。 */
export interface LlmClient {
  complete(signal: Signal, correction?: LlmCorrection): Promise<string>;
}

function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

function userContent(signal: Signal, correction?: LlmCorrection): string {
  const prompt = buildUserPrompt(signal);
  if (!correction) return prompt;
  return `${prompt}

上一次输出没有通过校验。
错误：${correction.error}
上一次原文：${correction.previous.slice(0, 2000)}
请只返回修正后的 JSON 对象，不要解释。`;
}

/** 只读取官方 Chat Completions 的 choices[0].message.content，不猜测其他字段。 */
function readAssistantContent(body: unknown): string {
  if (typeof body !== "object" || body === null) {
    throw new Error("Chat Completions 响应不是对象");
  }
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("Chat Completions 响应缺少 choices");
  }
  const first = choices[0];
  if (typeof first !== "object" || first === null) {
    throw new Error("Chat Completions 响应的 choices[0] 不是对象");
  }
  const message = (first as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) {
    throw new Error("Chat Completions 响应缺少 message");
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Chat Completions 响应的 message.content 不是非空字符串");
  }
  return content;
}

export const chatClient: LlmClient = {
  async complete(signal, correction) {
    assertLlmConfig();
    const url = chatCompletionsUrl(config.llm.baseUrl);
    const body = await requestJson(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.llm.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.llm.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent(signal, correction) },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    return readAssistantContent(body);
  },
};
