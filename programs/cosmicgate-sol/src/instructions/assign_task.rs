use crate::account_data::{node::Node, state::State, task::Task};
use anchor_lang::prelude::*;
use crate::program_error::ErrorCode;

#[derive(Accounts)]
#[event_cpi]
#[instruction(node_seed: Pubkey, task_seed: Pubkey)]
pub struct AssignTask<'info> {
    #[account(mut)]
    pub state: AccountLoader<'info, State>,

    #[account(init,
        payer = creator,
        space = Task::MAX_SIZE,
        seeds = [b"task".as_ref(), state.key().as_ref(), task_seed.as_ref()],
        bump,   
    )]
    pub task: AccountLoader<'info, Task>,

    #[account(mut, seeds = [b"node".as_ref(), state.key().as_ref(), node_seed.as_ref()], bump)]
    pub node: AccountLoader<'info, Node>,

    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> AssignTask<'info> {
    pub fn validate(&self) -> Result<()> {
        let task = self.task.load()?;
        require!(task.creator == self.creator.key(), ErrorCode::TaskCreatorMismatch);
        Ok(())
    }
}
