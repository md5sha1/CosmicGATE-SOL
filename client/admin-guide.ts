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
import { Program, BN, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, SystemProgram, Connection, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";

// Import the IDL
import idl from "../target/idl/nft_prediction_stake_v1.json";

// ===========================================
// QUERY FUNCTIONS - Check who is admin
// ===========================================

async function getTreasuryAdmin(): Promise<string | null> {
  const { provider, admin } = getProvider();
  const program = new Program(idl as any, provider);
  
  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    PROGRAM_ID
  );

  try {
    const treasury = await (program.account as any).treasury.fetch(treasuryPda);
    console.log("=== Treasury Info ===");
    console.log("Treasury PDA:", treasuryPda.toBase58());
    console.log("Treasury Admin:", treasury.admin.toBase58());
    console.log("tGATE Mint:", treasury.gateMint.toBase58());
    return treasury.admin.toBase58();
  } catch (e) {
    console.log("Treasury not initialized yet");
    return null;
  }
}

async function getMatchAdmin(matchId: number): Promise<string | null> {
  const { provider } = getProvider();
  const program = new Program(idl as any, provider);
  
  const matchIdBN = new BN(matchId);
  const [matchPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );

  try {
    const matchPool = await (program.account as any).matchPool.fetch(matchPoolPda);
    console.log(`=== Match #${matchId} Info ===`);
    console.log("Match Pool PDA:", matchPoolPda.toBase58());
    console.log("Match Admin:", matchPool.admin.toBase58());
    console.log("Prize Pool:", matchPool.prizePool.toString());
    console.log("Resolved:", matchPool.resolved);
    return matchPool.admin.toBase58();
  } catch (e) {
    console.log(`Match #${matchId} not found`);
    return null;
  }
}

async function checkAllAdmins(matchId: number) {
  const { admin } = getProvider();
  console.log("\n=== Admin Check ===");
  console.log("Your Wallet:", admin.publicKey.toBase58());
  
  const treasuryAdmin = await getTreasuryAdmin();
  const matchAdmin = await getMatchAdmin(matchId);
  
  console.log("\n=== Permissions ===");
  console.log("You are Treasury Admin:", treasuryAdmin === admin.publicKey.toBase58() ? "✅ YES" : "❌ NO");
  console.log("You are Match Admin:", matchAdmin === admin.publicKey.toBase58() ? "✅ YES" : "❌ NO");
  
  if (treasuryAdmin === admin.publicKey.toBase58() && matchAdmin === admin.publicKey.toBase58()) {
    console.log("\n✅ You CAN fund this match!");
  } else {
    console.log("\n❌ You CANNOT fund this match.");
    if (treasuryAdmin !== admin.publicKey.toBase58()) {
      console.log("   - You are not the treasury admin");
    }
    if (matchAdmin !== admin.publicKey.toBase58()) {
      console.log("   - You are not the match admin");
    }
  }
}

// ===========================================
// CONFIGURATION - CHANGE THESE VALUES
// ===========================================

// Your REAL tGATE token mint address
const TGATE_MINT = new PublicKey("AaTtdiALQ2QUchCAXP49VEsCTtQrj2TJtVzh8LghZSkb");

// Your program ID (deployed on devnet)
const PROGRAM_ID = new PublicKey("51DFYj5Evdk3TnbipTmscxwt4HvJiYq5d3cfdriEEvqm");

// Devnet RPC URL
const RPC_URL = "https://api.devnet.solana.com";

// Path to your wallet keypair
const WALLET_PATH = os.homedir() + "/.config/solana/id.json";

// ===========================================
// HELPER: Load wallet and create provider
// ===========================================

function getProvider(): { provider: AnchorProvider; admin: Keypair } {
  // Load wallet keypair
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8")))
  );
  
  // Create connection
  const connection = new Connection(RPC_URL, "confirmed");
  
  // Create wallet
  const wallet = new Wallet(walletKeypair);
  
  // Create provider
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  
  anchor.setProvider(provider);
  
  return { provider, admin: walletKeypair };
}

function getProgram(provider: AnchorProvider): Program {
  return new Program(idl as any, provider);
}

// ===========================================
// SETUP
// ===========================================

async function main() {
  const { provider, admin } = getProvider();
  const program = getProgram(provider);

  console.log("=== CosmicGATE Admin Panel ===");
  console.log("Admin wallet:", admin.publicKey.toBase58());
  console.log("Program ID:", PROGRAM_ID.toBase58());
  console.log("tGATE Mint:", TGATE_MINT.toBase58());

  // Derive treasury PDA
  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    PROGRAM_ID
  );
  console.log("\nTreasury PDA:", treasuryPda.toBase58());

  // Check if treasury exists
  const treasuryInfo = await provider.connection.getAccountInfo(treasuryPda);
  
  if (treasuryInfo) {
    const treasury = await (program.account as any).treasury.fetch(treasuryPda);
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
  const { provider, admin } = getProvider();
  const program = getProgram(provider);

  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    PROGRAM_ID
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
  const { provider, admin } = getProvider();
  const program = getProgram(provider);

  const matchIdBN = new BN(matchId);
  
  const [matchPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
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
  const { provider, admin } = getProvider();
  const program = getProgram(provider);

  const matchIdBN = new BN(matchId);
  // CHANGE THIS based on your tGATE decimals:
  // - 9 decimals: multiply by 1_000_000_000
  // - 6 decimals: multiply by 1_000_000
  // - 0 decimals: multiply by 1
  const TGATE_DECIMALS = 6; // ← CHANGE THIS to match your token!
  const amount = new BN(amountTGATE * Math.pow(10, TGATE_DECIMALS));

  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    PROGRAM_ID
  );
  
  const [matchPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
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

  console.log("   Match pool funded!");
  console.log("   Amount:", amountTGATE, "tGATE");
  console.log("   Transaction:", tx);
}

/**
 * Step 4: Resolve a Match (after the esports game ends)
 * outcome: true = YES wins, false = NO wins
 */
async function resolveMatch(matchId: number, outcome: boolean) {
  const { provider, admin } = getProvider();
  const program = getProgram(provider);

  const matchIdBN = new BN(matchId);
  
  const [matchPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
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

  console.log(" Match resolved!");
  console.log("   Transaction:", tx);
}

/**
 * View match pool status
 */
async function viewMatchPool(matchId: number) {
  const { provider } = getProvider();
  const program = getProgram(provider);

  const matchIdBN = new BN(matchId);
  
  const [matchPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );

  try {
    const matchPool = await (program.account as any).matchPool.fetch(matchPoolPda);
    
    console.log(`\n=== Match Pool #${matchId} ===`);
    console.log("   PDA:", matchPoolPda.toBase58());
    console.log("   Admin:", matchPool.admin.toBase58());
    console.log("   Prize Pool:", matchPool.prizePool.toNumber() / 1_000_000, "tGATE");
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

// === QUERY FUNCTIONS (Read-only) ===
// getTreasuryAdmin();           // Who is the treasury admin?
// getMatchAdmin(1001);          // Who is the admin of match #1001?
// checkAllAdmins(1001);          // Check your permissions for match #1001

// === ACTION FUNCTIONS ===
// initializeTreasury();         // Run this FIRST!
// createMatchPool(1002, 3);     // Create match #1001, max 3 NFTs per user
// fundMatchPool(1002, 100);     // Fund match #1001 with 100 tGATE
resolveMatch(1002, true);     // Resolve match #1001: YES wins
// viewMatchPool(1001);          // View match #1001 details