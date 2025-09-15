import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { createApproveInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";

async function main() {
  // Configure client to use the provider.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const admin = provider.wallet;
  console.log("Cluster:", provider.connection.rpcEndpoint);

  const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const adminATA = getAssociatedTokenAddressSync(USDC_MINT, admin.publicKey);
  const delegatee = new PublicKey("..");

  const approveInstruction = createApproveInstruction(
    adminATA,
    delegatee,
    admin.publicKey,
    1e10 // 10,000 USDC
  );

  const tx = new Transaction();
  tx.add(approveInstruction);
  await provider.sendAndConfirm(tx, [admin.payer]);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ script failed:", err);
    process.exit(1);
  });
