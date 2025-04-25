#![allow(unexpected_cfgs)]
pub mod program_error;
pub mod processors;
pub mod instructions;
pub mod account_data;
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
