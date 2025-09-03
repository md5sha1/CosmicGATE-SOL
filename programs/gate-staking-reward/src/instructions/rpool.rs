use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

use crate::state::rpool::RewardPool;

#[derive(Accounts)]
pub struct ChargeReward<'info> {
    #[account(mut)]
    pub charger: Signer<'info>,

    #[account(mut)]
    pub gate_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = charger,
        space = RewardPool::LEN,
        seeds = [b"reward_pool"],
        bump,
    )]
    pub reward_pool: Account<'info, RewardPool>,

    #[account(
        init_if_needed,
        payer = charger,
        associated_token::mint = gate_mint,
        associated_token::authority = reward_pool,
    )]
    pub rpool_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = gate_mint,
        associated_token::authority = charger
    )]
    pub charger_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn charge_reward(ctx: Context<ChargeReward>, amount: u64) -> Result<()> {
    let rpool = &mut ctx.accounts.reward_pool;
    rpool.initialize(ctx.bumps.reward_pool)?;

    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.charger_token_account.to_account_info(),
            to: ctx.accounts.rpool_token_account.to_account_info(),
            authority: ctx.accounts.charger.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;
    msg!(
        "Reward pool charged {} by charger: {}",
        amount,
        ctx.accounts.charger.key()
    );

    Ok(())
}
