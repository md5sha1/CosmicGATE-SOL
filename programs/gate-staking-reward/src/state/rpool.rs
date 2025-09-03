use anchor_lang::prelude::*;

#[account]
pub struct RewardPool {
    pub amount: u64,
    pub bump: [u8; 1],
}

impl RewardPool {
    pub const LEN: usize = 8 + 8 + 1;

    pub fn initialize(&mut self, bump: u8) -> Result<()> {
        self.bump = [bump];
        Ok(())
    }

    /// Gets the reward pool seeds for signing requests with the reward pool address.
    pub fn seeds(&self) -> [&[u8]; 2] {
        [&b"reward_pool"[..], self.bump.as_ref()]
    }
}
