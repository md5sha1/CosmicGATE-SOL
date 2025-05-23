use anchor_lang::prelude::*;

use crate::account_data::state::State;
use crate::instructions::initialize::Initialize;

pub fn exec(ctx: Context<Initialize>) -> Result<()> {
    let state  = &mut ctx.accounts.state.load_init()?;
    
    **state = State::new(ctx.accounts.creator.key());
    Ok(())
}
