"use client";

import type { AnchorProvider } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";

type AnchorWallet = ConstructorParameters<typeof AnchorProvider>[1];

// 未连接时返回 null。签名函数直接透传 wallet-adapter，不在这里实现签名。
export function useAnchorWallet(): AnchorWallet | null {
  const { connection } = useConnection();
  const { wallet, publicKey, signTransaction, signAllTransactions } = useWallet();

  return useMemo(() => {
    if (!connection || !wallet || !publicKey || !signTransaction || !signAllTransactions) {
      return null;
    }
    return { publicKey, signTransaction, signAllTransactions };
  }, [connection, wallet, publicKey, signTransaction, signAllTransactions]);
}
