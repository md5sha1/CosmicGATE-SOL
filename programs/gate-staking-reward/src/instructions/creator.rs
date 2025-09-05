use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

use crate::state::{creator::Creator, orchestrator::Orchestrator, rpool::RewardPool, task::Task};

#[derive(Accounts)]
#[instruction(task_id: u64)]
pub struct CreateTask<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"orchestrator"],
        bump,
    )]
    pub orchestrator: Account<'info, Orchestrator>,

    #[account(
        init_if_needed,
        payer = signer,
        space = Creator::LEN,
        seeds = [b"creator", signer.key().as_ref()],
        bump,
    )]
    pub creator: Account<'info, Creator>,

    #[account(
        init,
        payer = signer,
        space = Task::LEN,
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
        payer = signer,
        associated_token::mint = gate_mint,
        associated_token::authority = signer
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn create_task_reward(ctx: Context<CreateTask>, task_id: u64) -> Result<()> {
    let task = &mut ctx.accounts.task;
    task.initialize(task_id, ctx.accounts.signer.key(), ctx.bumps.task)?;

    let creator = &mut ctx.accounts.creator;
    creator.initialize(ctx.accounts.signer.key(), ctx.bumps.creator)?;
    creator.image_count += 1;

    let decimals = ctx.accounts.gate_mint.decimals;
    let base_reward = ctx.accounts.orchestrator.base_reward;
    let amount = base_reward * 10u64.pow(decimals as u32 - 1);

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
        "Task {} is created by {} and creator is rewarded with {} GATE",
        task.id,
        task.creator,
        base_reward,
    );

    Ok(())
}
