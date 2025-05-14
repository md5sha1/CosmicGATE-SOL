#![allow(unexpected_cfgs)]
pub mod account_data;
pub mod instructions;
pub mod processors;
pub mod program_error;
use crate::instructions::register_node::*;
use crate::instructions::task_queue::*;
use anchor_lang::prelude::*;

declare_id!("Bw542RoLc3equ6jTWZMp7gEJmiakoDTnLrCHc7n5QMgv");

#[program]
pub mod cosmicgate_sol {

    

    use super::*;
    /**
     * Register node and create soulbound NFT and send it to node creator
     * # Arguments
     *
     * * `ctx` - The Anchor context holding the accounts
     * * `hardware_specs` - spec of registering node
     * * `price` - price of node for use
     * * `uptime` - uptime of the node
     */
    pub fn register_node(
        ctx: Context<RegisterNode>,
        hardware_specs: [u8; 32],
        price: u64,
        uptime: u64,
    ) -> Result<()> {
        processors::register_node::exec(ctx, hardware_specs, price, uptime)
    }

    pub fn add_task(ctx: Context<TaskQueue>, price: u64) -> Result<()> {
        processors::task_queue::exec(ctx, price)
    }
}
