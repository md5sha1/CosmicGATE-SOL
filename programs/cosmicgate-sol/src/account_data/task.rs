use anchor_lang::prelude::*;

use crate::program_error::ErrorCode;

#[account(zero_copy)]
#[derive(InitSpace, Debug)]
pub struct Task {
    pub id: u64,
    pub uuid: [u8; 16],
    pub task_seed: Pubkey,
    pub creator: Pubkey,
    pub node_assigned: Pubkey, // Use Pubkey::default() when no node is assigned
    pub node_seed: Pubkey,
    pub status: u8, //1: Assigned, 2: Completed, 3: Failed
    pub metadata_url: [u8; 200],
    pub hash: [u8; 200],
    pub bump: u8,
    _padding: [u8; 6],
}

impl Task {
    pub const MAX_SIZE: usize = 8 + Self::INIT_SPACE;

    // Helper function to convert String to [u8; 200]
    pub fn string_to_bytes(s: &str) -> [u8; 200] {
        let mut bytes = [0u8; 200];
        let s_bytes = s.as_bytes();
        let len = s_bytes.len().min(200);
        bytes[..len].copy_from_slice(&s_bytes[..len]);
        bytes
    }

    pub fn uuid_to_bytes(s: &str) -> [u8; 16] {
        let mut bytes = [0u8; 16];
        let s_bytes = s.as_bytes();
        let len = s_bytes.len().min(16);
        bytes[..len].copy_from_slice(&s_bytes[..len]);
        bytes
    }

    pub fn validate_uuid(&self, uuid: &str) -> Result<()> {
        let uuid_to_check = Task::uuid_to_bytes(uuid);
        if uuid_to_check[..] == self.uuid[..] {
            return Ok(());
        }
        Err(ErrorCode::WrongUUID.into())
    }

    pub fn new(
        id: u64,
        uuid: &str,
        task_seed: Pubkey,
        creator: Pubkey,
        node_assigned: Pubkey,
        node_seed: Pubkey,
        metadata_url: &str,
        hash: &str,
        bump: u8,
    ) -> Self {
        Self {
            id,
            uuid: Self::uuid_to_bytes(uuid),
            task_seed,
            creator,
            node_assigned,
            node_seed,
            status: 1, //Assigned
            metadata_url: Self::string_to_bytes(metadata_url),
            hash: Self::string_to_bytes(hash),
            bump,
            _padding: [0; 6],
        }
    }

    // Helper method to check if a node is assigned
    pub fn is_node_assigned(&self) -> bool {
        self.node_assigned != Pubkey::default() && self.status == 1
    }

    // Helper method to get node info if assigned
    pub fn get_node_info(&self) -> Option<(Pubkey, Pubkey)> {
        if self.is_node_assigned() {
            Some((self.node_assigned, self.node_seed))
        } else {
            None
        }
    }
}
