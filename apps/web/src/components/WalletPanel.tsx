"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useAnchorWallet } from "../lib/anchorWallet";

export function WalletPanel() {
  const anchorWallet = useAnchorWallet();
  const connected = anchorWallet !== null;

  return (
    <section style={{ margin: "24px 0" }}>
      <WalletMultiButton />
      {connected ? (
        <p>{anchorWallet.publicKey.toString()}</p>
      ) : (
        <p>请先连接钱包</p>
      )}
      <button
        type="button"
        disabled={!connected}
        onClick={() => {
          if (!anchorWallet) return;
          console.log(anchorWallet.publicKey.toString());
          window.alert("跟随尚未上链");
        }}
        style={{
          marginTop: 8,
          padding: "8px 16px",
          background: connected ? "#111" : "#ccc",
          color: connected ? "#fff" : "#666",
          border: "none",
          cursor: connected ? "pointer" : "not-allowed",
        }}
      >
        跟随
      </button>
    </section>
  );
}
