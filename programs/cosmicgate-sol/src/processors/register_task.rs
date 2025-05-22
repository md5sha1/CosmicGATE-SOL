use crate::{account_data::task::Task, instructions::assign_task::AssignTask, program_error::ErrorCode};
use anchor_lang::prelude::*;

#[event]
pub struct TaskEvent {
    pub task: Pubkey,
    pub task_id: u64,
    pub node: Pubkey,
    pub node_id: u64,
    pub owner: Pubkey,
    pub required_cpu: u16,
    pub required_memory: u16,
    pub required_storage: u16,
}

pub fn exec(ctx: Context<AssignTask>, required_cpu: u16, required_memory: u16, required_storage: u16, price: u64) -> Result<()> {
    let task = &mut ctx.accounts.task.load_init()?;
    let node = ctx.accounts.node.load()?;
    let mut state = ctx.accounts.state.load_mut()?;
    if node.status == 1 { //Task already assigned
        return Err(ErrorCode::NodeWorking.into());
    }

    **task = Task::new(
        state.task_count,
        ctx.accounts.creator.key(),
        required_cpu,
        required_memory,
        required_storage,
        ctx.accounts.node.key(),
        price,
        0,
        ctx.bumps.task,
    );

    emit_cpi!(TaskEvent {
        task: ctx.accounts.task.key(),
        task_id: state.task_count,
        node: ctx.accounts.node.key(),
        node_id: ctx.accounts.node.load()?.node_id,
        owner: ctx.accounts.creator.key(),
        required_cpu,
        required_memory,
        required_storage,
    });

    state.task_count += 1;
    Ok(())
}
