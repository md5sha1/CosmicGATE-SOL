use anchor_lang::prelude::*;

use crate::account_data::node::Node;


#[derive(Accounts)]
#[event_cpi]
pub struct RegisterNode<'info> {
    #[account(init,
        payer = creator,
        space = Node::MAX_SIZE,
        seeds = [
            b"node",
            creator.key().as_ref()
        ],
        bump
    )]
    pub node:AccountLoader<'info, Node>,

    #[account(mut)]
  pub creator: Signer<'info>,
  pub system_program: Program<'info, System>,
}