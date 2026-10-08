import { readFileSync } from "node:fs";
import type { PmEvent } from "@paa/shared";
import { config } from "./config.js";
import { parseEventsBody, toPmEvent, toPmMarket } from "./jupiter-prediction.js";

/** 读仓库内样例，不访问网络。结构与 GET /events 的 { data, pagination } 一致。 */
export function loadFixtureEvents(): PmEvent[] {
  const body: unknown = JSON.parse(readFileSync(config.ingest.fixturePath, "utf8"));
  return parseEventsBody(body).slice(0, 10).map((raw) => {
    const markets = (raw.markets ?? []).flatMap((market) => {
      const mapped = toPmMarket(market);
      return mapped ? [mapped] : [];
    });
    return toPmEvent(raw, markets, "polymarket");
  });
}
