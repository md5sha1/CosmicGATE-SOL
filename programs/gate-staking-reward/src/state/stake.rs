use anchor_lang::prelude::*;

#[account]
pub struct Stake {
    pub operator: Pubkey,
    pub amount: u64,
    pub active: bool,
    pub since: u64,
    pub lock_end: u64,
    pub bump: [u8; 1],
}

impl Stake {
    pub const LEN: usize = 8 + 32 + 8 + 1 + 8 + 8 + 1;

    pub fn initialize(&mut self, operator: Pubkey, bump: u8) -> Result<()> {
        self.operator = operator;
        self.bump = [bump];
        Ok(())
    }

    /// Gets the stake seeds for signing requests with the stake address.
    pub fn seeds(&self) -> [&[u8]; 3] {
        [&b"stake"[..], self.operator.as_ref(), self.bump.as_ref()]
    }
}
