use anchor_lang::prelude::*;

#[account]
pub struct Orchestrator {
    pub admin: Pubkey,
    pub sol_price: u64,
    pub treasury: Pubkey,
    pub min_stake: u64,
    pub base_reward: u64,
    pub rebate_rate: u64,
    pub slash_pct: u64,
    pub bump: [u8; 1],
}

impl Orchestrator {
    pub const LEN: usize = 8 + 32 + 8 + 32 + 8 + 8 + 8 + 8 + 1;

    pub fn initialize(&mut self, admin: Pubkey, bump: u8) -> Result<()> {
        self.admin = admin;
        self.sol_price = 200;
        self.slash_pct = 100;
        self.base_reward = 10;
        self.rebate_rate = 1;
        self.bump = [bump];
        Ok(())
    }

    pub fn set_admin(&mut self, admin: Pubkey) -> Result<()> {
        self.admin = admin;
        Ok(())
    }

    pub fn set_sol_price(&mut self, sol_price: u64) -> Result<()> {
        self.sol_price = sol_price;
        Ok(())
    }

    pub fn set_treasury(&mut self, treasury: Pubkey) -> Result<()> {
        self.treasury = treasury;
        Ok(())
    }

    pub fn set_min_stake(&mut self, min_stake: u64) -> Result<()> {
        self.min_stake = min_stake;
        Ok(())
    }

    pub fn set_base_reward(&mut self, base_reward: u64) -> Result<()> {
        self.base_reward = base_reward;
        Ok(())
    }

    pub fn set_rebate_rate(&mut self, rebate_rate: u64) -> Result<()> {
        self.rebate_rate = rebate_rate;
        Ok(())
    }

    pub fn set_slash_pct(&mut self, slash_pct: u64) -> Result<()> {
        self.slash_pct = slash_pct;
        Ok(())
    }

    pub fn get_slash_amount(&self, stake_amount: u64) -> Result<u64> {
        Ok(stake_amount * self.slash_pct / 1000)
    }

    /// Gets the orchestrator seeds for signing requests with the orchestrator address.
    pub fn seeds(&self) -> [&[u8]; 2] {
        [&b"orchestrator"[..], self.bump.as_ref()]
    }
}
