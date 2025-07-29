use crate::{instructions::update_task::UpdateTask, program_error::ErrorCode};
use anchor_lang::prelude::*;

#[event]
pub struct TaskUpdatedEvent {
    pub task: Pubkey,
    pub task_seed: Pubkey,
    pub task_id: u64,
    pub node: Pubkey,
    pub node_seed: Pubkey,
    pub owner: Pubkey,
    pub crc: String,
    pub uuid: String,
    pub hash: String,
    pub status: u8,
}

pub fn exec(ctx: Context<UpdateTask>, node_seed: Pubkey, task_seed: Pubkey, crc: String, status: u8, uuid: String, hash: String) -> Result<()> {
    let task = &mut ctx.accounts.task.load_mut()?;
    let node = &mut ctx.accounts.node.load_mut()?;

    validate_status(task.status, status)?;    
    task.validate_uuid(&uuid)?;

    task.status = status;
    node.status = 0;

    emit_cpi!(TaskUpdatedEvent {
        task: ctx.accounts.task.key(),
        task_seed,
        task_id: task.id,
        node: ctx.accounts.node.key(),
        node_seed: node_seed,
        owner: task.creator,
        crc,
        uuid,
        hash,
        status,
    });
    Ok(())
}

fn validate_status(original_status: u8, new_status: u8) -> Result<()> {
    //task status is already assigned status
    //so cannot update it to assigned status again
    if new_status == 1 {
        return Err(ErrorCode::CannotUpdateTaskStatus.into());
    }

    Ok(())
}
