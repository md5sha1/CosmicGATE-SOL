# CosmicGATE NFT Prediction Staking - Complete Implementation Guide

## 📋 Table of Contents
1. [Program Overview](#program-overview)
2. [Architecture](#architecture)
3. [Account Structures](#account-structures)
4. [Instructions (Functions)](#instructions)
5. [How Rewards Work](#how-rewards-work)
6. [Frontend Integration](#frontend-integration)
7. [Step-by-Step Implementation](#step-by-step-implementation)

---

## 🎮 Program Overview

**What is this?**
A Solana program that lets users stake their NFTs to predict esports match outcomes. Winners share a prize pool of tGATE tokens.

**Deployed on Devnet:**
```
Program ID: 51DFYj5Evdk3TnbipTmscxwt4HvJiYq5d3cfdriEEvqm
tGATE Mint: AaTtdiALQ2QUchCAXP49VEsCTtQrj2TJtVzh8LghZSkb
```

**Flow:**
```
┌──────────────────────────────────────────────────────────────┐
│  ADMIN: Creates match pool & funds with tGATE prizes         │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│  USERS: Stake NFTs with YES or NO prediction                 │
│  - NFT is locked in escrow                                   │
│  - Weight calculated from NFT tier + value                   │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│  REAL MATCH: Esports game happens (off-chain)                │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│  ADMIN: Resolves match with outcome (YES wins or NO wins)    │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│  WINNERS: Claim tGATE reward + get NFT back                  │
│  LOSERS: Get NFT back (no reward)                            │
└──────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Architecture

### PDAs (Program Derived Addresses)

PDAs are special addresses controlled by the program (no private key needed).

| PDA | Seeds | Purpose |
|-----|-------|---------|
| Treasury | `["treasury"]` | Holds tGATE tokens for prizes |
| MatchPool | `["match_pool", match_id]` | Stores match info & totals |
| StakeRecord | `["stake", match_id, nft_mint]` | Records user's stake |
| UserPosition | `["user_position", match_id, user]` | Tracks user's NFT count |

### Token Flow
```
Admin Wallet                    Treasury PDA
┌──────────┐   fundMatchPool   ┌──────────┐
│  tGATE   │ ─────────────────→│  tGATE   │
└──────────┘                   └──────────┘
                                    │
                               claimReward
                                    ↓
                              ┌──────────┐
                              │ Winner's │
                              │  Wallet  │
                              └──────────┘
```

---

## 📊 Account Structures

### Treasury
```rust
pub struct Treasury {
    pub admin: Pubkey,      // Admin wallet address
    pub gate_mint: Pubkey,  // tGATE token mint
    pub bump: u8,           // PDA bump seed
}
```

### MatchPool
```rust
pub struct MatchPool {
    pub match_id: u64,           // Unique match identifier
    pub admin: Pubkey,           // Match creator
    pub prize_pool: u64,         // Total tGATE in pool
    pub total_yes_weight: u128,  // Sum of all YES bets
    pub total_no_weight: u128,   // Sum of all NO bets
    pub resolved: bool,          // Has match ended?
    pub outcome: bool,           // true=YES won, false=NO won
    pub max_nfts_per_user: u8,   // Limit per user
    pub bump: u8,
}
```

### StakeRecord
```rust
pub struct StakeRecord {
    pub user: Pubkey,            // Who staked
    pub match_id: u64,
    pub nft_mint: Pubkey,        // Which NFT
    pub tier: Tier,              // Common/Limited/Punk/Legend
    pub estimated_sol_value: u64, // NFT value in lamports
    pub value_band: ValueBand,   // Band1/2/3/4
    pub prediction: bool,        // true=YES, false=NO
    pub weight: u128,            // Calculated weight
    pub claimed: bool,           // Already claimed?
    pub locked: bool,            // NFT still in escrow?
    pub bump: u8,
}
```

---

## 📝 Instructions

### 1. initTreasury (Admin - Once)
Creates the global treasury that holds all prize tokens.

```typescript
await program.methods
  .initTreasury()
  .accountsStrict({
    treasury: treasuryPda,
    gateMint: TGATE_MINT,
    treasuryGateAta: treasuryGateAta,
    admin: adminPublicKey,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  })
  .rpc();
```

### 2. initMatchPool (Admin)
Creates a new prediction match.

```typescript
await program.methods
  .initMatchPool(
    new BN(matchId),    // Unique match ID (e.g., 1001)
    3                    // Max NFTs per user
  )
  .accountsStrict({
    matchPool: matchPoolPda,
    admin: adminPublicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

### 3. fundMatchPool (Admin)
Adds tGATE tokens to the prize pool.

```typescript
await program.methods
  .fundMatchPool(
    new BN(100_000_000_000) // 100 tGATE (9 decimals)
  )
  .accountsStrict({
    matchPool: matchPoolPda,
    treasury: treasuryPda,
    gateMint: TGATE_MINT,
    treasuryGateAta: treasuryGateAta,
    admin: adminPublicKey,
    adminGateAta: adminGateAta,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
```

### 4. stakeNft (User)
Stakes an NFT with a prediction.

```typescript
await program.methods
  .stakeNft(
    { common: {} },           // Tier: common/limited/punk/legend
    new BN(2_000_000_000),    // Estimated 2 SOL value
    true                       // Prediction: true=YES, false=NO
  )
  .accountsStrict({
    matchPool: matchPoolPda,
    stakeRecord: stakeRecordPda,
    userPosition: userPositionPda,
    nftMint: nftMintPublicKey,
    userNftAta: userNftAta,
    escrowNftAta: escrowNftAta,
    user: userPublicKey,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  })
  .rpc();
```

### 5. resolveMatch (Admin)
Sets the match outcome after the real game ends.

```typescript
await program.methods
  .resolveMatch(true) // true = YES wins, false = NO wins
  .accountsStrict({
    matchPool: matchPoolPda,
    admin: adminPublicKey,
  })
  .rpc();
```

### 6. claimReward (Winner)
Winners claim their tGATE reward + get NFT back.

```typescript
await program.methods
  .claimReward()
  .accountsStrict({
    matchPool: matchPoolPda,
    stakeRecord: stakeRecordPda,
    nftMint: nftMintPublicKey,
    userNftAta: userNftAta,
    escrowNftAta: escrowNftAta,
    treasury: treasuryPda,
    gateMint: TGATE_MINT,
    treasuryGateAta: treasuryGateAta,
    userGateAta: userGateAta,
    user: userPublicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
```

### 7. unstakeLoser (Loser)
Losers get their NFT back (no reward).

```typescript
await program.methods
  .unstakeLoser()
  .accountsStrict({
    matchPool: matchPoolPda,
    stakeRecord: stakeRecordPda,
    nftMint: nftMintPublicKey,
    userNftAta: userNftAta,
    escrowNftAta: escrowNftAta,
    user: userPublicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
```

---

## 💰 How Rewards Work

### Weight Calculation
```
Weight = Tier Multiplier × Value Band Multiplier

Tier Multipliers:
- Common: 100
- Limited: 150
- Punk: 200
- Legend: 300

Value Bands (based on estimated SOL value):
- Band 1 (<1 SOL): 100
- Band 2 (1-3 SOL): 125
- Band 3 (3-10 SOL): 150
- Band 4 (>10 SOL): 175

Example:
- Legend NFT worth 5 SOL = 300 × 150 = 45,000 weight
- Common NFT worth 0.5 SOL = 100 × 100 = 10,000 weight
```

### Reward Distribution
```
Your Reward = (Your Weight / Total Winning Weight) × Prize Pool

Example:
- Prize Pool: 1000 tGATE
- Total YES Weight: 50,000
- Your YES Weight: 10,000
- Your Reward: (10,000 / 50,000) × 1000 = 200 tGATE
```

---

## 🌐 Frontend Integration

### Setup (React/Next.js)

```bash
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token @solana/wallet-adapter-react
```

### Connect Wallet

```typescript
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

function App() {
  const { publicKey, connected } = useWallet();
  
  return (
    <div>
      <WalletMultiButton />
      {connected && <p>Connected: {publicKey?.toBase58()}</p>}
    </div>
  );
}
```

### Initialize Program

```typescript
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import idl from "./idl/nft_prediction_stake_v1.json";

const PROGRAM_ID = new PublicKey("51DFYj5Evdk3TnbipTmscxwt4HvJiYq5d3cfdriEEvqm");

function useProgram() {
  const wallet = useAnchorWallet();
  const connection = new Connection("https://api.devnet.solana.com");
  
  if (!wallet) return null;
  
  const provider = new AnchorProvider(connection, wallet, {});
  return new Program(idl, provider);
}
```

### Fetch Match Data

```typescript
async function getMatchPool(program: Program, matchId: number) {
  const [matchPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_pool"), new BN(matchId).toArrayLike(Buffer, "le", 8)],
    program.programId
  );
  
  try {
    const match = await program.account.matchPool.fetch(matchPoolPda);
    return {
      matchId: match.matchId.toNumber(),
      prizePool: match.prizePool.toNumber() / 1e9, // Convert to tGATE
      totalYesWeight: match.totalYesWeight.toString(),
      totalNoWeight: match.totalNoWeight.toString(),
      resolved: match.resolved,
      outcome: match.outcome ? "YES" : "NO",
    };
  } catch {
    return null;
  }
}
```

### Stake NFT (User Action)

```typescript
async function stakeNft(
  program: Program,
  wallet: any,
  matchId: number,
  nftMint: PublicKey,
  tier: "common" | "limited" | "punk" | "legend",
  estimatedSol: number,
  prediction: boolean
) {
  const matchIdBN = new BN(matchId);
  
  // Derive all PDAs
  const [matchPoolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
    program.programId
  );
  
  const [stakeRecordPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("stake"), matchIdBN.toArrayLike(Buffer, "le", 8), nftMint.toBuffer()],
    program.programId
  );
  
  const [userPositionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_position"), matchIdBN.toArrayLike(Buffer, "le", 8), wallet.publicKey.toBuffer()],
    program.programId
  );
  
  // Get token accounts
  const userNftAta = getAssociatedTokenAddressSync(nftMint, wallet.publicKey);
  const escrowNftAta = getAssociatedTokenAddressSync(nftMint, stakeRecordPda, true);
  
  // Build tier object
  const tierArg = { [tier]: {} };
  
  // Execute transaction
  const tx = await program.methods
    .stakeNft(tierArg, new BN(estimatedSol * 1e9), prediction)
    .accountsStrict({
      matchPool: matchPoolPda,
      stakeRecord: stakeRecordPda,
      userPosition: userPositionPda,
      nftMint: nftMint,
      userNftAta: userNftAta,
      escrowNftAta: escrowNftAta,
      user: wallet.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();
    
  return tx;
}
```

---

## 🚀 Step-by-Step Implementation

### Phase 1: Setup (You're Here!)
1. ✅ Deploy program to devnet
2. ⬜ Initialize treasury with real tGATE
3. ⬜ Create first test match pool
4. ⬜ Fund with some tGATE

### Phase 2: Build Frontend
1. Create Next.js app with wallet adapter
2. Build match listing page
3. Build stake NFT modal
4. Build claim/unstake UI
5. Add transaction notifications

### Phase 3: Admin Dashboard
1. Create match management page
2. Fund match pools
3. Resolve matches after games
4. View statistics

### Phase 4: Production
1. Audit smart contract
2. Deploy to mainnet
3. Set up monitoring
4. Launch!

---

## 🔧 Quick Commands

```bash
# Initialize treasury (run once)
cd client && npx ts-node -e "
import('./admin-guide').then(m => m.initializeTreasury())
"

# Create match pool
npx ts-node -e "
import('./admin-guide').then(m => m.createMatchPool(1001, 3))
"

# Fund match with 100 tGATE
npx ts-node -e "
import('./admin-guide').then(m => m.fundMatchPool(1001, 100))
"

# View match
npx ts-node -e "
import('./admin-guide').then(m => m.viewMatchPool(1001))
"
```

---

## ❓ Common Questions

**Q: What if a user stakes wrong NFT?**
A: They can only get it back after the match is resolved (as winner or loser).

**Q: Can I cancel a match?**
A: Not in current version. You'd need to add a `cancelMatch` instruction.

**Q: What happens if no one wins?**
A: Prize pool stays in treasury. Admin could create another match.

**Q: How do I verify NFT tier?**
A: Current version trusts user input. For production, integrate with NFT metadata.

---

## 📁 Project Structure

```
CosmicGATE-SOL/
├── programs/
│   └── nft_prediction_stake/
│       └── src/
│           └── lib.rs          # Main Solana program
├── client/
│   ├── admin-guide.ts          # Admin functions
│   ├── user-guide.ts           # User functions
│   └── get-treasury.ts         # Utility
├── tests/
│   └── nft_prediction_stake.ts # Test suite
├── target/
│   ├── idl/                    # Program IDL (for frontend)
│   └── types/                  # TypeScript types
├── Anchor.toml                 # Anchor config
└── IMPLEMENTATION_GUIDE.md     # This file
```

---

Need help with anything specific? Ask away! 🎯


