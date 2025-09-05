use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Burn, Mint, Token, TokenAccount, Transfer},
};

use crate::state::{orchestrator::Orchestrator, stake::Stake};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = Orchestrator::LEN,
        seeds = [b"orchestrator"],
        bump,
    )]
    pub orchestrator: Account<'info, Orchestrator>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct SetValues<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(mut, has_one = admin)]
    pub orchestrator: Account<'info, Orchestrator>,
}

#[derive(Accounts)]
pub struct Slash<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(mut, has_one = admin)]
    pub orchestrator: Account<'info, Orchestrator>,

    /// CHECK: This is the operator to slash
    #[account(mut)]
    pub operator: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"stake", operator.key().as_ref()],
        bump,
    )]
    pub stake: Account<'info, Stake>,

    #[account(mut)]
    pub gate_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = gate_mint,
        associated_token::authority = stake,
    )]
    pub stake_token_account: Account<'info, TokenAccount>,

    /// CHECK: This is the treasury address
    #[account(mut)]
    pub treasury: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = gate_mint,
        associated_token::authority = treasury,
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let orchestrator = &mut ctx.accounts.orchestrator;
    orchestrator.initialize(ctx.accounts.admin.key(), ctx.bumps.orchestrator)?;
    Ok(())
}

pub fn set_sol_price(ctx: Context<SetValues>, sol_price: u64) -> Result<()> {
    let orchestrator = &mut ctx.accounts.orchestrator;
    orchestrator.set_sol_price(sol_price)?;
    Ok(())
}

pub fn set_treasury(ctx: Context<SetValues>, treasury: Pubkey) -> Result<()> {
    let orchestrator = &mut ctx.accounts.orchestrator;
    orchestrator.set_treasury(treasury)?;
    Ok(())
}

pub fn set_min_stake(ctx: Context<SetValues>, min_stake: u64) -> Result<()> {
    let orchestrator = &mut ctx.accounts.orchestrator;
    orchestrator.set_min_stake(min_stake)?;
    Ok(())
}

pub fn set_base_reward(ctx: Context<SetValues>, base_reward: u64) -> Result<()> {
    let orchestrator = &mut ctx.accounts.orchestrator;
    orchestrator.set_base_reward(base_reward)?;
    Ok(())
}

pub fn set_rebate_rate(ctx: Context<SetValues>, rebate_rate: u64) -> Result<()> {
    let orchestrator = &mut ctx.accounts.orchestrator;
    orchestrator.set_rebate_rate(rebate_rate)?;
    Ok(())
}

pub fn set_slash_pct(ctx: Context<SetValues>, slash_pct: u64) -> Result<()> {
    let orchestrator = &mut ctx.accounts.orchestrator;
    orchestrator.set_slash_pct(slash_pct)?;
    Ok(())
}

pub fn slash(ctx: Context<Slash>) -> Result<()> {
    let orchestrator = &mut ctx.accounts.orchestrator;
    let stake = &mut ctx.accounts.stake;
    let stake_slash_amount = orchestrator.get_slash_amount(stake.amount)?;
    stake.amount -= stake_slash_amount;

    let seeds = stake.seeds();
    let signer = &[&seeds[..]];
    if orchestrator.treasury != Pubkey::default() {
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.stake_token_account.to_account_info(),
                to: ctx.accounts.treasury_token_account.to_account_info(),
                authority: stake.to_account_info(),
            },
            signer,
        );
        token::transfer(transfer_ctx, stake_slash_amount)?;
    } else {
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                from: ctx.accounts.stake_token_account.to_account_info(),
                mint: ctx.accounts.gate_mint.to_account_info(),
                authority: stake.to_account_info(),
            },
            signer,
        );
        token::burn(transfer_ctx, stake_slash_amount)?;
    }

    Ok(())
}
