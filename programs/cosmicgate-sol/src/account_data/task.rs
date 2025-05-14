use anchor_lang::prelude::*;

#[account(zero_copy)]
#[derive(InitSpace)]
pub struct Task {
    pub id: Pubkey,
    pub owner: Pubkey,         // Node wallet address
    pub node_id: Pubkey,       // NFT Mint Address
    pub price: u64, // In $GATE or lamports
}

impl Task {
    pub const MAX_SIZE: usize = 8 + Self::INIT_SPACE;

    pub fn new(id: Pubkey, owner: Pubkey, node_id: Pubkey, price: u64) -> Self {
        Self {
            id,
            owner,
            node_id,
            price,
        }
    }
}
