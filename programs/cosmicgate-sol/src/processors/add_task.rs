use crate::{
    account_data::{node::Node, task::Task}, instructions::assign_task::AssignTask, program_error::ErrorCode,
};
use anchor_lang::prelude::*;

#[event]
pub struct TaskEvent {
    pub task: Pubkey,
    pub task_seed: Pubkey,
    pub task_id: u64,
    pub node: Option<Pubkey>,
    pub node_seed: Option<Pubkey>,
    pub owner: Pubkey,
    pub uuid: String,
    pub metadata_url: String,    
}

pub fn exec(
    ctx: Context<AssignTask>,
    node_seed: Pubkey,    
    task_seed: Pubkey,
    uuid: String,
    metadata_url: String,
) -> Result<()> {
    let task = &mut ctx.accounts.task.load_init()?;
    let node = &mut ctx.accounts.node.load_mut()?;
    let state = &mut ctx.accounts.state.load_mut()?;

    // validate_node(node)?;

    **task = Task::new(
        state.task_count,
        &uuid,
        task_seed.key(),
        ctx.accounts.creator.key(),
        ctx.accounts.node.key(),
        node_seed.key(),
        &metadata_url,
        "",
        ctx.bumps.task,
    );

    emit_cpi!(TaskEvent {
        task: ctx.accounts.task.key(),
        task_seed: task_seed,
        task_id: state.task_count,
        node: Some(ctx.accounts.node.key()),
        node_seed: Some(node_seed),
        owner: ctx.accounts.creator.key(),
        uuid,
        metadata_url,      
    });

    //update task count
    state.task_count += 1;
    //update status to busy
    node.status = 1;
    Ok(())
}

fn validate_node(
    node: &Node,
) -> Result<()> {
    //if the node is not idle, cannot assign task
    if node.status != 0 {
        return Err(ErrorCode::NodeNotIdle.into());
    }
    // if node.cpu < required_cpu  {
    //     return Err(ErrorCode::NodeNotEnoughCpu.into());
    // }

    // if node.memory < required_memory {
    //     return Err(ErrorCode::NodeNotEnoughMemory.into());
    // }

    // if node.storage < required_storage {
    //     return Err(ErrorCode::NodeNotEnoughStorage.into());
    // }
    Ok(())
}
