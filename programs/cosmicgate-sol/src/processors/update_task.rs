use crate::{instructions::update_task::UpdateTask, program_error::ErrorCode};
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

    validate_status(status)?;

    task.status = status;            
    node.status = 0;

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

fn validate_status(
    status: u8
) -> Result<()> {
    //task status is already assigned status
    //so cannot update it to assigned status again
    if status == 1 {
        return Err(ErrorCode::CannotUpdateTaskStatus.into());
    }
    
    Ok(())
}
