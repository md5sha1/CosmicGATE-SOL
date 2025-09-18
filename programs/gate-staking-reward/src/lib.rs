use anchor_lang::prelude::*;

declare_id!("CKPRD8BmgaejmMBC55YzqqMDt834hSu8A2JezTxdnahM");

mod instructions;
mod state;

use instructions::orchestrator::*;
use instructions::rewards::*;
use instructions::staking::*;

#[program]
pub mod gate_staking_reward {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::orchestrator::initialize(ctx)
    }

    pub fn set_admin(ctx: Context<SetValues>, admin: Pubkey) -> Result<()> {
        instructions::orchestrator::set_admin(ctx, admin)
    }

    pub fn set_sol_price(ctx: Context<SetValues>, sol_price: u64) -> Result<()> {
        instructions::orchestrator::set_sol_price(ctx, sol_price)
    }

    pub fn set_treasury(ctx: Context<SetValues>, treasury: Pubkey) -> Result<()> {
        instructions::orchestrator::set_treasury(ctx, treasury)
    }

    pub fn set_min_stake(ctx: Context<SetValues>, min_stake: u64) -> Result<()> {
        instructions::orchestrator::set_min_stake(ctx, min_stake)
    }

    pub fn set_base_reward(ctx: Context<SetValues>, base_reward: u64) -> Result<()> {
        instructions::orchestrator::set_base_reward(ctx, base_reward)
    }

    pub fn set_rebate_rate(ctx: Context<SetValues>, rebate_rate: u64) -> Result<()> {
        instructions::orchestrator::set_rebate_rate(ctx, rebate_rate)
    }

    pub fn set_slash_pct(ctx: Context<SetValues>, slash_pct: u64) -> Result<()> {
        instructions::orchestrator::set_slash_pct(ctx, slash_pct)
    }

    pub fn slash(ctx: Context<Slash>) -> Result<()> {
        instructions::orchestrator::slash(ctx)
    }

    pub fn create_task_reward(ctx: Context<CreateTaskReward>, task_id: u64) -> Result<()> {
        instructions::rewards::create_task_reward(ctx, task_id)
    }

    pub fn submit_task_reward(ctx: Context<SubmitTaskReward>, task_id: u64) -> Result<()> {
        instructions::rewards::submit_task_reward(ctx, task_id)
    }

    pub fn charge_reward(ctx: Context<ChargeReward>, amount: u64) -> Result<()> {
        instructions::rewards::charge_reward(ctx, amount)
    }

    pub fn stake(ctx: Context<ActStake>, amount: u64, lock_days: u64) -> Result<()> {
        instructions::staking::stake(ctx, amount, lock_days)
    }

    pub fn unstake(ctx: Context<ActUnstake>, amount: u64) -> Result<()> {
        instructions::staking::unstake(ctx, amount)
    }
}
