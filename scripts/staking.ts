import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
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

  const bob = admin.payer;

  let bobATA: PublicKey;

  const [rewardPool] = PublicKey.findProgramAddressSync([Buffer.from("reward_pool")], program.programId);
  const [orchestratorPDA] = PublicKey.findProgramAddressSync([Buffer.from("orchestrator")], program.programId);

  gateMint = new PublicKey("AaTtdiALQ2QUchCAXP49VEsCTtQrj2TJtVzh8LghZSkb");
  bobATA = getAssociatedTokenAddressSync(gateMint, bob.publicKey);

  const [stakePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("stake"), bob.publicKey.toBuffer()],
    program.programId
  );
  const stakeATA = getAssociatedTokenAddressSync(gateMint, stakePDA, true);

  const stakeAmount = new BN(5e6);

  await program.methods
    .stake(stakeAmount, new BN(30))
    .accountsPartial({
      operator: bob.publicKey,
      orchestrator: orchestratorPDA,
      stake: stakePDA,
      gateMint,
      stakeTokenAccount: stakeATA,
      userTokenAccount: bobATA,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([bob])
    .rpc();

  const stake = await program.account.stake.fetch(stakePDA);
  console.log(stake.amount.toString());
  console.log(stake.active);
  console.log(stakePDA.toBase58());
  console.log(stakeATA.toBase58());
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ script failed:", err);
    process.exit(1);
  });
