/**
 * Hook to check NFT stake status on-chain
 * Users can verify their stake is recorded on the blockchain
 */

import { useState, useCallback, useMemo } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import BN from 'bn.js';

// ===========================================
// CONFIGURATION
// ===========================================

const PROGRAM_ID = new PublicKey("51DFYj5Evdk3TnbipTmscxwt4HvJiYq5d3cfdriEEvqm");
const RPC_URL = import.meta.env?.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// Account discriminators from IDL (first 8 bytes identify account type)
const ACCOUNT_DISCRIMINATORS = {
  StakeRecord: [174, 163, 11, 208, 150, 236, 11, 205],
  MatchPool: [114, 28, 170, 141, 232, 190, 43, 48],
  UserMatchPosition: [101, 91, 27, 107, 116, 11, 80, 243],
};

// Tier names for display
const TIER_NAMES = ['Common', 'Limited', 'Punk', 'Legend'];
const VALUE_BAND_NAMES = ['Band1 (<1 SOL)', 'Band2 (1-3 SOL)', 'Band3 (3-10 SOL)', 'Band4 (10+ SOL)'];

// ===========================================
// TYPES
// ===========================================

export interface StakeStatus {
  exists: boolean;
  user: string;
  matchId: number;
  nftMint: string;
  tier: string;
  estimatedSolValue: number;
  valueBand: string;
  prediction: boolean;  // true = YES, false = NO
  weight: string;       // u128 as string
  claimed: boolean;
  locked: boolean;      // true = NFT is in escrow
  stakeRecordAddress: string;
  escrowNftAddress: string;
  explorerUrl: string;
}

export interface MatchPoolStatus {
  exists: boolean;
  matchId: number;
  admin: string;
  prizePool: number;
  totalYesWeight: string;
  totalNoWeight: string;
  resolved: boolean;
  outcome: boolean | null;
  maxNftsPerUser: number;
  matchPoolAddress: string;
  explorerUrl: string;
}

// ===========================================
// HOOK
// ===========================================

export function useStakeStatus() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connection = useMemo(() => new Connection(RPC_URL, 'confirmed'), []);

  /**
   * Derive StakeRecord PDA address
   */
  const getStakeRecordAddress = useCallback((matchId: number, nftMint: string): PublicKey => {
    const matchIdBN = new BN(matchId);
    const nftMintPubkey = new PublicKey(nftMint);
    
    const [stakeRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("stake"),
        matchIdBN.toArrayLike(Buffer, "le", 8),
        nftMintPubkey.toBuffer(),
      ],
      PROGRAM_ID
    );
    
    return stakeRecordPda;
  }, []);

  /**
   * Derive MatchPool PDA address
   */
  const getMatchPoolAddress = useCallback((matchId: number): PublicKey => {
    const matchIdBN = new BN(matchId);
    
    const [matchPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("match_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
      PROGRAM_ID
    );
    
    return matchPoolPda;
  }, []);

  /**
   * Parse StakeRecord account data
   */
  const parseStakeRecord = useCallback((data: Buffer): Omit<StakeStatus, 'exists' | 'stakeRecordAddress' | 'escrowNftAddress' | 'explorerUrl'> | null => {
    try {
      // Check discriminator (first 8 bytes)
      const discriminator = Array.from(data.slice(0, 8));
      if (JSON.stringify(discriminator) !== JSON.stringify(ACCOUNT_DISCRIMINATORS.StakeRecord)) {
        return null;
      }

      let offset = 8;

      // user: Pubkey (32 bytes)
      const user = new PublicKey(data.slice(offset, offset + 32)).toBase58();
      offset += 32;

      // match_id: u64 (8 bytes)
      const matchId = new BN(data.slice(offset, offset + 8), 'le').toNumber();
      offset += 8;

      // nft_mint: Pubkey (32 bytes)
      const nftMint = new PublicKey(data.slice(offset, offset + 32)).toBase58();
      offset += 32;

      // tier: enum (1 byte)
      const tierIndex = data.readUInt8(offset);
      const tier = TIER_NAMES[tierIndex] || 'Unknown';
      offset += 1;

      // estimated_sol_value: u64 (8 bytes)
      const estimatedSolValueLamports = new BN(data.slice(offset, offset + 8), 'le');
      const estimatedSolValue = estimatedSolValueLamports.toNumber() / 1_000_000_000;
      offset += 8;

      // value_band: enum (1 byte)
      const valueBandIndex = data.readUInt8(offset);
      const valueBand = VALUE_BAND_NAMES[valueBandIndex] || 'Unknown';
      offset += 1;

      // prediction: bool (1 byte)
      const prediction = data.readUInt8(offset) === 1;
      offset += 1;

      // weight: u128 (16 bytes)
      const weightLow = new BN(data.slice(offset, offset + 8), 'le');
      const weightHigh = new BN(data.slice(offset + 8, offset + 16), 'le');
      const weight = weightHigh.shln(64).add(weightLow).toString();
      offset += 16;

      // claimed: bool (1 byte)
      const claimed = data.readUInt8(offset) === 1;
      offset += 1;

      // locked: bool (1 byte)
      const locked = data.readUInt8(offset) === 1;

      return {
        user,
        matchId,
        nftMint,
        tier,
        estimatedSolValue,
        valueBand,
        prediction,
        weight,
        claimed,
        locked,
      };
    } catch (err) {
      console.error('Error parsing StakeRecord:', err);
      return null;
    }
  }, []);

  /**
   * Check if a specific NFT is staked in a match
   */
  const checkStakeStatus = useCallback(async (
    matchId: number,
    nftMint: string
  ): Promise<StakeStatus> => {
    setIsLoading(true);
    setError(null);

    try {
      const stakeRecordPda = getStakeRecordAddress(matchId, nftMint);
      const nftMintPubkey = new PublicKey(nftMint);
      
      // Get escrow ATA address
      const escrowNftAta = await getAssociatedTokenAddress(nftMintPubkey, stakeRecordPda, true);

      const accountInfo = await connection.getAccountInfo(stakeRecordPda);

      if (!accountInfo || !accountInfo.data) {
        return {
          exists: false,
          user: '',
          matchId,
          nftMint,
          tier: '',
          estimatedSolValue: 0,
          valueBand: '',
          prediction: false,
          weight: '0',
          claimed: false,
          locked: false,
          stakeRecordAddress: stakeRecordPda.toBase58(),
          escrowNftAddress: escrowNftAta.toBase58(),
          explorerUrl: `https://explorer.solana.com/address/${stakeRecordPda.toBase58()}?cluster=devnet`,
        };
      }

      const parsed = parseStakeRecord(accountInfo.data);
      
      if (!parsed) {
        throw new Error('Failed to parse stake record data');
      }

      return {
        exists: true,
        ...parsed,
        stakeRecordAddress: stakeRecordPda.toBase58(),
        escrowNftAddress: escrowNftAta.toBase58(),
        explorerUrl: `https://explorer.solana.com/address/${stakeRecordPda.toBase58()}?cluster=devnet`,
      };

    } catch (err: any) {
      console.error('Error checking stake status:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [connection, getStakeRecordAddress, parseStakeRecord]);

  /**
   * Check match pool status
   */
  const checkMatchPoolStatus = useCallback(async (matchId: number): Promise<MatchPoolStatus> => {
    setIsLoading(true);
    setError(null);

    try {
      const matchPoolPda = getMatchPoolAddress(matchId);
      const accountInfo = await connection.getAccountInfo(matchPoolPda);

      if (!accountInfo || !accountInfo.data) {
        return {
          exists: false,
          matchId,
          admin: '',
          prizePool: 0,
          totalYesWeight: '0',
          totalNoWeight: '0',
          resolved: false,
          outcome: null,
          maxNftsPerUser: 0,
          matchPoolAddress: matchPoolPda.toBase58(),
          explorerUrl: `https://explorer.solana.com/address/${matchPoolPda.toBase58()}?cluster=devnet`,
        };
      }

      const data = accountInfo.data;
      let offset = 8; // Skip discriminator

      // match_id: u64
      const parsedMatchId = new BN(data.slice(offset, offset + 8), 'le').toNumber();
      offset += 8;

      // admin: Pubkey
      const admin = new PublicKey(data.slice(offset, offset + 32)).toBase58();
      offset += 32;

      // prize_pool: u64
      const prizePool = new BN(data.slice(offset, offset + 8), 'le').toNumber();
      offset += 8;

      // total_yes_weight: u128
      const yesWeightLow = new BN(data.slice(offset, offset + 8), 'le');
      const yesWeightHigh = new BN(data.slice(offset + 8, offset + 16), 'le');
      const totalYesWeight = yesWeightHigh.shln(64).add(yesWeightLow).toString();
      offset += 16;

      // total_no_weight: u128
      const noWeightLow = new BN(data.slice(offset, offset + 8), 'le');
      const noWeightHigh = new BN(data.slice(offset + 8, offset + 16), 'le');
      const totalNoWeight = noWeightHigh.shln(64).add(noWeightLow).toString();
      offset += 16;

      // resolved: bool
      const resolved = data.readUInt8(offset) === 1;
      offset += 1;

      // outcome: bool
      const outcome = resolved ? data.readUInt8(offset) === 1 : null;
      offset += 1;

      // max_nfts_per_user: u8
      const maxNftsPerUser = data.readUInt8(offset);

      return {
        exists: true,
        matchId: parsedMatchId,
        admin,
        prizePool,
        totalYesWeight,
        totalNoWeight,
        resolved,
        outcome,
        maxNftsPerUser,
        matchPoolAddress: matchPoolPda.toBase58(),
        explorerUrl: `https://explorer.solana.com/address/${matchPoolPda.toBase58()}?cluster=devnet`,
      };

    } catch (err: any) {
      console.error('Error checking match pool:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [connection, getMatchPoolAddress]);

  /**
   * Verify NFT is in escrow (additional verification)
   */
  const verifyNftInEscrow = useCallback(async (
    matchId: number,
    nftMint: string
  ): Promise<{ inEscrow: boolean; escrowBalance: number }> => {
    try {
      const stakeRecordPda = getStakeRecordAddress(matchId, nftMint);
      const nftMintPubkey = new PublicKey(nftMint);
      const escrowNftAta = await getAssociatedTokenAddress(nftMintPubkey, stakeRecordPda, true);

      const tokenAccountInfo = await connection.getTokenAccountBalance(escrowNftAta);
      const balance = parseInt(tokenAccountInfo.value.amount);

      return {
        inEscrow: balance === 1,
        escrowBalance: balance,
      };
    } catch (err) {
      // Account doesn't exist = NFT not in escrow
      return { inEscrow: false, escrowBalance: 0 };
    }
  }, [connection, getStakeRecordAddress]);

  return {
    checkStakeStatus,
    checkMatchPoolStatus,
    verifyNftInEscrow,
    getStakeRecordAddress,
    getMatchPoolAddress,
    isLoading,
    error,
  };
}

export default useStakeStatus;

