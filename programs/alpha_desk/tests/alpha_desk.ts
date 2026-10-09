import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { AlphaDesk } from "../../../target/types/alpha_desk";

function asNumber(value: number | anchor.BN): number {
  return typeof value === "number" ? value : value.toNumber();
}

describe("alpha_desk", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AlphaDesk as Program<AlphaDesk>;
  const authority = provider.wallet;
  const follower = anchor.web3.Keypair.generate();
  const signalHash = Array.from({ length: 32 }, (_, index) => index + 1);

  const [signalPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("signal"), authority.publicKey.toBuffer(), Buffer.from(signalHash)],
    program.programId,
  );
  const [followPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("follow"), signalPda.toBuffer(), follower.publicKey.toBuffer()],
    program.programId,
  );

  before(async () => {
    const signature = await provider.connection.requestAirdrop(follower.publicKey, 1_000_000_000);
    const latest = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction(
      { signature, ...latest },
      "confirmed",
    );
  });

  it("register_signal 写入 SignalRecord", async () => {
    await program.methods
      .registerSignal(signalHash, 1, 1, 7200)
      .accountsPartial({
        signal: signalPda,
        authority: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const record = await program.account.signalRecord.fetch(signalPda);
    assert.ok(record.authority.equals(authority.publicKey));
    assert.deepEqual(Array.from(record.signalHash), signalHash);
    assert.equal(record.signalType, 1);
    assert.equal(record.direction, 1);
    assert.equal(record.confidenceBps, 7200);
    assert.equal(asNumber(record.followers), 0);
    assert.equal(record.outcome, 0);
    assert.ok(asNumber(record.createdAt) > 0);
  });

  it("follow_signal 写入 FollowRecord 且 followers +1", async () => {
    await program.methods
      .followSignal()
      .accountsPartial({
        signal: signalPda,
        follow: followPda,
        user: follower.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([follower])
      .rpc();

    const follow = await program.account.followRecord.fetch(followPda);
    const signal = await program.account.signalRecord.fetch(signalPda);
    assert.ok(follow.signal.equals(signalPda));
    assert.ok(follow.user.equals(follower.publicKey));
    assert.ok(asNumber(follow.ts) > 0);
    assert.equal(asNumber(signal.followers), 1);
  });

  it("record_outcome 只允许 authority 写入", async () => {
    try {
      await program.methods
        .recordOutcome(1)
        .accountsPartial({
          signal: signalPda,
          authority: follower.publicKey,
        })
        .signers([follower])
        .rpc();
      assert.fail("非 authority 调用应失败");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assert.include(message, "RequireKeysEq");
    }

    await program.methods
      .recordOutcome(1)
      .accountsPartial({
        signal: signalPda,
        authority: authority.publicKey,
      })
      .rpc();

    const record = await program.account.signalRecord.fetch(signalPda);
    assert.equal(record.outcome, 1);
    assert.ok(record.authority.equals(authority.publicKey));
  });
});
