import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// pnpm --filter 的工作目录是 services/ingest，密钥放在仓库根的 .env。
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../..", ".env") });

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
  dataDir: process.env.DATA_DIR ?? "./.data",
};

export function assertKeys() {
  const missing: string[] = [];
  if (!config.jup.apiKey) missing.push("JUP_API_KEY");
  if (missing.length) {
    throw new Error(`缺少必要环境变量: ${missing.join(", ")}`);
  }
}
