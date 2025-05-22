use anchor_lang::prelude::*;
use crate::account_data::state::State;

#[derive(Accounts)]
pub struct Initialize<'info> {
  /// The state account of each instance of this program
  #[account(
    init,
    payer = creator,
    space = State::MAX_SIZE,
  )]
  pub state: AccountLoader<'info, State>,
  
  #[account(mut)]
  pub creator: Signer<'info>,
  
  pub system_program: Program<'info, System>,
}
