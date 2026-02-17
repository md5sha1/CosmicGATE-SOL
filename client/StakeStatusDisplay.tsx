/**
 * Component to display NFT stake status from on-chain data
 * Users can verify their stake is recorded on the blockchain
 */

import React, { useState, useEffect } from 'react';
import { useStakeStatus, StakeStatus, MatchPoolStatus } from './useStakeStatus';

// ===========================================
// STAKE STATUS CARD COMPONENT
// ===========================================

interface StakeStatusCardProps {
  matchId: number;
  nftMint: string;
  onClose?: () => void;
}

export const StakeStatusCard: React.FC<StakeStatusCardProps> = ({ 
  matchId, 
  nftMint,
  onClose 
}) => {
  const { checkStakeStatus, verifyNftInEscrow, isLoading, error } = useStakeStatus();
  const [stakeStatus, setStakeStatus] = useState<StakeStatus | null>(null);
  const [escrowVerified, setEscrowVerified] = useState<boolean | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const status = await checkStakeStatus(matchId, nftMint);
        setStakeStatus(status);

        if (status.exists && status.locked) {
          const escrow = await verifyNftInEscrow(matchId, nftMint);
          setEscrowVerified(escrow.inEscrow);
        }
      } catch (err) {
        console.error('Failed to fetch stake status:', err);
      }
    };

    fetchStatus();
  }, [matchId, nftMint, checkStakeStatus, verifyNftInEscrow]);

  if (isLoading) {
    return (
      <div className="stake-status-card loading">
        <div className="spinner" />
        <p>Fetching on-chain data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="stake-status-card error">
        <h3>❌ Error</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (!stakeStatus) {
    return null;
  }

  return (
    <div className="stake-status-card">
      <div className="card-header">
        <h3>📋 On-Chain Stake Verification</h3>
        {onClose && <button onClick={onClose} className="close-btn">×</button>}
      </div>

      {!stakeStatus.exists ? (
        <div className="not-found">
          <p>⚠️ No stake found for this NFT in Match #{matchId}</p>
          <a 
            href={stakeStatus.explorerUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="explorer-link"
          >
            Check on Solana Explorer →
          </a>
        </div>
      ) : (
        <div className="stake-details">
          {/* Verification Badge */}
          <div className={`verification-badge ${escrowVerified ? 'verified' : 'pending'}`}>
            {escrowVerified ? '✅ Verified On-Chain' : '⏳ Verifying...'}
          </div>

          {/* Stake Info Grid */}
          <div className="info-grid">
            <div className="info-row">
              <span className="label">Match ID:</span>
              <span className="value">#{stakeStatus.matchId}</span>
            </div>

            <div className="info-row">
              <span className="label">NFT Tier:</span>
              <span className={`value tier-${stakeStatus.tier.toLowerCase()}`}>
                {stakeStatus.tier}
              </span>
            </div>

            <div className="info-row">
              <span className="label">Estimated Value:</span>
              <span className="value">{stakeStatus.estimatedSolValue.toFixed(2)} SOL</span>
            </div>

            <div className="info-row">
              <span className="label">Value Band:</span>
              <span className="value">{stakeStatus.valueBand}</span>
            </div>

            <div className="info-row">
              <span className="label">Prediction:</span>
              <span className={`value prediction-${stakeStatus.prediction ? 'yes' : 'no'}`}>
                {stakeStatus.prediction ? '🟢 YES' : '🔴 NO'}
              </span>
            </div>

            <div className="info-row highlight">
              <span className="label">Weight:</span>
              <span className="value">{parseInt(stakeStatus.weight).toLocaleString()}</span>
            </div>

            <div className="info-row">
              <span className="label">Status:</span>
              <span className={`value status-${stakeStatus.locked ? 'locked' : 'unlocked'}`}>
                {stakeStatus.locked ? '🔒 Locked in Escrow' : '🔓 Unlocked'}
              </span>
            </div>

            <div className="info-row">
              <span className="label">Claimed:</span>
              <span className="value">{stakeStatus.claimed ? '✅ Yes' : '⏳ No'}</span>
            </div>
          </div>

          {/* Escrow Verification */}
          {stakeStatus.locked && (
            <div className="escrow-info">
              <h4>🔐 NFT Escrow</h4>
              <p className="escrow-address">
                Your NFT is safely held at:
                <code>{stakeStatus.escrowNftAddress.slice(0, 8)}...{stakeStatus.escrowNftAddress.slice(-8)}</code>
              </p>
              {escrowVerified && (
                <p className="verified-text">✅ NFT presence verified in escrow</p>
              )}
            </div>
          )}

          {/* On-Chain Links */}
          <div className="explorer-links">
            <a 
              href={stakeStatus.explorerUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="explorer-link"
            >
              📄 View Stake Record on Explorer
            </a>
            <a 
              href={`https://explorer.solana.com/address/${stakeStatus.escrowNftAddress}?cluster=devnet`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="explorer-link"
            >
              🖼️ View NFT Escrow on Explorer
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

// ===========================================
// MATCH POOL STATUS COMPONENT
// ===========================================

interface MatchPoolStatusCardProps {
  matchId: number;
}

export const MatchPoolStatusCard: React.FC<MatchPoolStatusCardProps> = ({ matchId }) => {
  const { checkMatchPoolStatus, isLoading, error } = useStakeStatus();
  const [poolStatus, setPoolStatus] = useState<MatchPoolStatus | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const status = await checkMatchPoolStatus(matchId);
        setPoolStatus(status);
      } catch (err) {
        console.error('Failed to fetch match pool status:', err);
      }
    };

    fetchStatus();
  }, [matchId, checkMatchPoolStatus]);

  if (isLoading) {
    return <div className="loading">Loading match data...</div>;
  }

  if (!poolStatus || !poolStatus.exists) {
    return <div className="not-found">Match #{matchId} not found on-chain</div>;
  }

  const totalWeight = BigInt(poolStatus.totalYesWeight) + BigInt(poolStatus.totalNoWeight);
  const yesPercent = totalWeight > 0n 
    ? (BigInt(poolStatus.totalYesWeight) * 100n / totalWeight).toString()
    : '0';
  const noPercent = totalWeight > 0n
    ? (BigInt(poolStatus.totalNoWeight) * 100n / totalWeight).toString()
    : '0';

  return (
    <div className="match-pool-card">
      <h3>🎮 Match #{matchId} Status</h3>

      <div className="pool-stats">
        <div className="stat">
          <span className="label">Prize Pool:</span>
          <span className="value">{(poolStatus.prizePool / 1_000_000).toLocaleString()} tGATE</span>
        </div>

        <div className="stat">
          <span className="label">Status:</span>
          <span className={`value ${poolStatus.resolved ? 'resolved' : 'active'}`}>
            {poolStatus.resolved ? '✅ Resolved' : '🔴 Active'}
          </span>
        </div>

        {poolStatus.resolved && (
          <div className="stat">
            <span className="label">Outcome:</span>
            <span className={`value outcome-${poolStatus.outcome ? 'yes' : 'no'}`}>
              {poolStatus.outcome ? '🟢 YES Won' : '🔴 NO Won'}
            </span>
          </div>
        )}
      </div>

      {/* Prediction Distribution Bar */}
      <div className="prediction-bar">
        <div className="bar-header">
          <span>🟢 YES ({yesPercent}%)</span>
          <span>🔴 NO ({noPercent}%)</span>
        </div>
        <div className="bar-container">
          <div 
            className="bar-fill yes" 
            style={{ width: `${yesPercent}%` }}
          />
          <div 
            className="bar-fill no" 
            style={{ width: `${noPercent}%` }}
          />
        </div>
        <div className="bar-weights">
          <span>{parseInt(poolStatus.totalYesWeight).toLocaleString()}</span>
          <span>{parseInt(poolStatus.totalNoWeight).toLocaleString()}</span>
        </div>
      </div>

      <a 
        href={poolStatus.explorerUrl} 
        target="_blank" 
        rel="noopener noreferrer"
        className="explorer-link"
      >
        View on Solana Explorer →
      </a>
    </div>
  );
};

// ===========================================
// QUICK CHECK BUTTON (inline verification)
// ===========================================

interface VerifyStakeButtonProps {
  matchId: number;
  nftMint: string;
  txSignature?: string;
}

export const VerifyStakeButton: React.FC<VerifyStakeButtonProps> = ({ 
  matchId, 
  nftMint,
  txSignature 
}) => {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button 
        onClick={() => setShowModal(true)}
        className="verify-btn"
      >
        🔍 Verify On-Chain
      </button>

      {txSignature && (
        <a 
          href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="tx-link"
        >
          📝 View Transaction
        </a>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <StakeStatusCard 
              matchId={matchId} 
              nftMint={nftMint} 
              onClose={() => setShowModal(false)}
            />
          </div>
        </div>
      )}
    </>
  );
};

// ===========================================
// EXAMPLE USAGE
// ===========================================

/*
// After a successful stake:
const handleStakeSuccess = (result) => {
  // Show verification UI
  return (
    <div>
      <p>✅ Stake submitted!</p>
      <VerifyStakeButton 
        matchId={1001}
        nftMint={nft.mintAddress}
        txSignature={result.signature}
      />
    </div>
  );
};

// On match page:
<MatchPoolStatusCard matchId={1001} />

// Show user's stake:
<StakeStatusCard matchId={1001} nftMint={userNft.mintAddress} />
*/

export default StakeStatusCard;


