import { PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("51DFYj5Evdk3TnbipTmscxwt4HvJiYq5d3cfdriEEvqm");

const [treasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("treasury")],
  PROGRAM_ID
);

console.log("=== Treasury Information ===");
console.log("Program ID:", PROGRAM_ID.toBase58());
console.log("Treasury PDA:", treasuryPda.toBase58());
console.log("");
console.log("⚠️  IMPORTANT: Do NOT send tGATE directly to the Treasury PDA!");
console.log("   Instead, you must use fundMatchPool() after initializing treasury.");
console.log("");
console.log("The flow is:");
console.log("1. initTreasury() - creates the treasury");
console.log("2. createMatchPool(matchId) - creates a match");
console.log("3. fundMatchPool(matchId, amount) - transfers YOUR tGATE to treasury");




