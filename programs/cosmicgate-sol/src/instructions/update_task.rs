use crate::account_data::{node::Node, state::State, task::Task};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[event_cpi]
#[instruction(task_id: u64)]
pub struct UpdateTask<'info> {    
    #[account(mut)]
    pub state: AccountLoader<'info, State>,

    #[account(mut,        
        constraint = task.load()?.creator == creator.key(),
        seeds = [b"task".as_ref(), state.key().as_ref(), task_id.to_string().as_ref()],
        bump = task.load()?.bump,
    )]
    pub task: AccountLoader<'info, Task>,

    #[account(mut, seeds = [b"node".as_ref(), state.key().as_ref(), task.load()?.node_seed.as_ref()], bump = node.load()?.bump)]
    pub node: AccountLoader<'info, Node>,

    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}
