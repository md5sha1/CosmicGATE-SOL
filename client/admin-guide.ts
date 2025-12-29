/**
 * CosmicGATE NFT Prediction Staking - Admin Guide
 * 
 * This script shows how to:
 * 1. Initialize treasury with your REAL tGATE token
 * 2. Create prediction match pools
 * 3. Fund match pools with tGATE prizes
 * 4. Resolve matches
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { NftPredictionStakeV1 } from "../target/types/nft_prediction_stake_v1";
import {
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";

// ===========================================
// CONFIGURATION - CHANGE THESE VALUES
// ===========================================

// Your REAL tGATE token mint address
const TGATE_MINT = new PublicKey("AaTtdiALQ2QUchCAXP49VEsCTtQrj2TJtVzh8LghZSkb");

// Your program ID (deployed on devnet)
const PROGRAM_ID = new PublicKey("51DFYj5Evdk3TnbipTmscxwt4HvJiYq5d3cfdriEEvqm");

// ===========================================
// SETUP
// ===========================================

async function main() {
  // Connect to devnet
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.nftPredictionStakeV1 as Program<NftPredictionStakeV1>;
  const admin = provider.wallet;

  console.log("=== CosmicGATE Admin Panel ===");
  console.log("Admin wallet:", admin.publicKey.toBase58());
  console.log("Program ID:", program.programId.toBase58());
  console.log("tGATE Mint:", TGATE_MINT.toBase58());

  // Derive treasury PDA
  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    program.programId
  );
  console.log("\nTreasury PDA:", treasuryPda.toBase58());

  // Check if treasury exists
  const treasuryInfo = await provider.connection.getAccountInfo(treasuryPda);
  
  if (treasuryInfo) {
    const treasury = await program.account.treasury.fetch(treasuryPda);
    console.log("\n⚠️  Treasury already exists!");
    console.log("   Admin:", treasury.admin.toBase58());
    console.log("   Gate Mint:", treasury.gateMint.toBase58());
    
    if (!treasury.gateMint.equals(TGATE_MINT)) {
      console.log("\n❌ Treasury was initialized with a DIFFERENT token!");
      console.log("   To use your real tGATE, you need to deploy a new program.");
      return;
    }
  } else {
    console.log("\n✅ Treasury not initialized yet. You can initialize it!");
  }
}

// ===========================================
// ADMIN FUNCTIONS
// ===========================================

/**
 * Step 1: Initialize Treasury (ONLY DO THIS ONCE!)
 * This sets YOUR tGATE token as the reward token
 */
async function initializeTreasury() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.nftPredictionStakeV1 as Program<NftPredictionStakeV1>;
  const admin = (provider.wallet as anchor.Wallet).payer;

  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    program.programId
  );

  const treasuryGateAta = getAssociatedTokenAddressSync(
    TGATE_MINT,
    treasuryPda,
    true // allowOwnerOffCurve for PDA
  );

  console.log("Initializing treasury with tGATE:", TGATE_MINT.toBase58());

  const tx = await program.methods
    .initTreasury()
    .accountsStrict({
      treasury: treasuryPda,
      gateMint: TGATE_MINT,
      treasuryGateAta: treasuryGateAta,
      admin: admin.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("✅ Treasury initialized!");
  console.log("   Transaction:", tx);
  console.log("   Treasury PDA:", treasuryPda.toBase58());
  console.log("   Treasury tGATE ATA:", treasuryGateAta.toBase58());
}

/**
 * Step 2: Create a Match Pool
 * Call this for each esports match you want to create
 */
async function createMatchPool(matchId: number, maxNftsPerUser: number = 3) {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.nftPredictionStakeV1 as Program<NftPredictionStakeV1>;
  const admin = (provider.wallet as anchor.Wallet).payer;

  const matchIdBN = new BN(matchId);
  
  const [matchPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  console.log(`Creating match pool #${matchId}...`);

  const tx = await program.methods
    .initMatchPool(matchIdBN, maxNftsPerUser)
    .accountsStrict({
      matchPool: matchPoolPda,
      admin: admin.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Match pool created!");
  console.log("   Match ID:", matchId);
  console.log("   Match Pool PDA:", matchPoolPda.toBase58());
  console.log("   Max NFTs per user:", maxNftsPerUser);
  console.log("   Transaction:", tx);
  
  return matchPoolPda;
}

/**
 * Step 3: Fund a Match Pool with tGATE prizes
 * You need tGATE in your wallet to do this
 */
async function fundMatchPool(matchId: number, amountTGATE: number) {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.nftPredictionStakeV1 as Program<NftPredictionStakeV1>;
  const admin = (provider.wallet as anchor.Wallet).payer;

  const matchIdBN = new BN(matchId);
  const amount = new BN(amountTGATE * 1_000_000_000); // Convert to lamports (9 decimals)

  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    program.programId
  );
  
  const [matchPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  const adminGateAta = getAssociatedTokenAddressSync(TGATE_MINT, admin.publicKey);
  const treasuryGateAta = getAssociatedTokenAddressSync(TGATE_MINT, treasuryPda, true);

  console.log(`Funding match #${matchId} with ${amountTGATE} tGATE...`);

  const tx = await program.methods
    .fundMatchPool(amount)
    .accountsStrict({
      matchPool: matchPoolPda,
      treasury: treasuryPda,
      gateMint: TGATE_MINT,
      treasuryGateAta: treasuryGateAta,
      admin: admin.publicKey,
      adminGateAta: adminGateAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("✅ Match pool funded!");
  console.log("   Amount:", amountTGATE, "tGATE");
  console.log("   Transaction:", tx);
}

/**
 * Step 4: Resolve a Match (after the esports game ends)
 * outcome: true = YES wins, false = NO wins
 */
async function resolveMatch(matchId: number, outcome: boolean) {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.nftPredictionStakeV1 as Program<NftPredictionStakeV1>;
  const admin = (provider.wallet as anchor.Wallet).payer;

  const matchIdBN = new BN(matchId);
  
  const [matchPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  console.log(`Resolving match #${matchId}...`);
  console.log(`   Outcome: ${outcome ? "YES wins" : "NO wins"}`);

  const tx = await program.methods
    .resolveMatch(outcome)
    .accountsStrict({
      matchPool: matchPoolPda,
      admin: admin.publicKey,
    })
    .rpc();

  console.log("✅ Match resolved!");
  console.log("   Transaction:", tx);
}

/**
 * View match pool status
 */
async function viewMatchPool(matchId: number) {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.nftPredictionStakeV1 as Program<NftPredictionStakeV1>;

  const matchIdBN = new BN(matchId);
  
  const [matchPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  try {
    const matchPool = await program.account.matchPool.fetch(matchPoolPda);
    
    console.log(`\n=== Match Pool #${matchId} ===`);
    console.log("   PDA:", matchPoolPda.toBase58());
    console.log("   Admin:", matchPool.admin.toBase58());
    console.log("   Prize Pool:", matchPool.prizePool.toNumber() / 1_000_000_000, "tGATE");
    console.log("   Total YES Weight:", matchPool.totalYesWeight.toString());
    console.log("   Total NO Weight:", matchPool.totalNoWeight.toString());
    console.log("   Resolved:", matchPool.resolved);
    console.log("   Outcome:", matchPool.outcome ? "YES" : "NO");
    console.log("   Max NFTs per user:", matchPool.maxNftsPerUser);
  } catch (e) {
    console.log(`Match pool #${matchId} not found`);
  }
}

// ===========================================
// RUN
// ===========================================

// Uncomment the function you want to run:

main();

// initializeTreasury();
// createMatchPool(1001, 3);  // Match ID 1001, max 3 NFTs per user
// fundMatchPool(1001, 100);  // Fund match 1001 with 100 tGATE
// resolveMatch(1001, true);  // Match 1001: YES wins
// viewMatchPool(1001);


