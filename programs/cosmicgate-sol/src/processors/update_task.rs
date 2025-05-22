use crate::instructions::update_task::UpdateTask;
use anchor_lang::prelude::*;

#[event]
pub struct TaskUpdatedEvent {
    pub task: Pubkey,
    pub task_id: u64,
    pub node: Pubkey,
    pub node_id: u64,
    pub owner: Pubkey,
    pub status: u8,
}

pub fn exec(ctx: Context<UpdateTask>, task_id: u64, status: u8) -> Result<()> {
    let task = &mut ctx.accounts.task.load_mut()?;
    let node = &mut ctx.accounts.node.load_mut()?;

    task.status = status;
    node.status = status;

    emit_cpi!(TaskUpdatedEvent {
        task: ctx.accounts.task.key(),
        task_id: task_id,
        node: ctx.accounts.node.key(),
        node_id: node.node_id,
        owner: task.creator,
        status,
    });
    Ok(())
}
