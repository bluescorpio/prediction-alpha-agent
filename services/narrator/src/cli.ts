import { pathToFileURL } from "node:url";
import type { IntelCard, Signal } from "@paa/shared";
import { load, save } from "../../ingest/src/store.js";
import { narrate } from "./index.js";

async function main(): Promise<void> {
  const signals = load<Signal>("signals");
  const cards: IntelCard[] = [];
  for (const signal of signals) {
    const card = await narrate(signal);
    cards.push(card);
    console.log(JSON.stringify(card, null, 2));
  }
  save("intel_cards", cards);
  console.log(`[narrator] 完成。cards=${cards.length}`);
  if (cards.length === 0) {
    throw new Error("没有读到信号。.data/signals.json 为空或不存在。");
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error) => {
    console.error("[narrator] 失败:", error);
    process.exit(1);
  });
}
