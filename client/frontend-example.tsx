/**
 * CosmicGATE - Frontend Integration Example
 * 
 * This shows how to implement NFT staking in a React/Next.js frontend
 * where users connect their wallet and approve transactions.
 */

// ===========================================
// 1. INSTALL DEPENDENCIES
// ===========================================
/*
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token \
  @solana/wallet-adapter-react @solana/wallet-adapter-react-ui \
  @solana/wallet-adapter-wallets
*/

// ===========================================
// 2. WALLET PROVIDER SETUP (in _app.tsx or layout.tsx)
// ===========================================

import React, { FC, ReactNode, useMemo, useState } from 'react';
import { 
  ConnectionProvider, 
  WalletProvider,
  useWallet,
  useConnection,
  useAnchorWallet
} from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { 
  getAssociatedTokenAddressSync, 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID 
} from '@solana/spl-token';

// Import your IDL (copy from target/idl/nft_prediction_stake_v1.json)
// import idl from './idl/nft_prediction_stake_v1.json';

// ===========================================
// CONFIGURATION
// ===========================================

const PROGRAM_ID = new PublicKey("51DFYj5Evdk3TnbipTmscxwt4HvJiYq5d3cfdriEEvqm");
const TGATE_MINT = new PublicKey("AaTtdiALQ2QUchCAXP49VEsCTtQrj2TJtVzh8LghZSkb");
const RPC_URL = "https://api.devnet.solana.com";

// ===========================================
// 3. WALLET PROVIDER WRAPPER
// ===========================================

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], []);

  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

// ===========================================
// 4. CUSTOM HOOK: useProgram
// ===========================================

// You need to import your IDL here
const idl = {}; // Replace with: import idl from './idl/nft_prediction_stake_v1.json'

export function useProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  if (!wallet) return null;

  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });

  return new Program(idl as any, provider);
}

// ===========================================
// 5. STAKE NFT COMPONENT
// ===========================================

interface StakeNftProps {
  matchId: number;
  nftMint: string;
  tier: 'common' | 'limited' | 'punk' | 'legend';
  estimatedSolValue: number;
}

export const StakeNftButton: FC<StakeNftProps> = ({ 
  matchId, 
  nftMint, 
  tier, 
  estimatedSolValue 
}) => {
  const { publicKey } = useWallet();
  const program = useProgram();
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<boolean | null>(null);

  const handleStake = async (userPrediction: boolean) => {
    if (!program || !publicKey) {
      alert('Please connect your wallet first!');
      return;
    }

    setLoading(true);
    setPrediction(userPrediction);

    try {
      const matchIdBN = new BN(matchId);
      const nftMintPubkey = new PublicKey(nftMint);
      const solValueLamports = new BN(estimatedSolValue * 1_000_000_000);

      // Derive PDAs
      const [matchPoolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("match_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
        PROGRAM_ID
      );

      const [stakeRecordPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), matchIdBN.toArrayLike(Buffer, "le", 8), nftMintPubkey.toBuffer()],
        PROGRAM_ID
      );

      const [userPositionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_position"), matchIdBN.toArrayLike(Buffer, "le", 8), publicKey.toBuffer()],
        PROGRAM_ID
      );

      const userNftAta = getAssociatedTokenAddressSync(nftMintPubkey, publicKey);
      const escrowNftAta = getAssociatedTokenAddressSync(nftMintPubkey, stakeRecordPda, true);

      // Build tier enum
      const tierArg = { [tier]: {} };

      // Send transaction - USER WILL SEE WALLET POPUP TO APPROVE!
      const tx = await program.methods
        .stakeNft(tierArg, solValueLamports, userPrediction)
        .accountsStrict({
          matchPool: matchPoolPda,
          stakeRecord: stakeRecordPda,
          userPosition: userPositionPda,
          nftMint: nftMintPubkey,
          userNftAta: userNftAta,
          escrowNftAta: escrowNftAta,
          user: publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log('Transaction successful:', tx);
      alert(`NFT Staked! TX: ${tx}`);
      
    } catch (error: any) {
      console.error('Error staking NFT:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stake-buttons">
      <h3>Stake your NFT on Match #{matchId}</h3>
      <p>NFT: {nftMint}</p>
      <p>Tier: {tier} | Value: {estimatedSolValue} SOL</p>
      
      <div className="prediction-buttons">
        <button 
          onClick={() => handleStake(true)} 
          disabled={loading}
          className="btn-yes"
        >
          {loading && prediction === true ? 'Confirming...' : '🟢 Bet YES'}
        </button>
        
        <button 
          onClick={() => handleStake(false)} 
          disabled={loading}
          className="btn-no"
        >
          {loading && prediction === false ? 'Confirming...' : '🔴 Bet NO'}
        </button>
      </div>
      
      {loading && <p>⏳ Please approve the transaction in your wallet...</p>}
    </div>
  );
};

// ===========================================
// 6. CLAIM REWARD COMPONENT
// ===========================================

interface ClaimRewardProps {
  matchId: number;
  nftMint: string;
}

export const ClaimRewardButton: FC<ClaimRewardProps> = ({ matchId, nftMint }) => {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const program = useProgram();
  const [loading, setLoading] = useState(false);

  const handleClaim = async () => {
    if (!program || !publicKey) {
      alert('Please connect your wallet!');
      return;
    }

    setLoading(true);

    try {
      const matchIdBN = new BN(matchId);
      const nftMintPubkey = new PublicKey(nftMint);

      const [treasuryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("treasury")],
        PROGRAM_ID
      );

      const [matchPoolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("match_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
        PROGRAM_ID
      );

      const [stakeRecordPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), matchIdBN.toArrayLike(Buffer, "le", 8), nftMintPubkey.toBuffer()],
        PROGRAM_ID
      );

      const userNftAta = getAssociatedTokenAddressSync(nftMintPubkey, publicKey);
      const escrowNftAta = getAssociatedTokenAddressSync(nftMintPubkey, stakeRecordPda, true);
      const treasuryGateAta = getAssociatedTokenAddressSync(TGATE_MINT, treasuryPda, true);
      const userGateAta = getAssociatedTokenAddressSync(TGATE_MINT, publicKey);

      const tx = await program.methods
        .claimReward()
        .accountsStrict({
          matchPool: matchPoolPda,
          stakeRecord: stakeRecordPda,
          nftMint: nftMintPubkey,
          userNftAta: userNftAta,
          escrowNftAta: escrowNftAta,
          treasury: treasuryPda,
          gateMint: TGATE_MINT,
          treasuryGateAta: treasuryGateAta,
          userGateAta: userGateAta,
          user: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      alert(`Reward claimed! TX: ${tx}`);
      
    } catch (error: any) {
      console.error('Error claiming:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleClaim} disabled={loading}>
      {loading ? '⏳ Claiming...' : '🏆 Claim Reward'}
    </button>
  );
};

// ===========================================
// 7. COMPLETE PAGE EXAMPLE
// ===========================================

export const MatchPredictionPage: FC = () => {
  const { publicKey, connected } = useWallet();
  
  // Example match data (fetch from your backend/API)
  const match = {
    id: 1001,
    team1: "T1",
    team2: "Gen.G",
    prizePool: 100,
  };

  // Example user's NFT (fetch from user's wallet)
  const userNft = {
    mint: "YOUR_NFT_MINT_ADDRESS",
    tier: "common" as const,
    estimatedValue: 2.5,
  };

  return (
    <div className="match-page">
      <header>
        <h1>🎮 CosmicGATE Prediction</h1>
        <WalletMultiButton />
      </header>

      <main>
        {!connected ? (
          <p>Please connect your wallet to participate</p>
        ) : (
          <>
            <section className="match-info">
              <h2>Match #{match.id}: {match.team1} vs {match.team2}</h2>
              <p>Prize Pool: {match.prizePool} tGATE</p>
            </section>

            <section className="stake-section">
              <StakeNftButton
                matchId={match.id}
                nftMint={userNft.mint}
                tier={userNft.tier}
                estimatedSolValue={userNft.estimatedValue}
              />
            </section>

            <section className="claim-section">
              <ClaimRewardButton
                matchId={match.id}
                nftMint={userNft.mint}
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
};

// ===========================================
// 8. USAGE IN YOUR APP
// ===========================================

/*
// In your _app.tsx or main layout:

import { WalletContextProvider } from './frontend-example';

function MyApp({ Component, pageProps }) {
  return (
    <WalletContextProvider>
      <Component {...pageProps} />
    </WalletContextProvider>
  );
}

// Then use the components:
<MatchPredictionPage />

// Or individual components:
<StakeNftButton 
  matchId={1001} 
  nftMint="NFT_MINT_ADDRESS" 
  tier="legend" 
  estimatedSolValue={5} 
/>
*/

// ===========================================
// FLOW DIAGRAM
// ===========================================

/*
┌─────────────────────────────────────────────────────────────┐
│  1. User connects wallet (Phantom)                          │
│     - WalletMultiButton shows "Connect Wallet"              │
│     - User clicks and selects Phantom                       │
│     - Wallet popup appears, user approves connection        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  2. User selects NFT and clicks "Bet YES" or "Bet NO"       │
│     - Frontend builds the transaction                       │
│     - program.methods.stakeNft(...).rpc() is called        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  3. WALLET POPUP APPEARS                                    │
│     ┌─────────────────────────────────┐                     │
│     │  Phantom                        │                     │
│     │  ─────────────────────────      │                     │
│     │  Approve Transaction?           │                     │
│     │                                 │                     │
│     │  Program: 51DFYj5...            │                     │
│     │  Action: Stake NFT              │                     │
│     │                                 │                     │
│     │  [Reject]      [Approve]        │                     │
│     └─────────────────────────────────┘                     │
│                                                             │
│     - User clicks "Approve"                                 │
│     - Wallet signs the transaction                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  4. Transaction is sent to Solana                           │
│     - NFT is transferred to escrow                          │
│     - Stake record is created                               │
│     - Match pool totals are updated                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  5. Frontend shows success message                          │
│     - "NFT Staked! TX: abc123..."                          │
└─────────────────────────────────────────────────────────────┘
*/

