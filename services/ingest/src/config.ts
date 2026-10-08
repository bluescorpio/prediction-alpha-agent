import { config as loadEnv } from "dotenv";
import { isAbsolute, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, setGlobalDispatcher } from "undici";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
// pnpm --filter 的工作目录是 services/ingest，密钥放在仓库根的 .env。
loadEnv({ path: resolve(repoRoot, ".env") });

function readIngestSource(): "live" | "fixture" {
  const raw = (process.env.INGEST_SOURCE ?? "live").trim().toLowerCase();
  if (raw === "live" || raw === "fixture") return raw;
  throw new Error(`INGEST_SOURCE 只能是 live 或 fixture，当前是 ${raw}`);
}

function resolveDataDir(): string {
  const raw = process.env.DATA_DIR ?? "./.data";
  return isAbsolute(raw) ? raw : resolve(repoRoot, raw);
}

function proxyFromEnv(): string {
  return (
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    ""
  );
}

function redactProxy(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = "***";
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return "(无法解析的代理地址)";
  }
}

const proxyUrl = proxyFromEnv();
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  console.log(`[ingest] 已启用代理 ${redactProxy(proxyUrl)}`);
}

export const config = {
  rpcUrl: process.env.RPC_URL ?? "https://api.devnet.solana.com",
  jup: {
    apiKey: process.env.JUP_API_KEY ?? "",
    predictionBase:
      process.env.JUP_PREDICTION_BASE ?? "https://api.jup.ag/prediction/v1",
  },
  pyth: {
    // 官方升级后的 Hermes 根地址，路径接 /v2/updates/price/latest
    hermesUrl: process.env.PYTH_HERMES_URL || "https://pyth.dourolabs.app/hermes",
    apiKey: process.env.PYTH_API_KEY ?? "",
  },
  perp: {
    source: process.env.PERP_FUNDING_SOURCE ?? "placeholder",
  },
  dataDir: resolveDataDir(),
  ingest: {
    source: readIngestSource(),
    fallbackFixture: process.env.INGEST_FALLBACK_FIXTURE === "true",
    fixturePath: resolve(repoRoot, "fixtures/events.sample.json"),
  },
};

export function assertKeys() {
  const missing: string[] = [];
  if (!config.jup.apiKey) missing.push("JUP_API_KEY");
  if (missing.length) {
    throw new Error(`缺少必要环境变量: ${missing.join(", ")}`);
  }
}
