use anchor_client::{solana_client::client_error::Result, solana_sdk::{pubkey::Pubkey, signature::Keypair}, Program};

use crate::func::config::STATE;

pub fn get_node_pub(program: &Program<&Keypair>, node_seed: Pubkey) -> Result<Pubkey> {
    let node = Pubkey::find_program_address(
        &[
            b"node",
            (*STATE).as_ref(),
            node_seed.as_ref(),
        ],
        &program.id(),
    )
    .0;
    println!("node: {:?}", node);
    Ok(node)
}

pub fn get_task_pub(program: &Program<&Keypair>, task_id: u64) -> Result<Pubkey> {
    let task = Pubkey::find_program_address(
        &[
            b"task",
            (*STATE).as_ref(),
            task_id.to_string().as_ref(),
        ],
        &program.id(),
    )
    .0;
    println!("task: {:?}", task);
    Ok(task)
}