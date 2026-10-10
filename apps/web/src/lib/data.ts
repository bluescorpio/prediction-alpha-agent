import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { IntelCard, Signal } from "@paa/shared";

// 只在服务端运行：用 node:fs 读仓库里的 JSON，不能进客户端包。

function repoRoot(): string {
  let current = process.cwd();
  for (;;) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) {
      throw new Error("找不到含 pnpm-workspace.yaml 的仓库根目录");
    }
    current = parent;
  }
}

function readJson<T>(name: string): T[] {
  const root = repoRoot();
  const candidates = [
    join(root, ".data", `${name}.json`),
    join(root, "fixtures", `${name}.sample.json`),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const body: unknown = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(body) ? (body as T[]) : [];
  }
  return [];
}

export async function readSignals(): Promise<Signal[]> {
  return readJson<Signal>("signals");
}

export async function readIntelCards(): Promise<IntelCard[]> {
  return readJson<IntelCard>("intel_cards");
}
