use crate::{
    account_data::{node::Node, task::Task}, instructions::assign_task::AssignTask, program_error::ErrorCode,
};
use anchor_lang::prelude::*;

#[event]
pub struct TaskEvent {
    pub task: Pubkey,
    pub task_id: u64,
    pub node: Option<Pubkey>,
    pub node_id: Option<u64>,
    pub owner: Pubkey,
    pub required_cpu: u64,
    pub required_memory: u64,
    pub required_storage: u64,
    pub data_hash: [u8; 128],
    pub result_hash: [u8; 128],
}

pub fn exec(
    ctx: Context<AssignTask>,
    required_cpu: u64,
    required_memory: u64,
    required_storage: u64,
    data_hash: [u8; 128],
    result_hash: [u8; 128],
) -> Result<()> {
    let task = &mut ctx.accounts.task.load_init()?;
    let node = &mut ctx.accounts.node.load_mut()?;
    let state = &mut ctx.accounts.state.load_mut()?;

    validate_node(node, required_cpu, required_memory, required_storage)?;

    **task = Task::new(
        state.task_count,
        ctx.accounts.creator.key(),
        required_cpu,
        required_memory,
        required_storage,
        ctx.accounts.node.key(),
        node.node_id,
        0,
        data_hash,
        result_hash,
        ctx.bumps.task,
    );

    emit_cpi!(TaskEvent {
        task: ctx.accounts.task.key(),
        task_id: state.task_count,
        node: Some(ctx.accounts.node.key()),
        node_id: Some(ctx.accounts.node.load()?.node_id),
        owner: ctx.accounts.creator.key(),
        required_cpu,
        required_memory,
        required_storage,
        data_hash,
        result_hash,
    });

    //update task count
    state.task_count += 1;
    //update status to busy
    node.status = 1;
    Ok(())
}

fn validate_node(
    node: &Node,
    required_cpu: u64,
    required_memory: u64,
    required_storage: u64,
) -> Result<()> {
    //if the node is not idle, cannot assign task
    if node.status != 0 {
        return Err(ErrorCode::NodeNotIdle.into());
    }
    if node.cpu < required_cpu  {
        return Err(ErrorCode::NodeNotEnoughCpu.into());
    }

    if node.memory < required_memory {
        return Err(ErrorCode::NodeNotEnoughMemory.into());
    }

    if node.storage < required_storage {
        return Err(ErrorCode::NodeNotEnoughStorage.into());
    }
    Ok(())
}
