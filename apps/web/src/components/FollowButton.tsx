"use client";

import { AnchorProvider, BorshAccountsCoder, Program, type Idl, web3 } from "@coral-xyz/anchor";
import { useConnection } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useState } from "react";
import idlJson from "../lib/alpha_desk.idl.json";
import { useAnchorWallet } from "../lib/anchorWallet";

const idl = idlJson as Idl;

function asNumber(value: number | { toNumber: () => number }): number {
  return typeof value === "number" ? value : value.toNumber();
}

async function readFollowers(connection: web3.Connection, signalPda: string): Promise<number> {
  const info = await connection.getAccountInfo(new web3.PublicKey(signalPda), "confirmed");
  if (!info) return 0;
  const decoded = new BorshAccountsCoder(idl).decode("SignalRecord", info.data) as {
    followers: number | { toNumber: () => number };
  };
  return asNumber(decoded.followers);
}

export function FollowButton({ signalPda }: { signalPda: string }) {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const [followers, setFollowers] = useState<number | null>(null);
  const [signing, setSigning] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const programIdRaw = process.env.NEXT_PUBLIC_PROGRAM_ID;
  const connected = anchorWallet !== null;

  const refreshFollowers = useCallback(async () => {
    setFollowers(await readFollowers(connection, signalPda));
  }, [connection, signalPda]);

  useEffect(() => {
    let cancelled = false;
    readFollowers(connection, signalPda)
      .then((count) => {
        if (!cancelled) setFollowers(count);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [connection, signalPda]);

  async function follow() {
    if (!anchorWallet || !programIdRaw || signing || signature) return;
    setSigning(true);
    setError(null);
    try {
      const programId = new web3.PublicKey(programIdRaw);
      const user = anchorWallet.publicKey;
      const signalKey = new web3.PublicKey(signalPda);
      const [followPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("follow"), signalKey.toBuffer(), user.toBuffer()],
        programId,
      );
      const provider = new AnchorProvider(connection, anchorWallet, { commitment: "confirmed" });
      const program = new Program({ ...idl, address: programId.toBase58() }, provider);
      const tx = await program.methods
        .followSignal()
        .accounts({
          signal: signalKey,
          follow: followPda,
          user,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed" });
      setSignature(tx);
      await refreshFollowers();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSigning(false);
    }
  }

  const disabled = !connected || !programIdRaw || signing || signature !== null;

  return (
    <div style={{ marginTop: 12 }}>
      <p>followers：{followers ?? "…"}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          void follow();
        }}
        style={{
          padding: "8px 16px",
          background: disabled ? "#ccc" : "#111",
          color: disabled ? "#666" : "#fff",
          border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {signature ? "已跟随" : signing ? "签名中…" : "跟随"}
      </button>
      {!programIdRaw ? <p style={{ color: "#a33" }}>缺少 NEXT_PUBLIC_PROGRAM_ID</p> : null}
      {!connected ? <p style={{ color: "#888" }}>请先连接钱包</p> : null}
      {signature ? <p>tx：{signature}</p> : null}
      {error ? <p style={{ color: "#a33" }}>{error}</p> : null}
    </div>
  );
}
