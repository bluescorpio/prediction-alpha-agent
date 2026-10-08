# Prediction Alpha Agent — 仓库脚手架（可直接开跑）

> 这是 PRD 第九节目录的**落地版**。把每个代码块按标题路径存成文件，即可得到一个 pnpm 工作区单仓（monorepo）。
>
> **诚实标注**：根配置、`README`、`.env.example`、`ingest` 层是「开跑即可用」的实体代码（其中 Pyth / Perps 数据源按已核实的现状留了明确 TODO）；`signals` / `narrator` / `programs` / `apps/web` 是结构完整的最小骨架，建议让 AI 在**跑通官方 Bootcamp 示例之后**再往里填肉。

---

## 一、目录树

```plaintext
prediction-alpha-agent/
├─ apps/
│  └─ web/                          # Next.js 仪表盘（最小骨架）
├─ services/
│  ├─ ingest/                       # 数据接入层（本次重点）
│  ├─ signals/                      # 错价检测（骨架）
│  └─ narrator/                     # AI 情报卡（骨架）
├─ programs/
│  └─ alpha_desk/                   # Anchor 程序：信号注册 + 战绩账本（骨架）
├─ packages/
│  └─ shared/                       # 共享类型
├─ docs/
├─ .env.example
├─ .gitignore
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
└─ README.md
```

---

## 二、根级配置（可直接用）

### `package.json`

```json
{
  "name": "prediction-alpha-agent",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "ingest": "pnpm --filter @paa/ingest dev",
    "signals": "pnpm --filter @paa/signals dev",
    "narrate": "pnpm --filter @paa/narrator dev",
    "web": "pnpm --filter @paa/web dev",
    "dev": "pnpm -r --parallel dev"
  }
}
```

### `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "services/*"
  - "packages/*"
```

### `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"]
  }
}
```

### `.env.example`

```bash
# ---------- RPC ----------
RPC_URL=https://api.devnet.solana.com
# OrbitFlare（本届赞助方，可选；填了它会显著降低延迟）
ORBITFLARE_RPC_URL=

# ---------- Jupiter Prediction API ----------
# 在 https://developers.jup.ag/portal 申请
JUP_API_KEY=
JUP_PREDICTION_BASE=https://api.jup.ag/prediction/v1

# ---------- Pyth ----------
# 注意：Pyth Core 升级后 Hermes 需要 API Key，请用新版地址
PYTH_HERMES_URL=
PYTH_API_KEY=

# ---------- Perps ----------
# Jupiter Perps API 官方仍为 WIP，先用占位来源，后续可切 Drift / 公开数据源
PERP_FUNDING_SOURCE=placeholder

# ---------- 存储 ----------
DATA_DIR=./.data

# ---------- LLM（narrator 用）----------
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=
```

### `.gitignore`

```plaintext
node_modules/
.env
.data/
dist/
target/
.next/
.DS_Store
```

---

## 三、`packages/shared`（共享类型）

### `packages/shared/package.json`

```json
{
  "name": "@paa/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

### `packages/shared/src/index.ts`

```typescript
// 预测市场事件
export interface PmEvent {
  id: string;
  title: string;
  category?: string;
  provider: "polymarket" | "kalshi";
  markets: PmMarket[];
}

// 预测市场（某事件下的某个可交易市场）
export interface PmMarket {
  id: string;
  question: string;
  yesPrice: number; // 0.01 - 0.99，即隐含概率
  status: "open" | "closed" | "settled";
}

// 价格点（Pyth）
export interface PricePoint {
  feedId: string;
  symbol: string;
  price: number;
  ts: number;
}

// 永续资金费率点
export interface FundingPoint {
  symbol: string;
  fundingRate: number; // 每期费率
  ts: number;
}

// 信号类型
export type SignalType = "cross_market_divergence" | "crowding_warning" | "unreacted_window";

// 信号
export interface Signal {
  id: string;
  type: SignalType;
  direction: "pm_overpriced" | "pm_underpriced";
  confidence: number; // 0-1
  eventRef: { provider: string; marketId: string; question: string };
  evidence: string[];
  createdAt: number;
}

// AI 情报卡
export interface IntelCard {
  event: string;
  marketRef: { provider: string; marketId: string };
  signalType: SignalType;
  direction: string;
  confidence: number;
  evidence: string[];
  historicalAnalog?: string;
  suggestedAction: string;
  riskNotes: string;
  generatedAt: number;
}
```

---

## 四、`services/ingest`（数据接入层 — 本次重点）

### `services/ingest/package.json`

```json
{
  "name": "@paa/ingest",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@paa/shared": "workspace:*",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0"
  }
}
```

### `services/ingest/src/config.ts`

```typescript
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
```

### `services/ingest/src/jupiter-prediction.ts`（已核实接口）

```typescript
import { config } from "./config.js";

const BASE = config.jup.predictionBase;

async function jup<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "x-api-key": config.jup.apiKey,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Jupiter ${path} -> ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export type PmCategory =
  | "all" | "crypto" | "sports" | "politics"
  | "esports" | "culture" | "economics" | "tech";
export type Provider = "polymarket" | "kalshi";
export type EventFilter = "new" | "live" | "trending";

/** GET /events —— 列事件（支持 category / filter / provider） */
export function listEvents(
  params: { category?: PmCategory; filter?: EventFilter; provider?: Provider } = {},
) {
  const q = new URLSearchParams();
  if (params.category) q.set("category", params.category);
  if (params.filter) q.set("filter", params.filter);
  if (params.provider) q.set("provider", params.provider);
  return jup<unknown>(`/events?${q.toString()}`);
}

/** GET /events/search —— 关键词搜索 */
export function searchEvents(term: string) {
  return jup<unknown>(`/events/search?query=${encodeURIComponent(term)}`);
}

/** GET /events/{eventId} —— 事件详情 */
export function getEvent(eventId: string) {
  return jup<unknown>(`/events/${eventId}`);
}

/** GET /markets/{marketId} —— 市场实时定价与状态 */
export function getMarket(marketId: string) {
  return jup<unknown>(`/markets/${marketId}`);
}

/**
 * POST /orders —— 创建订单，返回【未签名交易】
 * 金额格式：所有 USD 值用原生单位，1,000,000 = $1.00
 * 签名与提交由前端钱包负责（见 apps/web）。
 */
export function createOrder(body: {
  ownerPubkey: string;
  marketId: string;
  side: "yes" | "no";
  amount: number; // 原生单位
  externalOrderId?: string;
}) {
  return jup<unknown>(`/orders`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** GET /orders?ownerPubkey= */
export function getOrders(ownerPubkey: string) {
  return jup<unknown>(`/orders?ownerPubkey=${ownerPubkey}`);
}

/** GET /positions?ownerPubkey= */
export function getPositions(ownerPubkey: string) {
  return jup<unknown>(`/positions?ownerPubkey=${ownerPubkey}`);
}
```

### `services/ingest/src/pyth.ts`（接口占位 + 已核实要点）

```typescript
import { config } from "./config.js";
import type { PricePoint } from "@paa/shared";

/**
 * Pyth：链上是 pull 预言机（阅读 PriceUpdateV2 账户）。
 * 链下 ingest 走 Hermes HTTP API 取最新价格。
 *
 * 已核实的两个要点，动手前先确认：
 *  1) Pyth Core 升级后，Hermes 现在【需要 API Key】；
 *  2) pyth-solana-receiver-sdk 与 anchor-lang 版本不匹配会编译报错。
 *
 * TODO(确认端点): 用当前 Hermes 文档核对「最新价格」端点的确切路径与响应结构，
 * 再替换下面的实现。这里先返回空数组，保证类型与调用链成立。
 */
export async function fetchLatestPrices(feedIds: string[]): Promise<PricePoint[]> {
  if (!config.pyth.hermesUrl || !config.pyth.apiKey) {
    console.warn("[pyth] 未配置 PYTH_HERMES_URL / PYTH_API_KEY，跳过价格拉取");
    return [];
  }
  // TODO: 调用 Hermes 最新价格端点并映射为 PricePoint[]
  void feedIds;
  return [];
}
```

### `services/ingest/src/perp.ts`（可替换数据源）

```typescript
import { config } from "./config.js";
import type { FundingPoint } from "@paa/shared";

/**
 * 永续资金费率/基差。
 * 现状：Jupiter Perps API 官方标注为 WIP。
 * 策略：定义一个可替换的数据源接口，先返回占位，后续切到真实来源。
 *
 * TODO(数据源): 二选一接真实数据
 *   a) 解析 Jupiter Perps 程序 IDL，读取池/费率账户；
 *   b) 用 Drift SDK 或公开数据源取资金费率。
 */
export interface FundingSource {
  fetchFundingRates(symbols: string[]): Promise<FundingPoint[]>;
}

const placeholderSource: FundingSource = {
  async fetchFundingRates(symbols) {
    return symbols.map((symbol) => ({
      symbol,
      fundingRate: 0,
      ts: Date.now(),
    }));
  },
};

export const fundingSource: FundingSource =
  config.perp.source === "placeholder"
    ? placeholderSource
    : placeholderSource; // TODO: 新增真实实现并在此分支返回
```

### `services/ingest/src/store.ts`（零依赖落库）

```typescript
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
```

### `services/ingest/src/index.ts`（编排入口）

```typescript
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
```

---

## 五、`services/signals`（错价检测 — 骨架）

### `services/signals/src/detect.ts`

```typescript
import type { Signal } from "@paa/shared";

/**
 * 信号类型 A：跨市场定价分歧。
 * 用市场隐含概率与模型概率之差，按历史标准差标准化（z-score）。
 * z = (p_market - p_model) / sigma_hist
 */
export function crossMarketSignal(args: {
  marketId: string;
  provider: string;
  question: string;
  pMarket: number;
  pModel: number;
  sigmaHist: number;
  zThreshold?: number;
}): Signal | null {
  const { pMarket, pModel, sigmaHist, zThreshold = 2 } = args;
  if (sigmaHist <= 0) return null;

  const z = (pMarket - pModel) / sigmaHist;
  if (Math.abs(z) < zThreshold) return null;

  return {
    id: `${args.marketId}:${Date.now()}`,
    type: "cross_market_divergence",
    direction: z > 0 ? "pm_overpriced" : "pm_underpriced",
    confidence: Math.min(1, Math.abs(z) / 4),
    eventRef: {
      provider: args.provider,
      marketId: args.marketId,
      question: args.question,
    },
    evidence: [
      `市场隐含概率 ${pMarket.toFixed(3)}`,
      `模型概率 ${pModel.toFixed(3)}`,
      `z=${z.toFixed(2)}`,
    ],
    createdAt: Date.now(),
  };
}
```

### `services/signals/src/index.ts`

```typescript
import { crossMarketSignal } from "./detect.js";
import { load, save } from "./store.js"; // 复用 ingest 的 store 即可

async function main() {
  // TODO: 从 ingest 落库的数据里取候选市场，计算 pModel（用 Pyth 价 + 历史波动率），
  // 调用 crossMarketSignal 产出信号并落库。
  const signals = [];
  save("signals", signals);
  console.log(`[signals] 完成。signals=${signals.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

---

## 六、`services/narrator`（AI 情报卡 — 骨架）

### `services/narrator/src/prompt.ts`

```typescript
import type { Signal, IntelCard } from "@paa/shared";

export const SYSTEM_PROMPT = `你是资深加密衍生品交易员兼风险官。
你会收到一个结构化的市场信号（JSON）。请生成一段不超过 200 字的中文解读，
并给出显著的风险提示。

硬性约束：
- 只使用输入中提供的数据，绝不编造数字或事实。
- 明确标注这是研究/情报，不构成投资建议。
- 严格按给定 JSON schema 返回，不要输出多余文字。`;

export function buildUserPrompt(signal: Signal): string {
  return `信号数据：\n${JSON.stringify(signal, null, 2)}\n\n
请输出符合 IntelCard 结构的 JSON：
{
  "event": string,
  "marketRef": { "provider": string, "marketId": string },
  "signalType": string,
  "direction": string,
  "confidence": number,
  "evidence": string[],
  "historicalAnalog": string,
  "suggestedAction": string,
  "riskNotes": string,
  "generatedAt": number
}`;
}

export type NarratorOutput = IntelCard;
```

### `services/narrator/src/index.ts`

```typescript
import { config } from "./config.js"; // TODO: 与 ingest/config.ts 同构，读 LLM_* 变量
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import type { Signal, IntelCard } from "@paa/shared";

/**
 * TODO: 接一个兼容 OpenAI Chat Completions 的端点：
 *  POST ${LLM_BASE_URL}/chat/completions
 *  header: Authorization: Bearer ${LLM_API_KEY}
 *  body: { model: LLM_MODEL, messages: [...] }
 * 并对返回做 JSON 解析 + schema 校验，失败则重试一次。
 */
export async function narrate(signal: Signal): Promise<IntelCard> {
  void config;
  void SYSTEM_PROMPT;
  void buildUserPrompt;
  throw new Error("TODO: 实现 narrator");
}
```

---

## 七、`programs/alpha_desk`（Anchor 最小骨架）

### `programs/alpha_desk/Cargo.toml`

```plaintext
[package]
name = "alpha_desk"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]

[dependencies]
anchor-lang = "0.30.1"
# TODO: 版本请按官方 Version Compatibility Matrix 对齐（与 Solana CLI / Rust 一致）
```

### `programs/alpha_desk/src/lib.rs`

```rust
use anchor_lang::prelude::*;

// TODO: 用 `anchor keys list` 生成后替换
declare_id!("11111111111111111111111111111111");

#[program]
pub mod alpha_desk {
    use super::*;

    /// 注册一条信号（只存哈希 + 关键字段，保证可追溯）
    pub fn register_signal(
        ctx: Context<RegisterSignal>,
        signal_hash: [u8; 32],
        signal_type: u8,
        direction: i8,
        confidence_bps: u16,
    ) -> Result<()> {
        let rec = &mut ctx.accounts.signal;
        rec.authority = ctx.accounts.authority.key();
        rec.signal_hash = signal_hash;
        rec.signal_type = signal_type;
        rec.direction = direction;
        rec.confidence_bps = confidence_bps;
        rec.followers = 0;
        rec.outcome = 0;
        rec.created_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    /// 用户跟随某信号
    pub fn follow_signal(ctx: Context<FollowSignal>) -> Result<()> {
        let sig = &mut ctx.accounts.signal;
        let f = &mut ctx.accounts.follow;
        f.signal = sig.key();
        f.user = ctx.accounts.user.key();
        f.ts = Clock::get()?.unix_timestamp;
        sig.followers = sig.followers.saturating_add(1);
        Ok(())
    }

    /// 事件结算后写入结果，累积战绩
    pub fn record_outcome(ctx: Context<RecordOutcome>, outcome: i8) -> Result<()> {
        let rec = &mut ctx.accounts.signal;
        require_keys_eq!(rec.authority, ctx.accounts.authority.key());
        rec.outcome = outcome;
        Ok(())
    }
}

#[account]
pub struct SignalRecord {
    pub authority: Pubkey,      // 32
    pub signal_hash: [u8; 32],  // 32
    pub signal_type: u8,        // 1
    pub direction: i8,          // 1
    pub confidence_bps: u16,    // 2
    pub followers: u32,         // 4
    pub outcome: i8,            // 1
    pub created_at: i64,        // 8
}

#[account]
pub struct FollowRecord {
    pub signal: Pubkey, // 32
    pub user: Pubkey,   // 32
    pub ts: i64,        // 8
}

#[derive(Accounts)]
#[instruction(signal_hash: [u8; 32])]
pub struct RegisterSignal<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 1 + 1 + 2 + 4 + 1 + 8,
        seeds = [b"signal", authority.key().as_ref(), signal_hash.as_ref()],
        bump
    )]
    pub signal: Account<'info, SignalRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FollowSignal<'info> {
    #[account(mut)]
    pub signal: Account<'info, SignalRecord>,
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 32 + 8,
        seeds = [b"follow", signal.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub follow: Account<'info, FollowRecord>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordOutcome<'info> {
    #[account(mut)]
    pub signal: Account<'info, SignalRecord>,
    pub authority: Signer<'info>,
}
```

### `programs/alpha_desk/Anchor.toml`

```plaintext
[programs.devnet]
alpha_desk = "11111111111111111111111111111111"  # TODO: 替换为 deploy 后的 program id

[provider]
cluster = "devnet"
wallet = "~/.config/solana/id.json"
```

---

## 八、`apps/web`（Next.js 最小骨架）

### `apps/web/package.json`

```json
{
  "name": "@paa/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@paa/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/react": "^19.0.0",
    "@types/node": "^22.0.0"
  }
}
```

### `apps/web/src/app/page.tsx`

```typescript
import { load } from "../../../services/ingest/src/store.js"; // TODO: 改为读后端 API

export default function Home() {
  const signals = load<{ id: string; eventRef: { question: string } }>("signals");
  return (
    <main style={{ maxWidth: 760, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Prediction Alpha Agent</h1>
      <p>把预测市场与永续定价的分歧，变成可执行、可验证的信号。</p>
      <h2>信号列表</h2>
      {signals.length === 0 ? (
        <p style={{ color: "#888" }}>暂无信号。先运行 ingest 与 signals。</p>
      ) : (
        <ul>
          {signals.map((s) => (
            <li key={s.id}>{s.eventRef.question}</li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

> 钱包连接：按 Solana 官方 Agent Skill「Frontend with Solana Kit」接入 Wallet Standard，再用 `createOrder` 返回的未签名交易让用户签名。这一步建议让 AI 参照官方技能实现。

---

## 九、`README.md`（填好版）

```markdown
# Prediction Alpha Agent

把预测市场的隐含概率与永续合约的定价信息放在一起比对，自动发现系统性错价，输出可执行、可验证的 AI 信号。

## 演示
- 视频：TODO
- 在线 demo：TODO
- 截图：TODO

## 它做什么
1. 实时拉取预测市场（Polymarket / Kalshi，经 Jupiter Prediction API）与永续定价数据。
2. 用可解释的规则检测「两边定价分歧」，产出信号。
3. AI 生成一张情报卡（事件、依据、建议动作、风险）。
4. 用户一键「跟随」，记录写入 Solana 上的 AlphaDesk 程序，形成可验证的 AI 战绩。

## 架构
（贴 PRD 第四节的流程图）

## 快速开始
前置：Node 20+、pnpm、Rust + Solana CLI + Anchor

1. `git clone <repo> && cd prediction-alpha-agent`
2. `cp .env.example .env`，填入 `JUP_API_KEY`、`PYTH_API_KEY`、`RPC_URL`
3. `pnpm install`
4. `pnpm ingest`   # 拉取并落库数据
5. `pnpm signals`  # 产出信号
6. `pnpm web`      # 打开仪表盘

## 数据来源
Jupiter Prediction API · Pyth Price Feeds · Jupiter Perps / Drift

## 信号逻辑
- A 跨市场定价分歧（主力）：市场隐含概率 vs 模型概率的 z-score
- B 拥挤度预警：资金费率极值 + 情绪一边倒
- C 事件驱动未反应窗口：预测市场已跳变、永续未反应

## 链上
AlphaDesk Program（devnet）：TODO 程序地址

## 路线图 / 赛后计划
TODO：说明这个项目为什么不会停在 hackathon
```

---

## 十、开跑清单（TODO）

- [ ] `cp .env.example .env`，申请并填入 `JUP_API_KEY`（`developers.jup.ag/portal`）

- [ ] 确认 Pyth Hermes 的新端点与 API Key，补齐 `services/ingest/src/pyth.ts`

- [ ] 决定永续资金费率来源（Drift SDK 或解析 Perps IDL），补齐 `perp.ts`

- [ ] 让 AI 装官方 Solana Agent Skills，对齐 Anchor / Solana CLI / Rust / Node 版本

- [ ] 跑通官方 Bootcamp「Prediction Market」示例，再把本项目骨架叠上去

- [ ] `anchor build && anchor test`,devnet 部署 AlphaDesk

- [ ] 前端接 Wallet Standard，打通 `createOrder` 签名链路

---

需要的话，下一步我可以：**B** 起草招募帖 + build-in-public 首篇，或 **C** 把 3 分钟脚本扩写成逐镜台词。也可以先就这份脚手架给你逐文件讲解/微调。