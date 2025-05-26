use anchor_lang::prelude::*;

#[account(zero_copy)]
#[derive(InitSpace)]
pub struct Task {
    pub id: u64,
    pub creator: Pubkey,
    pub node_assigned: Pubkey,  // Use Pubkey::default() when no node is assigned
    pub data_hash: [u8; 128],
    pub result_hash: [u8; 128],
    pub node_id: u64,    
    pub required_cpu: u64,
    pub required_memory: u64,
    pub required_storage: u64,
    pub status: u8, //1: Assigned, 2: Completed, 3: Failed
    pub bump: u8,
    _padding: [u8; 6],
}

impl Task {
    pub const MAX_SIZE: usize = 8 + Self::INIT_SPACE;

    pub fn new(
        id: u64,
        creator: Pubkey,
        required_cpu: u64,
        required_memory: u64,
        required_storage: u64,
        node_assigned: Pubkey,
        node_id: u64,                
        data_hash: [u8; 128],
        result_hash: [u8; 128],
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
            status: 1, //Assigned
            data_hash,
            result_hash,
            bump,
            _padding: [0; 6],
        }
    }

    // Helper method to check if a node is assigned
    pub fn is_node_assigned(&self) -> bool {
        self.node_assigned != Pubkey::default() && self.status == 1
    }

    // Helper method to get node info if assigned
    pub fn get_node_info(&self) -> Option<(Pubkey, u64)> {
        if self.is_node_assigned() {
            Some((self.node_assigned, self.node_id))
        } else {
            None
        }
    }
}
