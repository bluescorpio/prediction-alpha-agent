import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { request as httpRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import type { Socket } from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AnchorProvider, Program, type Idl, web3 } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet.js";

const PROGRAM_ID = "5L7SHJT5uK59tFyYNzuA7qrGorxyEwcXur4Gi28HhyYh";

const SIGNAL_TYPE: Record<string, number> = {
  cross_market_divergence: 0,
  crowding_warning: 1,
  unreacted_window: 2,
};

const DIRECTION: Record<string, number> = {
  pm_overpriced: 1,
  pm_underpriced: -1,
};

interface OnchainRef {
  signalPda: string;
  authority: string;
  signalHashHex: string;
}

interface SignalRow {
  id: string;
  type: string;
  direction: string;
  confidence: number;
  onchain?: OnchainRef;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function proxyUrl(): string {
  return (
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    ""
  );
}

function readResponse(res: IncomingMessage): Promise<Response> {
  return new Promise((resolveResponse, reject) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () => {
      resolveResponse(
        new Response(Buffer.concat(chunks), { status: res.statusCode ?? 500 }),
      );
    });
    res.on("error", reject);
  });
}

// Node 自带 fetch 不读 HTTPS_PROXY，devnet 在代理后会直接失败。
function headerRecord(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value;
    return out;
  }
  for (const [key, value] of Object.entries(headers)) out[key] = value;
  return out;
}

function fetchThroughProxy(proxy: string): typeof fetch {
  const proxyEndpoint = new URL(proxy);
  return (input, init) => {
    const raw =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(raw);
    const method = init?.method ?? "GET";
    const headers = headerRecord(init?.headers);
    const body = init?.body == null ? undefined : Buffer.from(init.body as string);

    if (url.protocol === "https:") {
      return new Promise((resolveResponse, reject) => {
        const connect = httpRequest({
          host: proxyEndpoint.hostname,
          port: proxyEndpoint.port,
          method: "CONNECT",
          path: `${url.hostname}:${url.port || 443}`,
        });
        connect.on("connect", (res, socket) => {
          if (res.statusCode !== 200) {
            reject(new Error(`代理 CONNECT 失败：${res.statusCode}`));
            socket.destroy();
            return;
          }
          const options: RequestOptions & { socket: Socket; agent: false } = {
            hostname: url.hostname,
            path: `${url.pathname}${url.search}`,
            method,
            headers,
            socket,
            agent: false,
          };
          const req = httpsRequest(options, (response) => {
            readResponse(response).then(resolveResponse, reject);
          });
          req.on("error", reject);
          if (body) req.write(body);
          req.end();
        });
        connect.on("error", reject);
        connect.end();
      });
    }

    return new Promise((resolveResponse, reject) => {
      const req = httpRequest(
        {
          host: proxyEndpoint.hostname,
          port: proxyEndpoint.port,
          method,
          path: url.toString(),
          headers,
        },
        (response) => {
          readResponse(response).then(resolveResponse, reject);
        },
      );
      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    });
  };
}

function walletPath(): string {
  const raw = process.env.ANCHOR_WALLET ?? join(homedir(), ".config/solana/id.json");
  if (raw === "~") return homedir();
  if (raw.startsWith("~/")) return join(homedir(), raw.slice(2));
  return raw;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function hashSignal(signal: SignalRow): Buffer {
  const { onchain: _onchain, ...rest } = signal;
  return createHash("sha256").update(stableStringify(rest)).digest();
}

function requireMapped(table: Record<string, number>, kind: string, value: string): number {
  const mapped = table[value];
  if (mapped === undefined) throw new Error(`无法映射 ${kind}=${value}`);
  return mapped;
}

async function main(): Promise<void> {
  loadEnvFile(join(repoRoot, ".env"));
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("缺少环境变量 RPC_URL");

  const idlPath = join(repoRoot, "target/idl/alpha_desk.json");
  if (!existsSync(idlPath)) {
    throw new Error("缺少 target/idl/alpha_desk.json，请先运行 anchor build");
  }
  const idl = JSON.parse(readFileSync(idlPath, "utf8")) as Idl & { address?: string };
  if (idl.address !== PROGRAM_ID) {
    throw new Error(`IDL 程序地址是 ${idl.address ?? "空"}，期望 ${PROGRAM_ID}`);
  }

  const secret = Uint8Array.from(JSON.parse(readFileSync(walletPath(), "utf8")) as number[]);
  const wallet = new NodeWallet(web3.Keypair.fromSecretKey(secret));
  const proxy = proxyUrl();
  const connection = new web3.Connection(rpcUrl, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 90_000,
    fetch: proxy ? fetchThroughProxy(proxy) : undefined,
  });
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program(idl, provider);
  const programId = new web3.PublicKey(PROGRAM_ID);

  const signalsPath = join(repoRoot, ".data/signals.json");
  const signals = JSON.parse(readFileSync(signalsPath, "utf8")) as SignalRow[];

  for (const signal of signals) {
    const hash = hashSignal(signal);
    const signalType = requireMapped(SIGNAL_TYPE, "signalType", signal.type);
    const direction = requireMapped(DIRECTION, "direction", signal.direction);
    const confidenceBps = Math.round(signal.confidence * 10_000);
    const [signalPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("signal"), wallet.publicKey.toBuffer(), hash],
      programId,
    );
    const existing = await connection.getAccountInfo(signalPda);
    if (!existing) {
      try {
        await program.methods
          .registerSignal(Array.from(hash), signalType, direction, confidenceBps)
          .accountsPartial({
            signal: signalPda,
            authority: wallet.publicKey,
            systemProgram: web3.SystemProgram.programId,
          })
          .rpc();
      } catch (error) {
        const landed = await connection.getAccountInfo(signalPda);
        if (!landed) throw error;
      }
    }
    signal.onchain = {
      signalPda: signalPda.toBase58(),
      authority: wallet.publicKey.toBase58(),
      signalHashHex: hash.toString("hex"),
    };
    console.log(signalPda.toBase58());
  }

  writeFileSync(signalsPath, `${JSON.stringify(signals, null, 2)}\n`);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("[seed] 失败:", error);
  process.exit(1);
});
