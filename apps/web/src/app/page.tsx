import { headers } from "next/headers";
import type { IntelCard, Signal } from "@paa/shared";
import { WalletPanel } from "../components/WalletPanel";

function matchIntelCard(signal: Signal, intelCards: IntelCard[]): IntelCard | undefined {
  return intelCards.find(
    (card) =>
      card.marketRef.marketId === signal.eventRef.marketId &&
      card.marketRef.provider === signal.eventRef.provider,
  );
}

async function loadFeed(): Promise<{ signals: Signal[]; intelCards: IntelCard[] }> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) {
    throw new Error("无法确定当前站点地址，不能请求 /api/signals");
  }
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  const base = process.env.NEXT_PUBLIC_BASE_URL;
  const url = new URL("/api/signals", base && base.length > 0 ? base : `${proto}://${host}`);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`读取 /api/signals 失败：${response.status}`);
  }
  return (await response.json()) as { signals: Signal[]; intelCards: IntelCard[] };
}

export default async function Home() {
  const { signals, intelCards } = await loadFeed();
  return (
    <main style={{ maxWidth: 760, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Prediction Alpha Agent</h1>
      <p>把预测市场与永续定价的分歧，变成可执行、可验证的信号。</p>
      <WalletPanel />
      <h2>信号列表</h2>
      {signals.length === 0 ? (
        <p style={{ color: "#888" }}>暂无数据，先运行 pnpm signals 与 pnpm narrate</p>
      ) : (
        signals.map((signal) => {
          const card = matchIntelCard(signal, intelCards);
          return (
            <article
              key={signal.id}
              style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 }}
            >
              <h3 style={{ marginTop: 0 }}>{signal.eventRef.question}</h3>
              <p>direction：{signal.direction}</p>
              <p>confidence：{signal.confidence}</p>
              <ul>
                {signal.evidence.map((item, index) => (
                  <li key={`${signal.id}-${index}`}>{item}</li>
                ))}
              </ul>
              {card ? (
                <>
                  <p>suggestedAction：{card.suggestedAction}</p>
                  <p>riskNotes：{card.riskNotes}</p>
                </>
              ) : null}
            </article>
          );
        })
      )}
    </main>
  );
}
