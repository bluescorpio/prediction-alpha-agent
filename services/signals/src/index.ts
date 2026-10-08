import type { Signal } from "@paa/shared";
import { crossMarketSignal } from "./detect.js";
import { load, save } from "./store.js"; // 复用 ingest 的 store 即可

async function main() {
  // TODO: 从 ingest 落库的数据里取候选市场，计算 pModel（用 Pyth 价 + 历史波动率），
  // 调用 crossMarketSignal 产出信号并落库。
  const signals: Signal[] = [];
  void crossMarketSignal;
  void load;
  save("signals", signals);
  console.log(`[signals] 完成。signals=${signals.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
