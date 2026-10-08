import "dotenv/config";

// 与 ingest/config.ts 同构，只读 narrator 用的 LLM_*。
export const config = {
  llm: {
    baseUrl: process.env.LLM_BASE_URL ?? "",
    apiKey: process.env.LLM_API_KEY ?? "",
    model: process.env.LLM_MODEL ?? "",
  },
};
