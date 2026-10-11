"use client";

import { AnchorProvider, Program, type Idl, web3 } from "@coral-xyz/anchor";
import { useConnection } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useRef, useState } from "react";
import idlJson from "./alpha_desk.idl.json";
import { useAnchorWallet } from "./anchorWallet";

const idl = idlJson as Idl;

export type ChainSignalState = {
  followers: number;
  outcome: number;
};

type SignalAccount = {
  followers: number | { toNumber: () => number };
  outcome: number | { toNumber: () => number };
};

type ReadonlyProgram = {
  account: {
    signalRecord: {
      fetchMultiple: (
        addresses: web3.PublicKey[],
        commitment?: web3.Commitment,
      ) => Promise<Array<SignalAccount | null>>;
    };
    followRecord: {
      fetchNullable: (
        address: web3.PublicKey,
        commitment?: web3.Commitment,
      ) => Promise<unknown | null>;
    };
  };
};

type AnchorWallet = ConstructorParameters<typeof AnchorProvider>[1];

// 只读桩：查询账户不需要签名。签名函数一旦被调用就直接失败。
const readonlyWallet: AnchorWallet = {
  publicKey: web3.SystemProgram.programId,
  signTransaction: async () => {
    throw new Error("只读查询，不签名");
  },
  signAllTransactions: async () => {
    throw new Error("只读查询，不签名");
  },
};

function asNumber(value: number | { toNumber: () => number }): number {
  return typeof value === "number" ? value : value.toNumber();
}

function createReadonlyProgram(connection: web3.Connection, programId: web3.PublicKey): ReadonlyProgram {
  const provider = new AnchorProvider(connection, readonlyWallet, { commitment: "confirmed" });
  return new Program({ ...idl, address: programId.toBase58() }, provider) as unknown as ReadonlyProgram;
}

async function readSignalRecords(
  program: ReadonlyProgram,
  signalPdas: string[],
): Promise<Record<string, ChainSignalState>> {
  if (signalPdas.length === 0) return {};
  const records = await program.account.signalRecord.fetchMultiple(
    signalPdas.map((pda) => new web3.PublicKey(pda)),
    "confirmed",
  );
  const byPda: Record<string, ChainSignalState> = {};
  records.forEach((record, index) => {
    const pda = signalPdas[index];
    if (!record || !pda) return;
    byPda[pda] = {
      followers: asNumber(record.followers),
      outcome: asNumber(record.outcome),
    };
  });
  return byPda;
}

async function readMyFollowed(
  program: ReadonlyProgram,
  programId: web3.PublicKey,
  user: web3.PublicKey,
  signalPdas: string[],
): Promise<Set<string>> {
  const followed = new Set<string>();
  await Promise.all(
    signalPdas.map(async (signalPda) => {
      const signalKey = new web3.PublicKey(signalPda);
      const [followPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("follow"), signalKey.toBuffer(), user.toBuffer()],
        programId,
      );
      const record = await program.account.followRecord.fetchNullable(followPda, "confirmed");
      if (record) followed.add(signalPda);
    }),
  );
  return followed;
}

export function useChainState(signalPdas: string[]): {
  byPda: Record<string, ChainSignalState>;
  myFollowed: Set<string>;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const userKey = anchorWallet?.publicKey.toBase58() ?? null;
  const pdasKey = signalPdas.join("\n");
  const programIdRaw = process.env.NEXT_PUBLIC_PROGRAM_ID;
  const requestId = useRef(0);
  const [byPda, setByPda] = useState<Record<string, ChainSignalState>>({});
  const [myFollowed, setMyFollowed] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const pdas = pdasKey.length === 0 ? [] : pdasKey.split("\n");
      if (!programIdRaw) {
        throw new Error("缺少 NEXT_PUBLIC_PROGRAM_ID");
      }
      const programId = new web3.PublicKey(programIdRaw);
      const program = createReadonlyProgram(connection, programId);
      const nextByPda = await readSignalRecords(program, pdas);
      // 未连接钱包时不派生、不读取 follow 账户。
      const nextFollowed = userKey
        ? await readMyFollowed(program, programId, new web3.PublicKey(userKey), pdas)
        : new Set<string>();
      if (id !== requestId.current) return;
      setByPda(nextByPda);
      setMyFollowed(nextFollowed);
      setError(null);
    } catch (cause: unknown) {
      if (id !== requestId.current) return;
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      throw cause instanceof Error ? cause : new Error(message);
    }
  }, [connection, pdasKey, programIdRaw, userKey]);

  useEffect(() => {
    void refresh().catch(() => {
      // 错误已经写入 error，连接或钱包变化时会再拉一次。
    });
    return () => {
      requestId.current += 1;
    };
  }, [refresh]);

  return { byPda, myFollowed, error, refresh };
}
