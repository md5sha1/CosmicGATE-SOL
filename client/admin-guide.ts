/**
 * CosmicGATE NFT Prediction Staking - Admin Guide
 * 
 * SINGLE TREASURY MODEL:
 * - ONE Treasury PDA holds all tGATE tokens (e.g., 1,000,000 tGATE)
 * - Match pools are STATE ONLY (no token accounts per match)
 * - Winners claim directly from Treasury PDA
 * 
 * This script shows how to:
 * 1. Initialize treasury with your REAL tGATE token
 * 2. Refill treasury with tGATE (can do anytime when depleted)
 * 3. Create prediction match pools (state only - prize_pool is just a number)
 * 4. Resolve matches
 * 5. Unlock losers' NFTs (non-custodial freeze/thaw model)
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
// CONSTANTS
// ===========================================

// Metaplex Token Metadata Program ID
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

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
  
  console.log("\n=== What you can do ===");
  if (treasuryAdmin === admin.publicKey.toBase58()) {
    console.log("✅ Refill treasury with tGATE");
  }
  if (matchAdmin === admin.publicKey.toBase58()) {
    console.log("✅ Resolve this match");
    console.log("✅ Unlock losers' NFTs");
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
// const WALLET_PATH = "./wallet.json";


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

/**
 * Derive NFT Edition PDA (Master Edition for Candy Machine NFTs)
 */
function getNftEditionPda(nftMint: PublicKey): PublicKey {
  const [editionPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      nftMint.toBuffer(),
      Buffer.from("edition"),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return editionPda;
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
    console.log("\n  Treasury already exists!");
    console.log("   Admin:", treasury.admin.toBase58());
    console.log("   Gate Mint:", treasury.gateMint.toBase58());
    
    if (!treasury.gateMint.equals(TGATE_MINT)) {
      console.log("\n Treasury was initialized with a DIFFERENT token!");
      console.log("   To use your real tGATE, you need to deploy a new program.");
      return;
    }
  } else {
    console.log("\n Treasury not initialized yet. You can initialize it!");
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

  console.log(" Treasury initialized!");
  console.log("   Transaction:", tx);
  console.log("   Treasury PDA:", treasuryPda.toBase58());
  console.log("   Treasury tGATE ATA:", treasuryGateAta.toBase58());
}

/**
 * Step 2: Refill Treasury with tGATE
 * Admin can call this anytime to add more tGATE to the treasury
 * The treasury holds ALL rewards - match pools don't hold tokens
 */
async function refillTreasury(amountTGATE: number) {
  const { provider, admin } = getProvider();
  const program = getProgram(provider);

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

  const adminGateAta = getAssociatedTokenAddressSync(TGATE_MINT, admin.publicKey);
  const treasuryGateAta = getAssociatedTokenAddressSync(TGATE_MINT, treasuryPda, true);

  console.log(`Refilling treasury with ${amountTGATE} tGATE...`);

  const tx = await program.methods
    .refillTreasury(amount)
    .accountsStrict({
      treasury: treasuryPda,
      gateMint: TGATE_MINT,
      treasuryGateAta: treasuryGateAta,
      admin: admin.publicKey,
      adminGateAta: adminGateAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("✅ Treasury refilled!");
  console.log("   Amount:", amountTGATE, "tGATE");
  console.log("   Transaction:", tx);
  
  // Show new balance
  const treasuryBalance = await provider.connection.getTokenAccountBalance(treasuryGateAta);
  console.log("   Treasury balance:", treasuryBalance.value.uiAmount, "tGATE");
}

/**
 * Step 2.5: Transfer Treasury Admin to a New Address
 * ONLY the current treasury admin can call this function!
 * 
 * WARNING: After this, YOU will lose admin access. Make sure the new admin address is correct!
 * 
 * @param newAdminAddress - The public key of the new admin (as base58 string)
 */
async function transferTreasuryAdmin(newAdminAddress: string) {
  const { provider, admin } = getProvider();
  const program = getProgram(provider);

  const newAdmin = new PublicKey(newAdminAddress);

  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    PROGRAM_ID
  );

  console.log("=== Transfer Treasury Admin ===");
  console.log("   Current Admin:", admin.publicKey.toBase58());
  console.log("   New Admin:", newAdmin.toBase58());
  console.log("\n⚠️  WARNING: You will lose admin access after this transaction!");

  const tx = await program.methods
    .transferTreasuryAdmin(newAdmin)
    .accountsStrict({
      treasury: treasuryPda,
      admin: admin.publicKey,
    })
    .rpc();

  console.log("\n✅ Treasury admin transferred!");
  console.log("   Transaction:", tx);
  console.log("   New Admin:", newAdmin.toBase58());
  console.log("\n📌 Note: The old admin can no longer refill treasury or transfer admin.");
}

/**
 * Step 3: Create a Match Pool (STATE ONLY - no token movement!)
 * 
 * The prize_pool is just a NUMBER representing how much tGATE winners will share.
 * No tokens are moved or locked per match - Treasury holds all funds.
 * 
 * Prize pool examples:
 * - Regular game: 100 tGATE
 * - Playoffs: 10,000 tGATE
 * - Finals: 50,000 tGATE
 */
async function createMatchPool(matchId: number, prizePoolTGATE: number, maxNftsPerUser: number = 3) {
  const { provider, admin } = getProvider();
  const program = getProgram(provider);

  const matchIdBN = new BN(matchId);
  
  // CHANGE THIS based on your tGATE decimals
  const TGATE_DECIMALS = 6;
  const prizePool = new BN(prizePoolTGATE * Math.pow(10, TGATE_DECIMALS));
  
  const [matchPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );

  console.log(`Creating match pool #${matchId}...`);
  console.log(`   Prize Pool: ${prizePoolTGATE} tGATE (state only - no token movement)`);

  const tx = await program.methods
    .initMatchPool(matchIdBN, prizePool, maxNftsPerUser)
    .accountsStrict({
      matchPool: matchPoolPda,
      admin: admin.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Match pool created!");
  console.log("   Match ID:", matchId);
  console.log("   Match Pool PDA:", matchPoolPda.toBase58());
  console.log("   Prize Pool:", prizePoolTGATE, "tGATE (state only)");
  console.log("   Max NFTs per user:", maxNftsPerUser);
  console.log("   Transaction:", tx);
  
  return matchPoolPda;
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
 * Step 5: Unlock a Loser's NFT (Admin only)
 * 
 * After resolving a match, call this to thaw (unlock) each losing user's NFT.
 * The NFT was frozen in the user's wallet - this unlocks it so they can use it again.
 * 
 * NOTE: This uses the new non-custodial freeze/thaw model.
 * The NFT never leaves the user's wallet, it's just frozen while staked.
 * 
 * @param matchId - The match ID
 * @param nftMint - The NFT mint that was staked by the loser
 * @param userNftAta - The loser's token account holding the NFT
 */
async function unlockLoser(matchId: number, nftMint: PublicKey, userNftAta: PublicKey) {
  const { provider, admin } = getProvider();
  const program = getProgram(provider);

  const matchIdBN = new BN(matchId);

  // Derive PDAs
  const [matchPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );

  const [stakeRecordPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("stake"),
      matchIdBN.toArrayLike(Buffer, "le", 8),
      nftMint.toBuffer(),
    ],
    PROGRAM_ID
  );

  const nftEdition = getNftEditionPda(nftMint);

  console.log(`\n=== Unlocking Loser's NFT on Match #${matchId} ===`);
  console.log("   NFT Mint:", nftMint.toBase58());
  console.log("   User NFT ATA:", userNftAta.toBase58());
  console.log("   NFT Edition:", nftEdition.toBase58());

  const tx = await program.methods
    .unlockLoser()
    .accountsStrict({
      matchPool: matchPoolPda,
      stakeRecord: stakeRecordPda,
      nftMint: nftMint,
      userNftAta: userNftAta,
      nftEdition: nftEdition,
      admin: admin.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
    })
    .rpc();

  console.log(" Loser's NFT Unlocked!");
  console.log("   Transaction:", tx);
  console.log("   The user's NFT is now thawed and can be transferred again.");
}

/**
 * Batch unlock multiple losers' NFTs
 * 
 * @param matchId - The match ID
 * @param losers - Array of { nftMint, userNftAta } for each loser
 */
async function batchUnlockLosers(
  matchId: number, 
  losers: { nftMint: PublicKey; userNftAta: PublicKey }[]
) {
  console.log(`\n=== Batch Unlocking ${losers.length} Losers' NFTs ===`);
  
  for (let i = 0; i < losers.length; i++) {
    console.log(`\nUnlocking ${i + 1}/${losers.length}...`);
    await unlockLoser(matchId, losers[i].nftMint, losers[i].userNftAta);
  }
  
  console.log(`\n✅ All ${losers.length} losers' NFTs have been unlocked!`);
}

/**
 * Get all stake records for a match (to find losers to unlock)
 * 
 * NOTE: This handles both old (transfer model) and new (freeze/thaw model) stake records.
 * Old records don't have tokenAccount field and will be skipped for auto-unlock.
 */
async function getMatchStakeRecords(matchId: number) {
  const { provider } = getProvider();
  const program = getProgram(provider);

  const matchIdBN = new BN(matchId);
  
  const [matchPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );

  try {
    // Get match pool to know the outcome
    const matchPool = await (program.account as any).matchPool.fetch(matchPoolPda);
    
    console.log(`\n=== Match #${matchId} Stake Records ===`);
    console.log("   Resolved:", matchPool.resolved);
    console.log("   Outcome:", matchPool.outcome ? "YES" : "NO");

    // Get all stake record accounts (raw, unfiltered)
    // Use getProgramAccounts to get raw account data
    const STAKE_RECORD_SIZE = 8 + 32 + 8 + 32 + 32 + 1 + 8 + 1 + 1 + 16 + 1 + 1 + 1; // New size with tokenAccount
    const OLD_STAKE_RECORD_SIZE = 8 + 32 + 8 + 32 + 1 + 8 + 1 + 1 + 16 + 1 + 1 + 1; // Old size without tokenAccount

    const allAccounts = await provider.connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        // Filter by discriminator for StakeRecord (first 8 bytes)
        // We'll decode manually to handle both old and new formats
      ],
    });

    const winners: any[] = [];
    const losers: any[] = [];
    let oldFormatCount = 0;
    let newFormatCount = 0;

    for (const { pubkey, account } of allAccounts) {
      try {
        // Try to decode as new format first
        const stake = await (program.account as any).stakeRecord.fetch(pubkey);
        
        // Check if this stake belongs to the current match
        if (!stake.matchId.eq(matchIdBN)) continue;

        newFormatCount++;
        const isWinner = stake.prediction === matchPool.outcome;
        const stakeInfo = {
          pubkey: pubkey.toBase58(),
          user: stake.user.toBase58(),
          nftMint: stake.nftMint.toBase58(),
          tokenAccount: stake.tokenAccount?.toBase58() || null,
          prediction: stake.prediction ? "YES" : "NO",
          locked: stake.locked,
          claimed: stake.claimed,
          isNewFormat: true,
        };

        if (isWinner) {
          winners.push(stakeInfo);
        } else {
          losers.push(stakeInfo);
        }
      } catch (decodeError) {
        // This might be an old format stake record or different account type
        // Skip it - old format stakes can't be unlocked with the new program anyway
        oldFormatCount++;
      }
    }

    console.log(`\n   Found ${newFormatCount} new-format stakes, ${oldFormatCount} incompatible/other accounts`);

    console.log(`\n   Winners (${winners.length}):`);
    winners.forEach((w, i) => {
      console.log(`   ${i + 1}. ${w.user} - NFT: ${w.nftMint} - Locked: ${w.locked}`);
    });

    console.log(`\n   Losers (${losers.length}):`);
    losers.forEach((l, i) => {
      console.log(`   ${i + 1}. ${l.user} - NFT: ${l.nftMint} - Locked: ${l.locked}`);
    });

    // Return losers that still need unlocking (only new format with tokenAccount)
    const losersToUnlock = losers
      .filter((l) => l.locked && l.tokenAccount !== null)
      .map((l) => ({
        nftMint: new PublicKey(l.nftMint),
        userNftAta: new PublicKey(l.tokenAccount),
      }));

    console.log(`\n   Losers needing unlock: ${losersToUnlock.length}`);
    
    if (losers.length > 0 && losersToUnlock.length === 0) {
      console.log("   Note: Some losers may have old-format stakes (created before program update).");
      console.log("   Old-format stakes used transfer model and don't need unlock_loser.");
    }

    return losersToUnlock;
  } catch (e) {
    console.log(`Match #${matchId} not found or error:`, e);
    return [];
  }
}

/**
 * View treasury balance
 */
async function viewTreasuryBalance() {
  const { provider } = getProvider();
  console.log("provider wallet path:", WALLET_PATH);
  
  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    PROGRAM_ID
  );
  
  const treasuryGateAta = getAssociatedTokenAddressSync(TGATE_MINT, treasuryPda, true);

  try {
    const balance = await provider.connection.getTokenAccountBalance(treasuryGateAta);
    console.log("\n=== Treasury Balance ===");
    console.log("   Treasury PDA:", treasuryPda.toBase58());
    console.log("   tGATE Balance:", balance.value.uiAmount, "tGATE");
    console.log("   Raw Amount:", balance.value.amount);
    return balance.value.uiAmount;
  } catch (e) {
    console.log("Treasury not funded yet or ATA doesn't exist");
    return 0;
  }
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
    console.log("   Prize Pool:", matchPool.prizePool.toNumber() / 1_000_000, "tGATE (state only)");
    console.log("   Total YES Weight:", matchPool.totalYesWeight.toString());
    console.log("   Total NO Weight:", matchPool.totalNoWeight.toString());
    console.log("   Resolved:", matchPool.resolved);
    if (matchPool.resolved) {
      console.log("   Outcome:", matchPool.outcome ? "🎉 YES WINS" : "🎉 NO WINS");
    }
    console.log("   Max NFTs per user:", matchPool.maxNftsPerUser);
    console.log("\n   📌 Note: Prize pool is STATE ONLY. Rewards paid from Treasury PDA.");
  } catch (e) {
    console.log(`Match pool #${matchId} not found`);
  }
}

/**
 * Full workflow after match ends:
 * 1. Resolve the match
 * 2. Unlock all losers' NFTs
 */
async function resolveAndUnlockLosers(matchId: number, outcome: boolean) {
  console.log(`\n=== Full Match Resolution Workflow for Match #${matchId} ===`);
  
  // Step 1: Resolve the match
  await resolveMatch(matchId, outcome);
  
  // Step 2: Get all losers that need unlocking
  const losersToUnlock = await getMatchStakeRecords(matchId);
  
  // Step 3: Unlock all losers
  if (losersToUnlock.length > 0) {
    await batchUnlockLosers(matchId, losersToUnlock);
  } else {
    console.log("\n   No losers need unlocking.");
  }
  
  console.log(`\n Match #${matchId} fully resolved!`);
  console.log("   Winners can now call claimReward() to get their NFT unlocked + tGATE rewards.");
}

// ===========================================
// RUN
// ===========================================

// Uncomment the function you want to run:

// === QUERY FUNCTIONS (Read-only) ===
// getTreasuryAdmin();           // Who is the treasury admin?
// viewTreasuryBalance();        // Check treasury tGATE balance
// getMatchAdmin(470050);          // Who is the admin of match #470050?
// checkAllAdmins(470050);          // Check your permissions for match #470050
// getMatchStakeRecords(120050);   // View all stakes and find losers to unlock
// viewMatchPool(470050);          // View match #470050 details

// === SETUP (Run once) ===
// initializeTreasury();              // Initialize treasury PDA
// refillTreasury(500);               // Fund treasury with 500 tGATE

// === TRANSFER ADMIN (Use with caution!) ===
transferTreasuryAdmin("G4XuMEx4hy49JQf4vys61bbxt4XXjNd97h6Wga2ggi3k");  // Transfer treasury admin to new address

// === MATCH CREATION (State only - no token movement!) ===
// createMatchPool(120050, 100, 3);   // Create match #470050, prize=100 tGATE, max 3 NFTs/user
// createMatchPool(470051, 10_000, 5); // Playoffs match, prize=10,000 tGATE
// createMatchPool(470052, 50_000, 5); // Finals match, prize=50,000 tGATE

// === RESOLUTION ===
// resolveMatch(120050, true);        // Resolve match #470050: YES wins

// === UNLOCK LOSERS' NFTs ===
// unlockLoser(
//   120050,
//   new PublicKey("GVxXZJ5sqNwe7NiHonq3eX9i5LTZNW3FVPTr2cbwgkxR"),
//   new PublicKey("9zCwQhzn6T8ypeXaDNUgVXtPxiqchfAyfTBc2urswFaq")
// );

// === FULL WORKFLOW: Resolve + Unlock all losers ===
// resolveAndUnlockLosers(470053, true);  // Resolve as YES wins + unlock all losers
