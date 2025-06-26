use anchor_lang::prelude::*;

#[account(zero_copy)]
#[derive(InitSpace, Debug)]
pub struct Node {
    pub owner: Pubkey, // Node wallet address
    pub soul_nft: Pubkey, // Soul NFT mint address
    pub node_seed: Pubkey,
    pub node_id: u64,
    pub stake: u64,
    pub cpu: u64,
    pub memory: u64,
    pub storage: u64,
    pub os: u8,
    pub arch: u8,    
    pub reputation_score: u8,
    pub status: u8, // 0: Idle, 1: Busy, 2: Offline
    pub bump: u8,
    _padding: [u8; 3],
}

impl Node {
    pub const MAX_SIZE: usize = 8 + Self::INIT_SPACE;

    pub fn new(
        owner: Pubkey,
        soul_nft: Pubkey,
        node_seed: Pubkey,
        node_id: u64,
        stake: u64,
        cpu: u64,
        memory: u64,
        storage: u64,
        os: u8,
        arch: u8,
        status: u8,
        bump: u8,
    ) -> Self {
        Self {
            owner,
            soul_nft,
            node_seed,
            node_id,
            stake,
            cpu,
            memory,
            storage,
            os,
            arch,
            reputation_score: 0,
            status,
            bump,
            _padding: [0; 3],
        }
    }
}
