use crate::{account_data::task::Task, instructions::task_queue::TaskQueue};
use anchor_lang::prelude::*;

#[event]
pub struct TaskEvent {
    pub task: Pubkey,
    pub owner: Pubkey,
    pub node_id: Pubkey,
    pub price: u64,
}

pub fn exec(ctx: Context<TaskQueue>, price: u64) -> Result<()> {
    let task = &mut ctx.accounts.task_account.load_init()?;
    **task = Task::new(
        ctx.accounts.task_account.key(),
        ctx.accounts.creator.key(),
        ctx.accounts.node_id.key(),
        price,
    );
    Ok(())
}
