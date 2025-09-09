import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { GateStakingReward } from "../target/types/gate_staking_reward";

async function main() {
  // Configure client to use the provider.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const admin = provider.wallet;
  console.log("Cluster:", provider.connection.rpcEndpoint);

  const program = anchor.workspace.gateStakingReward as Program<GateStakingReward>;

  const [orchestratorPDA] = PublicKey.findProgramAddressSync([Buffer.from("orchestrator")], program.programId);

  await program.methods
    .initialize()
    .accountsPartial({
      admin: admin.publicKey,
      orchestrator: orchestratorPDA,
      systemProgram: SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([admin.payer])
    .rpc();

  const orchestrator = await program.account.orchestrator.fetch(orchestratorPDA);
  console.log(orchestrator);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ script failed:", err);
    process.exit(1);
  });
