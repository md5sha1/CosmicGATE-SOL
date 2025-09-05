use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

use crate::state::{
    errors::ErrorCode, node::Node, orchestrator::Orchestrator, rpool::RewardPool, stake::Stake,
    task::Task,
};

#[derive(Accounts)]
#[instruction(task_id: u64)]
pub struct SubmitTaskResult<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"orchestrator"],
        bump,
    )]
    pub orchestrator: Account<'info, Orchestrator>,

    #[account(
        init_if_needed,
        payer = operator,
        space = Node::LEN,
        seeds = [b"node", operator.key().as_ref()],
        bump,
    )]
    pub node: Account<'info, Node>,

    #[account(
        mut,
        seeds = [b"task", task_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub task: Account<'info, Task>,

    #[account(mut)]
    pub gate_mint: Account<'info, Mint>,

    #[account(mut, seeds = [b"reward_pool"], bump)]
    pub reward_pool: Account<'info, RewardPool>,

    #[account(
        mut,
        associated_token::mint = gate_mint,
        associated_token::authority = reward_pool,
    )]
    pub rpool_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = operator,
        associated_token::mint = gate_mint,
        associated_token::authority = operator
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ActStake<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"orchestrator"],
        bump,
    )]
    pub orchestrator: Account<'info, Orchestrator>,

    #[account(
        init_if_needed,
        payer = operator,
        space = Stake::LEN,
        seeds = [b"stake", operator.key().as_ref()],
        bump,
    )]
    pub stake: Account<'info, Stake>,

    #[account(mut)]
    pub gate_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = operator,
        associated_token::mint = gate_mint,
        associated_token::authority = stake,
    )]
    pub stake_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = gate_mint,
        associated_token::authority = operator
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ActUnstake<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"orchestrator"],
        bump,
    )]
    pub orchestrator: Account<'info, Orchestrator>,

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

    #[account(
        mut,
        associated_token::mint = gate_mint,
        associated_token::authority = operator
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn submit_task_reward(ctx: Context<SubmitTaskResult>, _task_id: u64) -> Result<()> {
    let task = &mut ctx.accounts.task;
    require!(!task.completed, ErrorCode::TaskAlreadyCompleted);
    task.complete(ctx.accounts.operator.key())?;

    let node = &mut ctx.accounts.node;
    node.initialize(ctx.accounts.operator.key(), ctx.bumps.node)?;
    node.completed_tasks += 1;

    let decimals = ctx.accounts.gate_mint.decimals;
    let base_reward = ctx.accounts.orchestrator.base_reward;
    let rebate_rate = ctx.accounts.orchestrator.rebate_rate;
    let amount = (base_reward + rebate_rate) * 10u64.pow(decimals as u32 - 1);

    let rpool = &mut ctx.accounts.reward_pool;
    let seeds = rpool.seeds();
    let signer = &[&seeds[..]];
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.rpool_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: rpool.to_account_info(),
        },
        signer,
    );
    token::transfer(transfer_ctx, amount)?;
    rpool.amount -= amount;
    msg!(
        "Task {} created by {} is submitted by operator {}, operator is rewarded with {} GATE",
        task.id,
        task.creator,
        task.operator,
        base_reward + rebate_rate,
    );

    Ok(())
}

pub fn stake(ctx: Context<ActStake>, amount: u64, lock_days: u64) -> Result<()> {
    let stake = &mut ctx.accounts.stake;
    stake.initialize(ctx.accounts.operator.key(), ctx.bumps.stake)?;
    stake.since = Clock::get()?.unix_timestamp as u64;
    stake.lock_end = stake.since + lock_days * 24 * 60 * 60;
    stake.amount += amount;
    if stake.amount > ctx.accounts.orchestrator.min_stake {
        stake.active = true;
    }

    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.stake_token_account.to_account_info(),
            authority: ctx.accounts.operator.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;
    msg!(
        "Stake {} locked by operator: {}",
        amount,
        ctx.accounts.operator.key()
    );

    Ok(())
}

pub fn unstake(ctx: Context<ActUnstake>, amount: u64) -> Result<()> {
    let stake = &mut ctx.accounts.stake;
    stake.amount -= amount;
    require!(stake.amount > 0, ErrorCode::InsufficientStake);
    require!(
        Clock::get()?.unix_timestamp as u64 >= stake.lock_end,
        ErrorCode::StillLocked
    );
    if stake.amount < ctx.accounts.orchestrator.min_stake {
        stake.active = false;
    }

    let seeds = stake.seeds();
    let signer = &[&seeds[..]];
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.stake_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: stake.to_account_info(),
        },
        signer,
    );
    token::transfer(transfer_ctx, amount)?;
    msg!(
        "Stake {} locked by operator: {}",
        amount,
        ctx.accounts.operator.key()
    );

    Ok(())
}
