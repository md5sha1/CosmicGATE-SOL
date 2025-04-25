use anchor_lang::prelude::*;

#[account(zero_copy)]
#[derive(InitSpace)]
pub struct Node {
    pub owner: Pubkey,            // Node wallet address
    pub node_id: Pubkey,          // NFT Mint Address
    pub hardware_specs: [u8; 32], // JSON string with specs
    pub pricing_per_task: u64,    // In $GATE or lamports
    pub uptime: u64,              // Uptime in seconds
    pub total_rewards: u64,       // Total earned
    pub reputation_score: u8,     // Score 0-100
    pub bump: u8,                 // PDA bump
    _padding: [u8; 6],
}

impl Node {
    pub const MAX_SIZE: usize = 8 + Self::INIT_SPACE;

    pub fn new(
        owner: Pubkey,
        node_id: Pubkey,
        hardware_specs: [u8; 32],
        pricing_per_task: u64,
        uptime: u64,
        bump: u8,
    ) -> Self {
        Self {
            owner,
            node_id,
            hardware_specs,
            pricing_per_task,
            uptime,
            total_rewards: 0,
            reputation_score: 0,
            bump,
            _padding: [0; 6],
        }
    }
}
