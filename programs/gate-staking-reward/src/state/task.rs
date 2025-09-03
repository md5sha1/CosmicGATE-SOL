use anchor_lang::prelude::*;

#[account]
pub struct Task {
    pub id: u64,
    pub creator: Pubkey,
    pub operator: Pubkey,
    pub completed: bool,
    pub bump: [u8; 1],
}

impl Task {
    pub const LEN: usize = 8 + 8 + 32 + 32 + 1 + 1;

    pub fn initialize(&mut self, id: u64, creator: Pubkey, bump: u8) -> Result<()> {
        self.id = id;
        self.creator = creator;
        self.bump = [bump];
        Ok(())
    }

    pub fn complete(&mut self, operator: Pubkey) -> Result<()> {
        self.operator = operator;
        self.completed = true;
        Ok(())
    }

    /// Gets the task seeds for signing requests with the task address.
    pub fn seeds(&self) -> [&[u8]; 3] {
        [
            &b"task"[..],
            Box::leak(self.id.to_le_bytes().into()),
            self.bump.as_ref(),
        ]
    }
}
