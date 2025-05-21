use anchor_lang::prelude::*;
use crate::account_data::task::Task;


#[derive(Accounts)]
#[event_cpi]
pub struct TaskQueue<'info> {
    #[account(init,
        payer = creator,
        space = Task::MAX_SIZE,        
    )]
    pub task_account: AccountLoader<'info, Task>,
    /// CHECK
    pub node_id: AccountInfo<'info>,

    #[account(mut)]
    pub creator: Signer<'info>,    
    pub system_program: Program<'info, System>,
}