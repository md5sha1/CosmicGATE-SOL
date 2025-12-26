use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

declare_id!("DddAu1n7DHrQHwmUmTe1LqWW7DCoR2XVxtxYcVoM3XSF"); // replace

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

    // 2) Create a match pool PDA (admin = creator)
    pub fn init_match_pool(
        ctx: Context<InitMatchPool>,
        match_id: u64,
        max_nfts_per_user: u8,
    ) -> Result<()> {
        require!(max_nfts_per_user > 0, ErrorCode::InvalidMaxPerUser);

        let pool = &mut ctx.accounts.match_pool;
        pool.match_id = match_id;
        pool.admin = ctx.accounts.admin.key();
        pool.prize_pool = 0; // funded later
        pool.total_yes_weight = 0;
        pool.total_no_weight = 0;
        pool.resolved = false;
        pool.outcome = false;
        pool.max_nfts_per_user = max_nfts_per_user;
        pool.bump = ctx.bumps.match_pool;
        Ok(())
    }

    // 3) Fund a match prize pool with tGATE (admin transfers into treasury ATA)
    pub fn fund_match_pool(ctx: Context<FundMatchPool>, amount: u64) -> Result<()> {
        let pool = &mut ctx.accounts.match_pool;
        let treasury = &ctx.accounts.treasury;

        require!(!pool.resolved, ErrorCode::MatchResolved);
        require!(pool.admin == ctx.accounts.admin.key(), ErrorCode::NotMatchAdmin);
        require!(treasury.admin == ctx.accounts.admin.key(), ErrorCode::NotTreasuryAdmin);
        require!(amount > 0, ErrorCode::InvalidAmount);

        // move tGATE from admin ATA -> treasury ATA
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

        pool.prize_pool = pool
            .prize_pool
            .checked_add(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        Ok(())
    }

    // 4) Stake NFT into escrow and record prediction
    pub fn stake_nft(
        ctx: Context<StakeNft>,
        tier: Tier,
        estimated_sol_value: u64, // lamports
        prediction: bool,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.match_pool;
        require!(!pool.resolved, ErrorCode::MatchResolved);

        // user cap per match
        let pos = &mut ctx.accounts.user_position;
        if pos.nft_count == 0 {
            pos.user = ctx.accounts.user.key();
            pos.match_id = pool.match_id;
            pos.bump = ctx.bumps.user_position;
        }
        require!(
            pos.nft_count < pool.max_nfts_per_user,
            ErrorCode::MaxNftsExceeded
        );

        // cheap NFT checks (v1)
        require!(ctx.accounts.nft_mint.decimals == 0, ErrorCode::InvalidNftMint);
        require!(ctx.accounts.nft_mint.supply == 1, ErrorCode::InvalidNftMint);
        require!(ctx.accounts.user_nft_ata.amount == 1, ErrorCode::InvalidNftAccount);

        let band = resolve_value_band(estimated_sol_value);
        let weight = calculate_weight(tier, band);

        // init stake record (PDA derived from match + nft mint)
        let stake = &mut ctx.accounts.stake_record;
        stake.user = ctx.accounts.user.key();
        stake.match_id = pool.match_id;
        stake.nft_mint = ctx.accounts.nft_mint.key();
        stake.tier = tier;
        stake.estimated_sol_value = estimated_sol_value;
        stake.value_band = band;
        stake.prediction = prediction;
        stake.weight = weight;
        stake.claimed = false;
        stake.locked = true;
        stake.bump = ctx.bumps.stake_record;

        // update pool totals
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

        // transfer NFT into escrow ATA owned by stake_record PDA
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_nft_ata.to_account_info(),
                    to: ctx.accounts.escrow_nft_ata.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            1,
        )?;

        pos.nft_count = pos.nft_count.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
        Ok(())
    }

    // 5) Resolve match (admin)
    pub fn resolve_match(ctx: Context<ResolveMatch>, outcome: bool) -> Result<()> {
        let pool = &mut ctx.accounts.match_pool;
        require!(!pool.resolved, ErrorCode::MatchResolved);
        require!(pool.admin == ctx.accounts.admin.key(), ErrorCode::NotMatchAdmin);

        pool.outcome = outcome;
        pool.resolved = true;
        Ok(())
    }

    // 6) Winners claim reward (tGATE) + auto-return NFT
    pub fn claim_reward(ctx: Context<ClaimReward>) -> Result<()> {
        let pool = &ctx.accounts.match_pool;
        let stake = &ctx.accounts.stake_record;

        require!(pool.resolved, ErrorCode::MatchNotResolved);
        require!(stake.locked, ErrorCode::NotLocked);
        require!(!stake.claimed, ErrorCode::AlreadyClaimed);
        require!(stake.prediction == pool.outcome, ErrorCode::NotWinner);
        require!(pool.prize_pool > 0, ErrorCode::EmptyPrizePool);

        let winning_weight = if pool.outcome {
            pool.total_yes_weight
        } else {
            pool.total_no_weight
        };
        require!(winning_weight > 0, ErrorCode::NoWinners);

        // reward = stake.weight / winning_weight * prize_pool
        let reward_u128 = (stake.weight as u128)
            .checked_mul(pool.prize_pool as u128)
            .ok_or(ErrorCode::MathOverflow)?
            / winning_weight;

        let reward: u64 = reward_u128.try_into().map_err(|_| ErrorCode::MathOverflow)?;

        // Cache values needed for seeds before mutable operations
        let match_id_bytes = stake.match_id.to_le_bytes();
        let nft_mint_key = stake.nft_mint;
        let stake_bump = stake.bump;

        // transfer tGATE from treasury -> user, signed by treasury PDA
        let treasury_seeds: &[&[u8]] = &[b"treasury", &[ctx.accounts.treasury.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.treasury_gate_ata.to_account_info(),
                    to: ctx.accounts.user_gate_ata.to_account_info(),
                    authority: ctx.accounts.treasury.to_account_info(),
                },
                &[treasury_seeds],
            ),
            reward,
        )?;

        // return NFT from escrow -> user, signed by stake_record PDA
        let stake_seeds: &[&[u8]] = &[
            b"stake",
            &match_id_bytes,
            nft_mint_key.as_ref(),
            &[stake_bump],
        ];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_nft_ata.to_account_info(),
                    to: ctx.accounts.user_nft_ata.to_account_info(),
                    authority: ctx.accounts.stake_record.to_account_info(),
                },
                &[stake_seeds],
            ),
            1,
        )?;

        // Update state
        ctx.accounts.stake_record.claimed = true;
        ctx.accounts.stake_record.locked = false;
        Ok(())
    }

    // 7) Losers can withdraw NFT after match resolved (no reward)
    pub fn unstake_loser(ctx: Context<UnstakeLoser>) -> Result<()> {
        let pool = &ctx.accounts.match_pool;
        let stake = &ctx.accounts.stake_record;

        require!(pool.resolved, ErrorCode::MatchNotResolved);
        require!(stake.locked, ErrorCode::NotLocked);
        require!(stake.prediction != pool.outcome, ErrorCode::WinnersMustClaim);

        // Cache values needed for seeds
        let match_id_bytes = stake.match_id.to_le_bytes();
        let nft_mint_key = stake.nft_mint;
        let stake_bump = stake.bump;

        let stake_seeds: &[&[u8]] = &[
            b"stake",
            &match_id_bytes,
            nft_mint_key.as_ref(),
            &[stake_bump],
        ];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_nft_ata.to_account_info(),
                    to: ctx.accounts.user_nft_ata.to_account_info(),
                    authority: ctx.accounts.stake_record.to_account_info(),
                },
                &[stake_seeds],
            ),
            1,
        )?;

        ctx.accounts.stake_record.locked = false;
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
pub struct FundMatchPool<'info> {
    #[account(mut)]
    pub match_pool: Account<'info, MatchPool>,

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

    #[account(mut, constraint = user_nft_ata.mint == nft_mint.key())]
    pub user_nft_ata: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = nft_mint,
        associated_token::authority = stake_record
    )]
    pub escrow_nft_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct ResolveMatch<'info> {
    #[account(mut)]
    pub match_pool: Account<'info, MatchPool>,
    #[account(mut)]
    pub admin: Signer<'info>,
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

    #[account(mut, constraint = user_nft_ata.mint == nft_mint.key())]
    pub user_nft_ata: Account<'info, TokenAccount>,

    #[account(mut, associated_token::mint = nft_mint, associated_token::authority = stake_record)]
    pub escrow_nft_ata: Account<'info, TokenAccount>,

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
}

#[derive(Accounts)]
pub struct UnstakeLoser<'info> {
    pub match_pool: Account<'info, MatchPool>,

    #[account(
        mut,
        seeds = [b"stake", match_pool.match_id.to_le_bytes().as_ref(), nft_mint.key().as_ref()],
        bump = stake_record.bump,
        constraint = stake_record.user == user.key()
    )]
    pub stake_record: Account<'info, StakeRecord>,

    pub nft_mint: Account<'info, Mint>,

    #[account(mut, constraint = user_nft_ata.mint == nft_mint.key())]
    pub user_nft_ata: Account<'info, TokenAccount>,

    #[account(mut, associated_token::mint = nft_mint, associated_token::authority = stake_record)]
    pub escrow_nft_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
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
    pub const SIZE: usize = 32 + 8 + 32 + 1 + 8 + 1 + 1 + 16 + 1 + 1 + 1;
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
    #[msg("Invalid NFT token account (must hold exactly 1)")]
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
    #[msg("Winners must claim (claim returns NFT)")]
    WinnersMustClaim,
    #[msg("Invalid max per user")]
    InvalidMaxPerUser,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Math overflow")]
    MathOverflow,
}
