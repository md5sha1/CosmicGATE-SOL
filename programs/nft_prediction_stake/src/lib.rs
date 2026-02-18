use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Approve, Mint, Revoke, Token, TokenAccount, Transfer},
};
use mpl_token_metadata::instructions::{
    FreezeDelegatedAccountCpi, FreezeDelegatedAccountCpiAccounts,
    ThawDelegatedAccountCpi, ThawDelegatedAccountCpiAccounts,
};

#[cfg(not(feature = "no-entrypoint"))]
use solana_security_txt::security_txt;

declare_id!("51DFYj5Evdk3TnbipTmscxwt4HvJiYq5d3cfdriEEvqm");

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "CosmicGATE NFT Prediction Stake",
    project_url: "https://github.com/md5sha1/CosmicGATE-SOL",
    contacts: "link:https://github.com/md5sha1/CosmicGATE-SOL/security/advisories",
    policy: "https://github.com/md5sha1/CosmicGATE-SOL/blob/main/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/md5sha1/CosmicGATE-SOL",
    source_revision: "main",
    auditors: "N/A"
}

// ----------------------------
// Program
// ----------------------------
#[program]
pub mod nft_prediction_stake_v1 {
    use super::*;

    // 1) Initialize global treasury PDA + its tGATE ATA
    pub fn init_treasury(ctx: Context<InitTreasury>) -> Result<()> {
        let t = &mut ctx.accounts.treasury;
        t.admin = ctx.accounts.admin.key();
        t.gate_mint = ctx.accounts.gate_mint.key();
        t.bump = ctx.bumps.treasury;
        Ok(())
    }

    // 2) Refill treasury with tGATE (admin can call anytime)
    pub fn refill_treasury(ctx: Context<RefillTreasury>, amount: u64) -> Result<()> {
        require!(
            ctx.accounts.treasury.admin == ctx.accounts.admin.key(),
            ErrorCode::NotTreasuryAdmin
        );
        require!(amount > 0, ErrorCode::InvalidAmount);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.admin_gate_ata.to_account_info(),
                    to: ctx.accounts.treasury_gate_ata.to_account_info(),
                    authority: ctx.accounts.admin.to_account_info(),
                },
            ),
            amount,
        )?;

        msg!("Treasury refilled with {} tGATE", amount);
        Ok(())
    }

    // 2.5) Transfer treasury admin to a new address (current admin only)
    pub fn transfer_treasury_admin(
        ctx: Context<TransferTreasuryAdmin>,
        new_admin: Pubkey,
    ) -> Result<()> {
        require!(
            ctx.accounts.treasury.admin == ctx.accounts.admin.key(),
            ErrorCode::NotTreasuryAdmin
        );
        
        let old_admin = ctx.accounts.treasury.admin;
        ctx.accounts.treasury.admin = new_admin;
        
        msg!(
            "Treasury admin transferred from {} to {}",
            old_admin,
            new_admin
        );
        Ok(())
    }

    // 3) Create a match pool PDA (state only - no tokens held)
    // prize_pool is just a number representing reward amount for this match
    pub fn init_match_pool(
        ctx: Context<InitMatchPool>,
        match_id: u64,
        prize_pool: u64,
        max_nfts_per_user: u8,
    ) -> Result<()> {
        require!(max_nfts_per_user > 0, ErrorCode::InvalidMaxPerUser);
        require!(prize_pool > 0, ErrorCode::InvalidAmount);

        let pool = &mut ctx.accounts.match_pool;
        pool.match_id = match_id;
        pool.admin = ctx.accounts.admin.key();
        pool.prize_pool = prize_pool; // State only - no token movement
        pool.total_yes_weight = 0;
        pool.total_no_weight = 0;
        pool.resolved = false;
        pool.outcome = false;
        pool.max_nfts_per_user = max_nfts_per_user;
        pool.bump = ctx.bumps.match_pool;

        msg!(
            "Match pool #{} created. Prize: {} tGATE (state only)",
            match_id,
            prize_pool
        );
        Ok(())
    }

    // 4) Stake NFT: Approve delegate + Freeze (non-custodial lock)
    // No token movement - state only records the stake weight
    pub fn stake_nft(
        ctx: Context<StakeNft>,
        tier: Tier,
        estimated_sol_value: u64,
        prediction: bool,
    ) -> Result<()> {
        // Validation first
        require!(!ctx.accounts.match_pool.resolved, ErrorCode::MatchResolved);
        require!(ctx.accounts.nft_mint.decimals == 0, ErrorCode::InvalidNftMint);
        require!(ctx.accounts.nft_mint.supply == 1, ErrorCode::InvalidNftMint);
        require!(ctx.accounts.user_nft_ata.amount == 1, ErrorCode::InvalidNftAccount);

        // Cache all values we need before any mutable borrows
        let match_id = ctx.accounts.match_pool.match_id;
        let max_nfts = ctx.accounts.match_pool.max_nfts_per_user;
        let user_key = ctx.accounts.user.key();
        let nft_mint_key = ctx.accounts.nft_mint.key();
        let token_account_key = ctx.accounts.user_nft_ata.key();
        let stake_bump = ctx.bumps.stake_record;
        let user_position_bump = ctx.bumps.user_position;

        let band = resolve_value_band(estimated_sol_value);
        let weight = calculate_weight(tier, band);

        // Create AccountInfo bindings BEFORE the mutable borrows
        let token_metadata_program_info = ctx.accounts.token_metadata_program.to_account_info();
        let stake_record_info = ctx.accounts.stake_record.to_account_info();
        let user_nft_ata_info = ctx.accounts.user_nft_ata.to_account_info();
        let nft_edition_info = ctx.accounts.nft_edition.to_account_info();
        let nft_mint_info = ctx.accounts.nft_mint.to_account_info();
        let token_program_info = ctx.accounts.token_program.to_account_info();
        let user_info = ctx.accounts.user.to_account_info();

        // User cap per match
        let pos = &mut ctx.accounts.user_position;
        if pos.nft_count == 0 {
            pos.user = user_key;
            pos.match_id = match_id;
            pos.bump = user_position_bump;
        }
        require!(pos.nft_count < max_nfts, ErrorCode::MaxNftsExceeded);

        // Init stake record PDA
        let stake = &mut ctx.accounts.stake_record;
        stake.user = user_key;
        stake.match_id = match_id;
        stake.nft_mint = nft_mint_key;
        stake.token_account = token_account_key;
        stake.tier = tier;
        stake.estimated_sol_value = estimated_sol_value;
        stake.value_band = band;
        stake.prediction = prediction;
        stake.weight = weight;
        stake.claimed = false;
        stake.locked = true;
        stake.bump = stake_bump;

        // Update pool totals
        let pool = &mut ctx.accounts.match_pool;
        if prediction {
            pool.total_yes_weight = pool
                .total_yes_weight
                .checked_add(weight)
                .ok_or(ErrorCode::MathOverflow)?;
        } else {
            pool.total_no_weight = pool
                .total_no_weight
                .checked_add(weight)
                .ok_or(ErrorCode::MathOverflow)?;
        }

        // Step 1: Approve stake_record PDA as delegate for 1 token
        token::approve(
            CpiContext::new(
                token_program_info.clone(),
                Approve {
                    to: user_nft_ata_info.clone(),
                    delegate: stake_record_info.clone(),
                    authority: user_info,
                },
            ),
            1,
        )?;

        // Step 2: Freeze the token account via Metaplex Token Metadata
        let match_id_bytes = match_id.to_le_bytes();
        let stake_seeds: &[&[u8]] = &[
            b"stake",
            match_id_bytes.as_ref(),
            nft_mint_key.as_ref(),
            &[stake_bump],
        ];

        let freeze_cpi = FreezeDelegatedAccountCpi::new(
            &token_metadata_program_info,
            FreezeDelegatedAccountCpiAccounts {
                delegate: &stake_record_info,
                token_account: &user_nft_ata_info,
                edition: &nft_edition_info,
                mint: &nft_mint_info,
                token_program: &token_program_info,
            },
        );
        freeze_cpi.invoke_signed(&[stake_seeds])?;

        // Increment user position count
        ctx.accounts.user_position.nft_count = ctx.accounts.user_position.nft_count
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;
        
        msg!("NFT staked and frozen in user's wallet. Mint: {}", nft_mint_key);
        Ok(())
    }

    // 5) Resolve match (admin only)
    pub fn resolve_match(ctx: Context<ResolveMatch>, outcome: bool) -> Result<()> {
        let pool = &mut ctx.accounts.match_pool;
        require!(!pool.resolved, ErrorCode::MatchResolved);
        require!(pool.admin == ctx.accounts.admin.key(), ErrorCode::NotMatchAdmin);

        pool.outcome = outcome;
        pool.resolved = true;
        
        msg!("Match {} resolved. Outcome: {}", pool.match_id, outcome);
        Ok(())
    }

    // 6) Admin unlocks loser's NFT (called per loser, can batch multiple in one tx)
    // This thaws the NFT so losers can use their NFT again (but get no reward)
    pub fn unlock_loser(ctx: Context<UnlockLoser>) -> Result<()> {
        // Validation
        require!(ctx.accounts.match_pool.resolved, ErrorCode::MatchNotResolved);
        require!(ctx.accounts.stake_record.locked, ErrorCode::NotLocked);
        require!(
            ctx.accounts.stake_record.prediction != ctx.accounts.match_pool.outcome,
            ErrorCode::WinnersMustClaim
        );
        require!(
            ctx.accounts.match_pool.admin == ctx.accounts.admin.key(),
            ErrorCode::NotMatchAdmin
        );

        // Cache values needed for seeds and logging
        let match_id = ctx.accounts.stake_record.match_id;
        let nft_mint_key = ctx.accounts.stake_record.nft_mint;
        let stake_bump = ctx.accounts.stake_record.bump;
        let user_key = ctx.accounts.stake_record.user;

        // Create AccountInfo bindings
        let token_metadata_program_info = ctx.accounts.token_metadata_program.to_account_info();
        let stake_record_info = ctx.accounts.stake_record.to_account_info();
        let user_nft_ata_info = ctx.accounts.user_nft_ata.to_account_info();
        let nft_edition_info = ctx.accounts.nft_edition.to_account_info();
        let nft_mint_info = ctx.accounts.nft_mint.to_account_info();
        let token_program_info = ctx.accounts.token_program.to_account_info();

        // Build seeds for signing
        let match_id_bytes = match_id.to_le_bytes();
        let stake_seeds: &[&[u8]] = &[
            b"stake",
            match_id_bytes.as_ref(),
            nft_mint_key.as_ref(),
            &[stake_bump],
        ];

        // Thaw the NFT via Metaplex Token Metadata
        let thaw_cpi = ThawDelegatedAccountCpi::new(
            &token_metadata_program_info,
            ThawDelegatedAccountCpiAccounts {
                delegate: &stake_record_info,
                token_account: &user_nft_ata_info,
                edition: &nft_edition_info,
                mint: &nft_mint_info,
                token_program: &token_program_info,
            },
        );
        thaw_cpi.invoke_signed(&[stake_seeds])?;

        // NOTE: We don't revoke delegation here because only the token account owner can revoke,
        // and the admin is signing this tx (not the user). The delegation remains but is harmless
        // since we mark locked=false and won't use it again.

        // Update state
        ctx.accounts.stake_record.locked = false;

        msg!("Loser NFT unlocked. User: {}, Mint: {}", user_key, nft_mint_key);
        Ok(())
    }

    // 7) Winner claims reward + auto-unlock NFT
    pub fn claim_reward(ctx: Context<ClaimReward>) -> Result<()> {
        // Validation
        require!(ctx.accounts.match_pool.resolved, ErrorCode::MatchNotResolved);
        require!(ctx.accounts.stake_record.locked, ErrorCode::NotLocked);
        require!(!ctx.accounts.stake_record.claimed, ErrorCode::AlreadyClaimed);
        require!(
            ctx.accounts.stake_record.prediction == ctx.accounts.match_pool.outcome,
            ErrorCode::NotWinner
        );
        require!(ctx.accounts.match_pool.prize_pool > 0, ErrorCode::EmptyPrizePool);

        let winning_weight = if ctx.accounts.match_pool.outcome {
            ctx.accounts.match_pool.total_yes_weight
        } else {
            ctx.accounts.match_pool.total_no_weight
        };
        require!(winning_weight > 0, ErrorCode::NoWinners);

        // Calculate reward: stake.weight / winning_weight * prize_pool
        let stake_weight = ctx.accounts.stake_record.weight;
        let prize_pool = ctx.accounts.match_pool.prize_pool;
        let reward_u128 = (stake_weight as u128)
            .checked_mul(prize_pool as u128)
            .ok_or(ErrorCode::MathOverflow)?
            / winning_weight;
        let reward: u64 = reward_u128.try_into().map_err(|_| ErrorCode::MathOverflow)?;

        // Cache values for seeds and logging
        let match_id = ctx.accounts.stake_record.match_id;
        let nft_mint_key = ctx.accounts.stake_record.nft_mint;
        let stake_bump = ctx.accounts.stake_record.bump;
        let user_key = ctx.accounts.stake_record.user;
        let treasury_bump = ctx.accounts.treasury.bump;

        // Create AccountInfo bindings
        let token_metadata_program_info = ctx.accounts.token_metadata_program.to_account_info();
        let stake_record_info = ctx.accounts.stake_record.to_account_info();
        let user_nft_ata_info = ctx.accounts.user_nft_ata.to_account_info();
        let nft_edition_info = ctx.accounts.nft_edition.to_account_info();
        let nft_mint_info = ctx.accounts.nft_mint.to_account_info();
        let token_program_info = ctx.accounts.token_program.to_account_info();
        let treasury_gate_ata_info = ctx.accounts.treasury_gate_ata.to_account_info();
        let user_gate_ata_info = ctx.accounts.user_gate_ata.to_account_info();
        let treasury_info = ctx.accounts.treasury.to_account_info();
        let user_info = ctx.accounts.user.to_account_info();

        // Transfer tGATE reward from treasury to winner
        let treasury_seeds: &[&[u8]] = &[b"treasury", &[treasury_bump]];
        token::transfer(
            CpiContext::new_with_signer(
                token_program_info.clone(),
                Transfer {
                    from: treasury_gate_ata_info,
                    to: user_gate_ata_info,
                    authority: treasury_info,
                },
                &[treasury_seeds],
            ),
            reward,
        )?;

        // Build seeds for signing
        let match_id_bytes = match_id.to_le_bytes();
        let stake_seeds: &[&[u8]] = &[
            b"stake",
            match_id_bytes.as_ref(),
            nft_mint_key.as_ref(),
            &[stake_bump],
        ];

        // Thaw the NFT
        let thaw_cpi = ThawDelegatedAccountCpi::new(
            &token_metadata_program_info,
            ThawDelegatedAccountCpiAccounts {
                delegate: &stake_record_info,
                token_account: &user_nft_ata_info,
                edition: &nft_edition_info,
                mint: &nft_mint_info,
                token_program: &token_program_info,
            },
        );
        thaw_cpi.invoke_signed(&[stake_seeds])?;

        // Revoke delegation - user (token account owner) is signing this tx
        token::revoke(
            CpiContext::new(
                token_program_info,
                Revoke {
                    source: user_nft_ata_info,
                    authority: user_info, // User is the owner of the token account
                },
            ),
        )?;

        // Update state
        ctx.accounts.stake_record.claimed = true;
        ctx.accounts.stake_record.locked = false;

        msg!(
            "Winner claimed reward! User: {}, Reward: {} tGATE, NFT unlocked",
            user_key,
            reward
        );
        Ok(())
    }
}

// ----------------------------
// Helpers
// ----------------------------
fn resolve_value_band(v: u64) -> ValueBand {
    match v {
        x if x < 1_000_000_000 => ValueBand::Band1,
        x if x < 3_000_000_000 => ValueBand::Band2,
        x if x < 10_000_000_000 => ValueBand::Band3,
        _ => ValueBand::Band4,
    }
}

fn calculate_weight(tier: Tier, band: ValueBand) -> u128 {
    let tier_w: u128 = match tier {
        Tier::Common => 100,
        Tier::Limited => 150,
        Tier::Punk => 200,
        Tier::Legend => 300,
    };
    let band_w: u128 = match band {
        ValueBand::Band1 => 100,
        ValueBand::Band2 => 125,
        ValueBand::Band3 => 150,
        ValueBand::Band4 => 175,
    };
    tier_w * band_w
}

// ----------------------------
// Accounts
// ----------------------------
#[derive(Accounts)]
pub struct InitTreasury<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Treasury::SIZE,
        seeds = [b"treasury"],
        bump
    )]
    pub treasury: Account<'info, Treasury>,

    pub gate_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = gate_mint,
        associated_token::authority = treasury
    )]
    pub treasury_gate_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct InitMatchPool<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + MatchPool::SIZE,
        seeds = [b"match_pool", match_id.to_le_bytes().as_ref()],
        bump
    )]
    pub match_pool: Account<'info, MatchPool>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RefillTreasury<'info> {
    #[account(seeds = [b"treasury"], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,

    pub gate_mint: Account<'info, Mint>,

    #[account(mut, associated_token::mint = gate_mint, associated_token::authority = treasury)]
    pub treasury_gate_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(mut, associated_token::mint = gate_mint, associated_token::authority = admin)]
    pub admin_gate_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct TransferTreasuryAdmin<'info> {
    #[account(mut, seeds = [b"treasury"], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,

    #[account(mut)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct StakeNft<'info> {
    #[account(mut)]
    pub match_pool: Account<'info, MatchPool>,

    #[account(
        init,
        payer = user,
        space = 8 + StakeRecord::SIZE,
        seeds = [b"stake", match_pool.match_id.to_le_bytes().as_ref(), nft_mint.key().as_ref()],
        bump
    )]
    pub stake_record: Account<'info, StakeRecord>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserMatchPosition::SIZE,
        seeds = [b"user_position", match_pool.match_id.to_le_bytes().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_position: Account<'info, UserMatchPosition>,

    pub nft_mint: Account<'info, Mint>,

    /// The user's NFT token account (stays with user, will be frozen)
    #[account(
        mut,
        constraint = user_nft_ata.mint == nft_mint.key(),
        constraint = user_nft_ata.owner == user.key() @ ErrorCode::InvalidNftAccount
    )]
    pub user_nft_ata: Account<'info, TokenAccount>,

    /// NFT Master Edition PDA (required for freeze/thaw)
    /// CHECK: Validated by Metaplex Token Metadata program
    #[account(
        seeds = [
            b"metadata",
            mpl_token_metadata::ID.as_ref(),
            nft_mint.key().as_ref(),
            b"edition"
        ],
        seeds::program = mpl_token_metadata::ID,
        bump
    )]
    pub nft_edition: UncheckedAccount<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    
    /// CHECK: Metaplex Token Metadata program
    #[account(address = mpl_token_metadata::ID)]
    pub token_metadata_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ResolveMatch<'info> {
    #[account(mut)]
    pub match_pool: Account<'info, MatchPool>,
    #[account(mut)]
    pub admin: Signer<'info>,
}

/// Admin unlocks loser's NFT after match resolution
#[derive(Accounts)]
pub struct UnlockLoser<'info> {
    pub match_pool: Account<'info, MatchPool>,

    #[account(
        mut,
        seeds = [b"stake", match_pool.match_id.to_le_bytes().as_ref(), nft_mint.key().as_ref()],
        bump = stake_record.bump,
    )]
    pub stake_record: Account<'info, StakeRecord>,

    pub nft_mint: Account<'info, Mint>,

    /// The loser's NFT token account
    #[account(
        mut,
        constraint = user_nft_ata.mint == nft_mint.key(),
        constraint = user_nft_ata.key() == stake_record.token_account @ ErrorCode::InvalidNftAccount
    )]
    pub user_nft_ata: Account<'info, TokenAccount>,

    /// NFT Master Edition PDA
    /// CHECK: Validated by Metaplex Token Metadata program
    #[account(
        seeds = [
            b"metadata",
            mpl_token_metadata::ID.as_ref(),
            nft_mint.key().as_ref(),
            b"edition"
        ],
        seeds::program = mpl_token_metadata::ID,
        bump
    )]
    pub nft_edition: UncheckedAccount<'info>,

    /// Admin who resolved the match
    #[account(mut)]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token>,

    /// CHECK: Metaplex Token Metadata program
    #[account(address = mpl_token_metadata::ID)]
    pub token_metadata_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    pub match_pool: Account<'info, MatchPool>,

    #[account(
        mut,
        seeds = [b"stake", match_pool.match_id.to_le_bytes().as_ref(), nft_mint.key().as_ref()],
        bump = stake_record.bump,
        constraint = stake_record.user == user.key()
    )]
    pub stake_record: Account<'info, StakeRecord>,

    pub nft_mint: Account<'info, Mint>,

    /// Winner's NFT token account
    #[account(
        mut,
        constraint = user_nft_ata.mint == nft_mint.key(),
        constraint = user_nft_ata.key() == stake_record.token_account @ ErrorCode::InvalidNftAccount
    )]
    pub user_nft_ata: Account<'info, TokenAccount>,

    /// NFT Master Edition PDA
    /// CHECK: Validated by Metaplex Token Metadata program
    #[account(
        seeds = [
            b"metadata",
            mpl_token_metadata::ID.as_ref(),
            nft_mint.key().as_ref(),
            b"edition"
        ],
        seeds::program = mpl_token_metadata::ID,
        bump
    )]
    pub nft_edition: UncheckedAccount<'info>,

    #[account(seeds = [b"treasury"], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,

    pub gate_mint: Account<'info, Mint>,

    #[account(mut, associated_token::mint = gate_mint, associated_token::authority = treasury)]
    pub treasury_gate_ata: Account<'info, TokenAccount>,

    #[account(mut, associated_token::mint = gate_mint, associated_token::authority = user)]
    pub user_gate_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,

    /// CHECK: Metaplex Token Metadata program
    #[account(address = mpl_token_metadata::ID)]
    pub token_metadata_program: UncheckedAccount<'info>,
}

// ----------------------------
// State
// ----------------------------
#[account]
pub struct Treasury {
    pub admin: Pubkey,
    pub gate_mint: Pubkey,
    pub bump: u8,
}
impl Treasury {
    pub const SIZE: usize = 32 + 32 + 1;
}

#[account]
pub struct MatchPool {
    pub match_id: u64,
    pub admin: Pubkey,
    pub prize_pool: u64,
    pub total_yes_weight: u128,
    pub total_no_weight: u128,
    pub resolved: bool,
    pub outcome: bool,
    pub max_nfts_per_user: u8,
    pub bump: u8,
}
impl MatchPool {
    pub const SIZE: usize = 8 + 32 + 8 + 16 + 16 + 1 + 1 + 1 + 1;
}

#[account]
pub struct UserMatchPosition {
    pub user: Pubkey,
    pub match_id: u64,
    pub nft_count: u8,
    pub bump: u8,
}
impl UserMatchPosition {
    pub const SIZE: usize = 32 + 8 + 1 + 1;
}

#[account]
pub struct StakeRecord {
    pub user: Pubkey,
    pub match_id: u64,
    pub nft_mint: Pubkey,
    pub token_account: Pubkey, // User's ATA where NFT is frozen
    pub tier: Tier,
    pub estimated_sol_value: u64,
    pub value_band: ValueBand,
    pub prediction: bool,
    pub weight: u128,
    pub claimed: bool,
    pub locked: bool,
    pub bump: u8,
}
impl StakeRecord {
    // Added token_account (32 bytes)
    pub const SIZE: usize = 32 + 8 + 32 + 32 + 1 + 8 + 1 + 1 + 16 + 1 + 1 + 1;
}

// ----------------------------
// Enums
// ----------------------------
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum Tier {
    Common,
    Limited,
    Punk,
    Legend,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ValueBand {
    Band1, // <1 SOL
    Band2, // 1-3 SOL
    Band3, // 3-10 SOL
    Band4, // 10+ SOL cap
}

// ----------------------------
// Errors
// ----------------------------
#[error_code]
pub enum ErrorCode {
    #[msg("Match already resolved")]
    MatchResolved,
    #[msg("Match not resolved")]
    MatchNotResolved,
    #[msg("Not the match admin")]
    NotMatchAdmin,
    #[msg("Not the treasury admin")]
    NotTreasuryAdmin,
    #[msg("Max NFTs per user exceeded")]
    MaxNftsExceeded,
    #[msg("Invalid NFT mint (must be supply=1, decimals=0)")]
    InvalidNftMint,
    #[msg("Invalid NFT token account")]
    InvalidNftAccount,
    #[msg("Prize pool is empty")]
    EmptyPrizePool,
    #[msg("No winners on the winning side")]
    NoWinners,
    #[msg("Stake is not locked")]
    NotLocked,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Not a winner")]
    NotWinner,
    #[msg("Winners must claim rewards (losers should use unlock_loser)")]
    WinnersMustClaim,
    #[msg("Invalid max per user")]
    InvalidMaxPerUser,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Math overflow")]
    MathOverflow,
}
