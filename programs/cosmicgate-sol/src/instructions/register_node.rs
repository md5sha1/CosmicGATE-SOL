use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;


use crate::account_data::node::Node;

#[derive(Accounts)]
#[event_cpi]
pub struct RegisterNode<'info> {
    #[account(init,
        payer = creator,
        space = Node::MAX_SIZE,
        seeds = [
            b"node",
            mint_account.key().as_ref()
        ],
        bump
    )]
    pub node: AccountLoader<'info, Node>,

    pub mint_account: Signer<'info>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}
