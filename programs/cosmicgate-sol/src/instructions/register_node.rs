use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;

use crate::account_data::{node::Node, state::State};

#[derive(Accounts)]
#[event_cpi]
#[instruction(node_seed: Pubkey)]
pub struct RegisterNode<'info> {
    #[account(mut)]
    pub state: AccountLoader<'info, State>,

    #[account(init,
        payer = creator,
        space = Node::MAX_SIZE,
        seeds = [
            b"node",
            state.key().as_ref(),
            node_seed.as_ref(),
        ],
        bump
    )]
    pub node: AccountLoader<'info, Node>,

    ///CHECK: This is a mint account for the soul nft for this node
    #[account(mut)]
    pub soul_nft_mint: Signer<'info>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}
