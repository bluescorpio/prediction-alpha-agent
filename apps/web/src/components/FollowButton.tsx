"use client";

import { AnchorProvider, Program, type Idl, web3 } from "@coral-xyz/anchor";
import { useConnection } from "@solana/wallet-adapter-react";
import { useState } from "react";
import idlJson from "../lib/alpha_desk.idl.json";
import { useAnchorWallet } from "../lib/anchorWallet";

const idl = idlJson as Idl;

export function FollowButton({
  signalPda,
  followed,
  onFollowed,
}: {
  signalPda: string;
  followed: boolean;
  onFollowed: () => Promise<void>;
}) {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const [signing, setSigning] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const programIdRaw = process.env.NEXT_PUBLIC_PROGRAM_ID;
  const connected = anchorWallet !== null;

  async function follow() {
    if (!anchorWallet || !programIdRaw || signing || followed) return;
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
      await onFollowed();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSigning(false);
    }
  }

  const disabled = !connected || !programIdRaw || signing || followed;

  return (
    <div style={{ marginTop: 12 }}>
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
        {followed ? "已跟随" : signing ? "签名中…" : "跟随"}
      </button>
      {!programIdRaw ? <p style={{ color: "#a33" }}>缺少 NEXT_PUBLIC_PROGRAM_ID</p> : null}
      {!connected ? <p style={{ color: "#888" }}>请先连接钱包</p> : null}
      {signature ? <p>tx：{signature}</p> : null}
      {error ? <p style={{ color: "#a33" }}>{error}</p> : null}
    </div>
  );
}
