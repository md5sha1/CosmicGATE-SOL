use anchor_lang::prelude::*;

declare_id!("Bw542RoLc3equ6jTWZMp7gEJmiakoDTnLrCHc7n5QMgv");

#[program]
pub mod cosmicgate_sol {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
