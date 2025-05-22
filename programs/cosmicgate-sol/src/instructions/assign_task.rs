use crate::account_data::{node::Node, state::State, task::Task};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[event_cpi]
pub struct AssignTask<'info> {
    #[account(mut)]
    pub state: AccountLoader<'info, State>,

    #[account(init,
        payer = creator,
        space = Task::MAX_SIZE,
        seeds = [b"task".as_ref(), state.key().as_ref(), state.load()?.task_count.to_string().as_ref()],
        bump,
    )]
    pub task: AccountLoader<'info, Task>,

    #[account(mut, seeds = [b"node".as_ref(), state.key().as_ref(), state.load()?.node_count.to_string().as_ref()], bump = node.load()?.bump)]
    pub node: AccountLoader<'info, Node>,

    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}
