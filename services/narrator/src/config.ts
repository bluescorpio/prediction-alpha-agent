import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// 带上 ingest 的环境加载与代理设置，http.ts 才能走同一条超时/重试/代理路径。
import "../../ingest/src/config.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
// pnpm --filter 的工作目录是 services/narrator，密钥在仓库根 .env。
loadEnv({ path: resolve(repoRoot, ".env") });

function read(name: string): string {
  return (process.env[name] ?? "").trim();
}

export const config = {
  llm: {
    baseUrl: read("LLM_BASE_URL"),
    apiKey: read("LLM_API_KEY"),
    model: read("LLM_MODEL"),
  },
};

/** 缺任一 LLM 配置时抛出明确错误，调用方决定是中止还是回退模板。 */
export function assertLlmConfig(): void {
  const missing: string[] = [];
  if (!config.llm.baseUrl) missing.push("LLM_BASE_URL");
  if (!config.llm.apiKey) missing.push("LLM_API_KEY");
  if (!config.llm.model) missing.push("LLM_MODEL");
  if (missing.length > 0) {
    throw new Error(
      `缺少必要环境变量: ${missing.join(", ")}。请在仓库根 .env 填写后再调用模型。`,
    );
  }
}
