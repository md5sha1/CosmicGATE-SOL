#![allow(unexpected_cfgs)]
pub mod account_data;
pub mod instructions;
pub mod processors;
pub mod program_error;
use crate::instructions::register_node::*;
use crate::instructions::assign_task::*;
use crate::instructions::test_instruct::*;
use crate::instructions::update_task::*;
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
        cpu: u64,   
        memory: u64,
        storage: u64,
        os: u8,
        arch: u8,        
    ) -> Result<()> {
        processors::register_node::exec(ctx, cpu, memory, storage, os, arch)
    }

    pub fn add_task(ctx: Context<AssignTask>, required_cpu: u16, required_memory: u16, required_storage: u16, price: u64) -> Result<()> {
        processors::register_task::exec(ctx, required_cpu, required_memory, required_storage, price)
    }

    pub fn update_task(ctx: Context<UpdateTask>, task_id: u64, status: u8) -> Result<()> {
        processors::update_task::exec(ctx, task_id, status)
    }
}
