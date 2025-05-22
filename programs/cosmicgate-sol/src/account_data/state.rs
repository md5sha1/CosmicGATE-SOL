use anchor_lang::prelude::*;

#[account(zero_copy)]
#[derive(InitSpace, Debug)]
pub struct State {
    pub admin: Pubkey,
    pub node_count: u64,
    pub task_count: u64,
}

impl State {
    pub const MAX_SIZE: usize = 8 + Self::INIT_SPACE;
    pub fn new(admin: Pubkey) -> Self {
        Self {
            admin,
            node_count: 0,
            task_count: 0,
        }
    }
}
