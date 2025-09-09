import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { GateStakingReward } from "../target/types/gate_staking_reward";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";

async function main() {
  // const connection = new Connection("https://api.devnet.solana.com");
  // const recentBlockhash = await connection.getLatestBlockhash();
  // console.log(recentBlockhash);

  // Configure client to use the provider.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const admin = provider.wallet;
  console.log("Cluster:", provider.connection.rpcEndpoint);

  const program = anchor.workspace.gateStakingReward as Program<GateStakingReward>;

  let gateMint: PublicKey;

  const bob = admin.payer;

  let bobATA: PublicKey;

  const taskId = new BN(1);
  const [rewardPool] = PublicKey.findProgramAddressSync([Buffer.from("reward_pool")], program.programId);
  const [orchestratorPDA] = PublicKey.findProgramAddressSync([Buffer.from("orchestrator")], program.programId);
  const [taskPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("task"), taskId.toArrayLike(Buffer, "le", 8)],
    program.programId
  );
  gateMint = new PublicKey("AaTtdiALQ2QUchCAXP49VEsCTtQrj2TJtVzh8LghZSkb");
  bobATA = getAssociatedTokenAddressSync(gateMint, bob.publicKey);
  const rpoolATA = getAssociatedTokenAddressSync(gateMint, rewardPool, true);

  const [nodePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("node"), bob.publicKey.toBuffer()],
    program.programId
  );

  await program.methods
    .submitTaskReward(taskId)
    .accountsPartial({
      operator: bob.publicKey,
      orchestrator: orchestratorPDA,
      node: nodePDA,
      task: taskPDA,
      gateMint,
      rewardPool,
      rpoolTokenAccount: rpoolATA,
      userTokenAccount: bobATA,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([bob])
    .rpc();

  const task = await program.account.task.fetch(taskPDA);
  console.log(task.completed);
  console.log(task.operator.toString());
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ script failed:", err);
    process.exit(1);
  });
