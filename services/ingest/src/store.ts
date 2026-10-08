import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

function pathFor(name: string) {
  return join(config.dataDir, `${name}.json`);
}

export function save<T>(name: string, rows: T[]) {
  if (!existsSync(config.dataDir)) mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(pathFor(name), JSON.stringify(rows, null, 2));
}

export function load<T>(name: string): T[] {
  const p = pathFor(name);
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, "utf8")) as T[];
}
