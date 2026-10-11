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
    </section>
  );
}
