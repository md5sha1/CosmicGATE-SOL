import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { GateStakingReward } from "../target/types/gate_staking_reward";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

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

  const [rewardPool] = PublicKey.findProgramAddressSync([Buffer.from("reward_pool")], program.programId);
  gateMint = new PublicKey("AaTtdiALQ2QUchCAXP49VEsCTtQrj2TJtVzh8LghZSkb");
  minterATA = getAssociatedTokenAddressSync(gateMint, minter.publicKey);
  const rpoolATA = getAssociatedTokenAddressSync(gateMint, rewardPool, true);
  const mintAmount = new BN(5e7);

  await program.methods
    .chargeReward(mintAmount)
    .accountsPartial({
      charger: minter.publicKey,
      gateMint,
      rewardPool,
      rpoolTokenAccount: rpoolATA,
      chargerTokenAccount: minterATA,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([minter])
    .rpc();

  const rpool = await program.account.rewardPool.fetch(rewardPool);
  console.log(rpool.amount.toString());
  const rpoolBalance = await getAccount(provider.connection, rpoolATA);
  console.log(rpoolBalance.amount.toString());
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ script failed:", err);
    process.exit(1);
  });
