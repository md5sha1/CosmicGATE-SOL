use crate::account_data::{node::Node, state::State, task::Task};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[event_cpi]
#[instruction(node_seed: Pubkey, task_seed: Pubkey)]
pub struct UpdateTask<'info> {    
    #[account(mut)]
    pub state: AccountLoader<'info, State>,

    #[account(mut,        
        constraint = task.load()?.creator == creator.key(),
        seeds = [b"task".as_ref(), state.key().as_ref(), task_seed.as_ref()],
        bump = task.load()?.bump,
    )]
    pub task: AccountLoader<'info, Task>,

    #[account(mut, seeds = [b"node".as_ref(), state.key().as_ref(), node_seed.as_ref()], bump)]
    pub node: AccountLoader<'info, Node>,

    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}
