"use client";

import { useMemo } from "react";
import { useChainState } from "../lib/useChainState";
import { useAnchorWallet } from "../lib/anchorWallet";
import { FollowButton } from "./FollowButton";

export type BoardSignal = {
  id: string;
  question: string;
  direction: string;
  confidence: number;
  evidence: string[];
  suggestedAction?: string;
  riskNotes?: string;
  signalPda?: string;
};

export function SignalBoard({ signals }: { signals: BoardSignal[] }) {
  const anchorWallet = useAnchorWallet();
  const connected = anchorWallet !== null;
  const signalPdas = useMemo(
    () => signals.flatMap((signal) => (signal.signalPda ? [signal.signalPda] : [])),
    [signals],
  );
  const { byPda, myFollowed, error, refresh } = useChainState(signalPdas);
  const followedSignals = signals.filter(
    (signal) => signal.signalPda !== undefined && myFollowed.has(signal.signalPda),
  );

  return (
    <>
      <section style={{ margin: "24px 0" }}>
        <h2>我已跟随的信号</h2>
        {!connected ? (
          <p style={{ color: "#888" }}>请先连接钱包</p>
        ) : followedSignals.length === 0 ? (
          <p style={{ color: "#888" }}>当前钱包还没有跟随信号</p>
        ) : (
          <ul>
            {followedSignals.map((signal) => (
              <li key={signal.id}>{signal.question}</li>
            ))}
          </ul>
        )}
        {error ? <p style={{ color: "#a33" }}>{error}</p> : null}
      </section>
      <h2>信号列表</h2>
      {signals.map((signal) => {
        const chain = signal.signalPda ? byPda[signal.signalPda] : undefined;
        return (
          <article
            key={signal.id}
            style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 }}
          >
            <h3 style={{ marginTop: 0 }}>{signal.question}</h3>
            <p>direction：{signal.direction}</p>
            <p>confidence：{signal.confidence}</p>
            <ul>
              {signal.evidence.map((item, index) => (
                <li key={`${signal.id}-${index}`}>{item}</li>
              ))}
            </ul>
            {signal.suggestedAction ? <p>suggestedAction：{signal.suggestedAction}</p> : null}
            {signal.riskNotes ? <p>riskNotes：{signal.riskNotes}</p> : null}
            <p>链上 followers：{signal.signalPda ? (chain ? chain.followers : "…") : "未上链"}</p>
            <p>链上 outcome：{signal.signalPda ? (chain ? chain.outcome : "…") : "未上链"}</p>
            {signal.signalPda ? (
              <FollowButton
                signalPda={signal.signalPda}
                followed={myFollowed.has(signal.signalPda)}
                onFollowed={refresh}
              />
            ) : null}
          </article>
        );
      })}
    </>
  );
}
