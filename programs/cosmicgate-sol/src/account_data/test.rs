use anchor_lang::prelude::*;

#[account(zero_copy)]
#[derive(InitSpace)]
pub struct Test {
    pub id: Pubkey,    
    pub count: u64, // In $GATE or lamports
}

impl Test {
    pub const MAX_SIZE: usize = 8 + Self::INIT_SPACE;

    pub fn new(id: Pubkey, count: u64) -> Self {
        Self {
            id,
            count
        }
    }
}
