/**
 * CosmicGATE NFT Prediction Staking - User Guide
 * 
 * NON-CUSTODIAL STAKING MODEL:
 * Your NFT stays in YOUR wallet! It's "frozen" while staked (can't transfer/sell),
 * but it never leaves your possession.
 * 
 * SINGLE TREASURY MODEL:
 * - All rewards are paid from ONE Treasury PDA
 * - Match pools are state-only (prize_pool is just a number)
 * - When you claim, tGATE transfers from Treasury → Your wallet
 * 
 * This script shows how users can:
 * 1. Stake their NFT on a match prediction (NFT gets frozen in your wallet)
 * 2. Claim rewards if they win (NFT gets thawed + you get tGATE from Treasury)
 * 3. Wait for admin to unlock if they lose (NFT gets thawed, no rewards)
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

// Program ID (deployed on devnet)
const PROGRAM_ID = new PublicKey("51DFYj5Evdk3TnbipTmscxwt4HvJiYq5d3cfdriEEvqm");

// tGATE token mint
const TGATE_MINT = new PublicKey("AaTtdiALQ2QUchCAXP49VEsCTtQrj2TJtVzh8LghZSkb");

// Devnet RPC URL
const RPC_URL = "https://api.devnet.solana.com";

// Path to your wallet keypair
const WALLET_PATH = os.homedir() + "/.config/solana/id.json";

// ===========================================
// HELPER: Load wallet and create provider
// ===========================================

function getProvider(): { provider: AnchorProvider; user: Keypair } {
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8")))
  );
  
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  
  anchor.setProvider(provider);
  
  return { provider, user: walletKeypair };
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
// USER FUNCTIONS
// ===========================================

/**
 * Stake an NFT on a match prediction
 * 
 * HOW IT WORKS (Non-Custodial):
 * 1. Your program becomes the "delegate" for your NFT
 * 2. Your NFT gets "frozen" via Metaplex Token Metadata
 * 3. The NFT STAYS in your wallet - you still own it!
 * 4. You just can't transfer/sell it while staked
 * 
 * @param matchId - The match ID to bet on
 * @param nftMint - Your NFT's mint address
 * @param tier - NFT tier: "common", "limited", "punk", or "legend"
 * @param estimatedSolValue - How much you think your NFT is worth in SOL
 * @param prediction - true = YES (team A wins), false = NO (team B wins)
 */
async function stakeNft(
  matchId: number,
  nftMint: PublicKey,
  tier: "common" | "limited" | "punk" | "legend",
  estimatedSolValue: number,
  prediction: boolean
) {
  const { provider, user } = getProvider();
  const program = getProgram(provider);

  const matchIdBN = new BN(matchId);
  const solValueLamports = new BN(estimatedSolValue * 1_000_000_000);

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

  const [userPositionPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("user_position"),
      matchIdBN.toArrayLike(Buffer, "le", 8),
      user.publicKey.toBuffer(),
    ],
    PROGRAM_ID
  );

  const userNftAta = getAssociatedTokenAddressSync(nftMint, user.publicKey);
  const nftEdition = getNftEditionPda(nftMint);

  console.log(`\n=== Staking NFT on Match #${matchId} ===`);
  console.log("   NFT Mint:", nftMint.toBase58());
  console.log("   Tier:", tier);
  console.log("   Estimated Value:", estimatedSolValue, "SOL");
  console.log("   Prediction:", prediction ? "YES" : "NO");
  console.log("   NFT Edition (for freeze):", nftEdition.toBase58());
  console.log("\n   📌 Your NFT will be FROZEN in your wallet (you still own it!)");

  // Build the tier enum object based on tier string
  let tierArg: any;
  switch (tier) {
    case "common": tierArg = { common: {} }; break;
    case "limited": tierArg = { limited: {} }; break;
    case "punk": tierArg = { punk: {} }; break;
    case "legend": tierArg = { legend: {} }; break;
  }

  const tx = await program.methods
    .stakeNft(tierArg, solValueLamports, prediction)
    .accountsStrict({
      matchPool: matchPoolPda,
      stakeRecord: stakeRecordPda,
      userPosition: userPositionPda,
      nftMint: nftMint,
      userNftAta: userNftAta,
      nftEdition: nftEdition,
      user: user.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
    })
    .rpc();

  console.log("✅ NFT Staked!");
  console.log("   Transaction:", tx);
  console.log("   Stake Record PDA:", stakeRecordPda.toBase58());
  console.log("\n   🔒 Your NFT is now FROZEN in your wallet.");
  console.log("   🎮 Wait for the match result to claim rewards or get unlocked!");
}

/**
 * Claim rewards (if you won)
 * This THAWS your NFT AND transfers tGATE from Treasury → Your wallet
 * 
 * Only winners can call this. After claiming:
 * - Your NFT is unfrozen (can transfer/sell again)
 * - You receive your tGATE reward based on your weight
 * 
 * Reward formula: (your_weight / total_winning_weight) × prize_pool
 */
async function claimReward(matchId: number, nftMint: PublicKey) {
  const { provider, user } = getProvider();
  const program = getProgram(provider);

  const matchIdBN = new BN(matchId);

  // Treasury PDA
  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    PROGRAM_ID
  );

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

  const userNftAta = getAssociatedTokenAddressSync(nftMint, user.publicKey);
  const nftEdition = getNftEditionPda(nftMint);
  const treasuryGateAta = getAssociatedTokenAddressSync(TGATE_MINT, treasuryPda, true);
  const userGateAta = getAssociatedTokenAddressSync(TGATE_MINT, user.publicKey);

  // Create user's tGATE ATA if it doesn't exist
  await getOrCreateAssociatedTokenAccount(
    provider.connection,
    user,
    TGATE_MINT,
    user.publicKey
  );

  console.log(`\n=== Claiming Reward for Match #${matchId} ===`);
  console.log("   NFT Mint:", nftMint.toBase58());
  console.log("   NFT Edition:", nftEdition.toBase58());

  const tx = await program.methods
    .claimReward()
    .accountsStrict({
      matchPool: matchPoolPda,
      stakeRecord: stakeRecordPda,
      nftMint: nftMint,
      userNftAta: userNftAta,
      nftEdition: nftEdition,
      treasury: treasuryPda,
      gateMint: TGATE_MINT,
      treasuryGateAta: treasuryGateAta,
      userGateAta: userGateAta,
      user: user.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
    })
    .rpc();

  console.log("✅ Reward Claimed!");
  console.log("   Transaction:", tx);
  console.log("\n   🔓 Your NFT is now UNFROZEN (you can transfer/sell it again)");
  console.log("   💰 Check your wallet for tGATE rewards!");
}

/**
 * View your stake on a match
 */
async function viewMyStake(matchId: number, nftMint: PublicKey) {
  const { provider } = getProvider();
  const program = getProgram(provider);

  const matchIdBN = new BN(matchId);

  const [stakeRecordPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("stake"),
      matchIdBN.toArrayLike(Buffer, "le", 8),
      nftMint.toBuffer(),
    ],
    PROGRAM_ID
  );

  try {
    const stake = await (program.account as any).stakeRecord.fetch(stakeRecordPda);
    
    console.log(`\n=== Your Stake on Match #${matchId} ===`);
    console.log("   NFT Mint:", stake.nftMint.toBase58());
    console.log("   Token Account:", stake.tokenAccount.toBase58());
    console.log("   Prediction:", stake.prediction ? "YES" : "NO");
    console.log("   Weight:", stake.weight.toString());
    console.log("   Locked:", stake.locked ? "🔒 YES (frozen)" : "🔓 NO (unfrozen)");
    console.log("   Claimed:", stake.claimed ? "✅ YES" : "❌ NO");

    if (stake.locked) {
      console.log("\n   📌 Your NFT is currently FROZEN in your wallet.");
      console.log("   🎮 Wait for match resolution, then:");
      console.log("      - If you WIN: call claimReward() to get tGATE + unfreeze NFT");
      console.log("      - If you LOSE: admin will unlock your NFT automatically");
    }
  } catch (e) {
    console.log("Stake not found");
  }
}

/**
 * View match pool details
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
    console.log("   Prize Pool:", matchPool.prizePool.toNumber() / 1_000_000, "tGATE");
    console.log("   Total YES Weight:", matchPool.totalYesWeight.toString());
    console.log("   Total NO Weight:", matchPool.totalNoWeight.toString());
    console.log("   Resolved:", matchPool.resolved ? "✅ YES" : "❌ NO");
    
    if (matchPool.resolved) {
      console.log("   Outcome:", matchPool.outcome ? "🎉 YES WINS" : "🎉 NO WINS");
    }
    console.log("   Max NFTs per user:", matchPool.maxNftsPerUser);
    console.log("\n   Rewards paid from Treasury PDA when you claim!");
  } catch (e) {
    console.log(`Match pool #${matchId} not found`);
  }
}

/**
 * Check if you're a winner or loser
 */
async function checkMyResult(matchId: number, nftMint: PublicKey) {
  const { provider, user } = getProvider();
  const program = getProgram(provider);

  const matchIdBN = new BN(matchId);

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

  try {
    const matchPool = await (program.account as any).matchPool.fetch(matchPoolPda);
    const stake = await (program.account as any).stakeRecord.fetch(stakeRecordPda);

    console.log(`\n=== Your Result for Match #${matchId} ===`);
    console.log("   Your Prediction:", stake.prediction ? "YES" : "NO");
    
    if (!matchPool.resolved) {
      console.log("   Match Status: ⏳ NOT YET RESOLVED");
      console.log("   Wait for the match to end and admin to resolve it.");
      return;
    }

    console.log("   Match Outcome:", matchPool.outcome ? "YES" : "NO");
    
    const isWinner = stake.prediction === matchPool.outcome;
    
    if (isWinner) {
      console.log("\n   🎉🎉🎉 YOU WON! 🎉🎉🎉");
      if (!stake.claimed) {
        console.log("   💰 Call claimReward() to get your tGATE + unfreeze your NFT!");
      } else {
        console.log("   ✅ You already claimed your reward.");
      }
    } else {
      console.log("\n   😢 You lost this prediction.");
      if (stake.locked) {
        console.log("   🔒 Your NFT is still frozen. Admin will unlock it soon.");
      } else {
        console.log("   🔓 Your NFT has been unlocked. Better luck next time!");
      }
    }
  } catch (e) {
    console.log("Could not check result:", e);
  }
}

// ===========================================
// EXAMPLE USAGE
// ===========================================

// 1. Stake your NFT on match #1001, betting YES
// stakeNft(
//   470055,                                                    // Match ID
//   new PublicKey("GVxXZJ5sqNwe7NiHonq3eX9i5LTZNW3FVPTr2cbwgkxR"),                  // Your NFT mint
//   "legend",                                                  // Tier
//   1.5,                                                     // Estimated 2.5 SOL value
//   true                                                     // Prediction: YES wins
// );

// 2. View your stake
// viewMyStake(1001, new PublicKey("YOUR_NFT_MINT_ADDRESS"));

// 3. Check if you won after match resolves
// checkMyResult(1001, new PublicKey("YOUR_NFT_MINT_ADDRESS"));

// 4. If you WON, claim your reward (NFT gets unfrozen + you get tGATE)
claimReward(470055, new PublicKey("GVxXZJ5sqNwe7NiHonq3eX9i5LTZNW3FVPTr2cbwgkxR"));

// NOTE: If you LOST, you don't need to do anything!
// The admin will call unlockLoser() for all losers automatically.
// Your NFT will be unfrozen, but you won't get any tGATE rewards.