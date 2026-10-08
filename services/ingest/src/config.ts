import "dotenv/config";

export const config = {
  rpcUrl: process.env.RPC_URL ?? "https://api.devnet.solana.com",
  jup: {
    apiKey: process.env.JUP_API_KEY ?? "",
    predictionBase:
      process.env.JUP_PREDICTION_BASE ?? "https://api.jup.ag/prediction/v1",
  },
  pyth: {
    hermesUrl: process.env.PYTH_HERMES_URL ?? "",
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
