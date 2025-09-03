use anchor_lang::prelude::*;

#[account]
pub struct Creator {
    pub creator: Pubkey,
    pub image_count: u64,
    pub bump: [u8; 1],
}

impl Creator {
    pub const LEN: usize = 8 + 32 + 8 + 1;

    pub fn initialize(&mut self, creator: Pubkey, bump: u8) -> Result<()> {
        self.creator = creator;
        self.bump = [bump];
        Ok(())
    }

    /// Gets the creator seeds for signing requests with the creator address.
    pub fn seeds(&self) -> [&[u8]; 3] {
        [&b"creator"[..], self.creator.as_ref(), self.bump.as_ref()]
    }
}
