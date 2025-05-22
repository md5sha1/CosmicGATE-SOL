use anchor_lang::prelude::*;

#[account(zero_copy)]
#[derive(InitSpace)]
pub struct Task {
    pub id: u64,
    pub creator: Pubkey,
    pub node_assigned: Pubkey,
    pub node_id: u64,
    pub price: u64,
    pub required_cpu: u16,
    pub required_memory: u16,
    pub required_storage: u16,
    pub status: u8, // 0: Pending, 1: Assigned, 2: Completed, 3: Failed
    pub bump: u8,    
}

impl Task {
    pub const MAX_SIZE: usize = 8 + Self::INIT_SPACE;

    pub fn new(
        id: u64,
        creator: Pubkey,
        required_cpu: u16,
        required_memory: u16,
        required_storage: u16,
        node_assigned: Pubkey,
        node_id: u64,
        price: u64,
        status: u8,
        bump: u8,
    ) -> Self {
        Self {
            id,
            creator,
            node_assigned,
            node_id,
            required_cpu,
            required_memory,
            required_storage,
            price,
            status,
            bump,
        }
    }
}
