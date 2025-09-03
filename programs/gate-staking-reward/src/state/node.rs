use anchor_lang::prelude::*;

#[account]
pub struct Node {
    pub operator: Pubkey,
    pub completed_tasks: u64,
    pub bump: [u8; 1],
}

impl Node {
    pub const LEN: usize = 8 + 32 + 8 + 1;

    pub fn initialize(&mut self, operator: Pubkey, bump: u8) -> Result<()> {
        self.operator = operator;
        self.bump = [bump];
        Ok(())
    }

    /// Gets the node seeds for signing requests with the node address.
    pub fn seeds(&self) -> [&[u8]; 3] {
        [&b"node"[..], self.operator.as_ref(), self.bump.as_ref()]
    }
}
