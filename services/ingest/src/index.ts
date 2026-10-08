import { assertKeys } from "./config.js";
import { listEvents } from "./jupiter-prediction.js";
import { fetchLatestPrices } from "./pyth.js";
import { fundingSource } from "./perp.js";
import { save } from "./store.js";

async function main() {
  assertKeys();

  console.log("[ingest] 拉取预测市场事件…");
  const events = await listEvents({ category: "crypto", filter: "trending" });
  save("events", events as unknown[]);

  console.log("[ingest] 拉取价格…");
  const prices = await fetchLatestPrices(["SOL/USD", "BTC/USD"]);
  save("prices", prices);

  console.log("[ingest] 拉取资金费率…");
  const funding = await fundingSource.fetchFundingRates(["SOL", "BTC"]);
  save("funding", funding);

  console.log(
    `[ingest] 完成。events=${(events as unknown[]).length} prices=${prices.length} funding=${funding.length}`,
  );
}

main().catch((e) => {
  console.error("[ingest] 失败:", e);
  process.exit(1);
});
