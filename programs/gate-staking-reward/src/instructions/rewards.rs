use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

use crate::state::{creator::Creator, orchestrator::Orchestrator, rpool::RewardPool, task::Task, node::Node, errors::ErrorCode};

#[derive(Accounts)]
#[instruction(task_id: u64)]
pub struct CreateTaskReward<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(mut, has_one = admin)]
    pub orchestrator: Account<'info, Orchestrator>,

    #[account(
        init_if_needed,
        payer = admin,
        space = Creator::LEN,
        seeds = [b"creator", signer.key().as_ref()],
        bump,
    )]
    pub creator: Account<'info, Creator>,

    #[account(
        init,
        payer = admin,
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
        payer = admin,
        associated_token::mint = gate_mint,
        associated_token::authority = signer
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(task_id: u64)]
pub struct SubmitTaskReward<'info> {
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

pub fn create_task_reward(ctx: Context<CreateTaskReward>, task_id: u64) -> Result<()> {
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

    if rpool.amount < amount {
        msg!("Reward pool balance is not enough");
        return Err(ErrorCode::NotEnoughFunds.into());
    }

    rpool.amount -= amount;
    msg!(
        "Task {} is created by {} and creator is rewarded with {} GATE",
        task.id,
        task.creator,
        base_reward,
    );

    Ok(())
}

pub fn submit_task_reward(ctx: Context<SubmitTaskReward>, _task_id: u64) -> Result<()> {
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
    rpool.amount += amount;
    msg!(
        "Reward pool charged {} by charger: {}",
        amount,
        ctx.accounts.charger.key()
    );

    Ok(())
}
