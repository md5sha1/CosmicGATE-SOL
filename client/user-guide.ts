/**
 * CosmicGATE NFT Prediction Staking - User Guide
 * 
 * This script shows how users can:
 * 1. Stake their NFT on a match prediction
 * 2. Claim rewards if they win
 * 3. Unstake if they lose
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
// CONFIGURATION
// ===========================================

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

// ===========================================
// USER FUNCTIONS
// ===========================================

/**
 * Stake an NFT on a match prediction
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
  const escrowNftAta = getAssociatedTokenAddressSync(nftMint, stakeRecordPda, true);

  console.log(`\n=== Staking NFT on Match #${matchId} ===`);
  console.log("   NFT Mint:", nftMint.toBase58());
  console.log("   Tier:", tier);
  console.log("   Estimated Value:", estimatedSolValue, "SOL");
  console.log("   Prediction:", prediction ? "YES" : "NO");

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
      escrowNftAta: escrowNftAta,
      user: user.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("✅ NFT Staked!");
  console.log("   Transaction:", tx);
  console.log("   Stake Record PDA:", stakeRecordPda.toBase58());
}

/**
 * Claim rewards (if you won)
 * This returns your NFT AND gives you tGATE rewards
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
  const escrowNftAta = getAssociatedTokenAddressSync(nftMint, stakeRecordPda, true);
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

  const tx = await program.methods
    .claimReward()
    .accountsStrict({
      matchPool: matchPoolPda,
      stakeRecord: stakeRecordPda,
      nftMint: nftMint,
      userNftAta: userNftAta,
      escrowNftAta: escrowNftAta,
      treasury: treasuryPda,
      gateMint: TGATE_MINT,
      treasuryGateAta: treasuryGateAta,
      userGateAta: userGateAta,
      user: user.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("✅ Reward Claimed!");
  console.log("   Transaction:", tx);
  console.log("   Your NFT has been returned to your wallet");
  console.log("   Check your wallet for tGATE rewards!");
}

/**
 * Unstake NFT (if you lost)
 * You get your NFT back, but no rewards
 */
async function unstakeLoser(matchId: number, nftMint: PublicKey) {
  const { provider, user } = getProvider();
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

  const userNftAta = getAssociatedTokenAddressSync(nftMint, user.publicKey);
  const escrowNftAta = getAssociatedTokenAddressSync(nftMint, stakeRecordPda, true);

  console.log(`\n=== Unstaking NFT from Match #${matchId} ===`);

  const tx = await program.methods
    .unstakeLoser()
    .accountsStrict({
      matchPool: matchPoolPda,
      stakeRecord: stakeRecordPda,
      nftMint: nftMint,
      userNftAta: userNftAta,
      escrowNftAta: escrowNftAta,
      user: user.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("✅ NFT Unstaked!");
  console.log("   Transaction:", tx);
  console.log("   Your NFT has been returned (no rewards for losing)");
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
    console.log("   Prediction:", stake.prediction ? "YES" : "NO");
    console.log("   Weight:", stake.weight.toString());
    console.log("   Locked:", stake.locked);
    console.log("   Claimed:", stake.claimed);
  } catch (e) {
    console.log("Stake not found");
  }
}

// ===========================================
// EXAMPLE USAGE
// ===========================================

/*
// 1. Stake your NFT on match #1001, betting YES
stakeNft(
  1001,                                                    // Match ID
  new PublicKey("YOUR_NFT_MINT_ADDRESS"),                 // Your NFT mint
  "common",                                                // Tier
  2.5,                                                     // Estimated 2.5 SOL value
  true                                                     // Prediction: YES wins
);

// 2. After match resolves, claim if you won
claimReward(1001, new PublicKey("YOUR_NFT_MINT_ADDRESS"));

// 3. Or unstake if you lost
unstakeLoser(1001, new PublicKey("YOUR_NFT_MINT_ADDRESS"));

// 4. View your stake
viewMyStake(1001, new PublicKey("YOUR_NFT_MINT_ADDRESS"));
*/


