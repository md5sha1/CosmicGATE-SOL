#![allow(unexpected_cfgs)]
pub mod account_data;
pub mod instructions;
pub mod processors;
pub mod program_error;
use crate::instructions::assign_task::*;
use crate::instructions::update_task::*;
use crate::instructions::initialize::*;
use crate::instructions::register_node::*;
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

    pub fn add_task(ctx: Context<AssignTask>, node_id: u64, required_cpu: u64, required_memory: u64, required_storage: u64, data_hash: [u8; 128], result_hash: [u8; 128]) -> Result<()> {
        processors::add_task::exec(ctx, node_id, required_cpu, required_memory, required_storage, data_hash, result_hash)
    }

    pub fn update_task(ctx: Context<UpdateTask>, task_id: u64, status: u8) -> Result<()> {
        processors::update_task::exec(ctx, task_id, status)
    }

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        processors::initialize::exec(ctx)
    }
}
