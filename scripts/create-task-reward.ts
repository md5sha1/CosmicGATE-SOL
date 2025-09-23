import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { GateStakingReward } from "../target/types/gate_staking_reward";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";

async function main() {
  // Configure client to use the provider.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const admin = provider.wallet;
  console.log("Cluster:", provider.connection.rpcEndpoint);

  const program = anchor.workspace.gateStakingReward as Program<GateStakingReward>;

  let gateMint: PublicKey;

  const minter = admin.payer;

  let minterATA: PublicKey;

  const taskId = new BN(1);
  const [rewardPool] = PublicKey.findProgramAddressSync([Buffer.from("reward_pool")], program.programId);
  const [orchestratorPDA] = PublicKey.findProgramAddressSync([Buffer.from("orchestrator")], program.programId);
  const [taskPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("task"), taskId.toArrayLike(Buffer, "le", 8)],
    program.programId
  );
  gateMint = new PublicKey("AaTtdiALQ2QUchCAXP49VEsCTtQrj2TJtVzh8LghZSkb");
  minterATA = getAssociatedTokenAddressSync(gateMint, minter.publicKey);
  const rpoolATA = getAssociatedTokenAddressSync(gateMint, rewardPool, true);

  const [creatorPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("creator"), minter.publicKey.toBuffer()],
    program.programId
  );

  const ix = await program.methods
    .createTaskReward(taskId)
    .accountsPartial({
      creatorInfo: minter.publicKey,
      orchestrator: orchestratorPDA,
      creator: creatorPDA,
      task: taskPDA,
      gateMint,
      rewardPool,
      rpoolTokenAccount: rpoolATA,
      userTokenAccount: minterATA,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .instruction();

  let tx = new Transaction().add(ix);
  tx.partialSign(minter);

  const backendProvider = new anchor.AnchorProvider(provider.connection, minter, {
    commitment: "confirmed",
  });
  const backend = Keypair.generate();
  tx = await new anchor.Wallet(backend).signTransaction(tx);
  const txSig = await backendProvider.connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  const latestBlockhash = await backendProvider.connection.getLatestBlockhash();
  await backendProvider.connection.confirmTransaction(
    {
      signature: txSig,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed"
  );
  const txHash = await backendProvider.sendAndConfirm(tx);
  console.log("Transaction hash:", txHash);

  const task = await program.account.task.fetch(taskPDA);
  console.log(task.completed);
  console.log(task.creator.toString());
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ script failed:", err);
    process.exit(1);
  });
