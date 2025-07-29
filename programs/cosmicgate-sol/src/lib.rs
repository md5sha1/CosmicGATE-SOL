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

declare_id!("4HT4D74NjcEAdM6qbCEkmFmec2qZyVEG4njfv5oavzje");
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
        node_seed: Pubkey,
        cpu: u64,   
        memory: u64,
        storage: u64,
        os: u8,
        arch: u8,        
    ) -> Result<()> {
        processors::register_node::exec(ctx, node_seed, cpu, memory, storage, os, arch)
    }

    pub fn add_task(ctx: Context<AssignTask>, node_seed: Pubkey, task_seed: Pubkey, uuid: String, metadata_url: String) -> Result<()> {
        processors::add_task::exec(ctx, node_seed, task_seed, uuid, metadata_url)
    }

    pub fn update_task(ctx: Context<UpdateTask>, node_seed: Pubkey, task_seed: Pubkey, crc: String, status: u8, uuid: String, hash: String) -> Result<()> {
        processors::update_task::exec(ctx, node_seed, task_seed, crc, status, uuid, hash)
    }

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        processors::initialize::exec(ctx)
    }
}
