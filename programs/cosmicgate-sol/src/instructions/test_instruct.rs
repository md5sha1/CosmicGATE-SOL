use anchor_lang::prelude::*;
use crate::account_data::test::Test;


#[derive(Accounts)]
#[event_cpi]
pub struct TestInstruct<'info> {
    #[account(init,
        payer = creator,
        space = Test::MAX_SIZE,        
    )]
    pub test: AccountLoader<'info, Test>,

    #[account(mut)]
    pub creator: Signer<'info>,    
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct UpdateTestInstruct<'info> {
    #[account(mut)]
    pub test: AccountLoader<'info, Test>,
    
    #[account(mut)]
    pub creator: Signer<'info>,    
    pub system_program: Program<'info, System>,
}