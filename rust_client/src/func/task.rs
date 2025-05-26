use anchor_client::{
    anchor_lang::prelude::*,
    solana_client::client_error::Result,
    solana_sdk::{signature::Keypair, signer::Signer},
    Program,
};


use crate::utility::get_node_pub;
use crate::{func::config::STATE, utility::get_task_pub};
use cosmicgate_sol::{accounts::AssignTask, instruction::AddTask as AddTaskArgs};
use cosmicgate_sol::{accounts::UpdateTask, instruction::UpdateTask as UpdateTaskArgs};

/*
   task_id and node_id will be provided by backend
*/
pub fn add_task(
    program: &Program<&Keypair>,
    payer: &Keypair,
    node_id: u64,
    task_id: u64,
) -> Result<()> {
    let node = get_node_pub(program, node_id).unwrap();
    let task = get_task_pub(program, task_id).unwrap();

    let (event_authority, _) = Pubkey::find_program_address(&[b"__event_authority"], &program.id());

    let tx = program
        .request()
        .accounts(AssignTask {
            state: *STATE,
            node: node,
            task: task,
            creator: payer.pubkey(),
            system_program: System::id(),
            event_authority: event_authority,
            program: program.id(),
        })
        .args(AddTaskArgs {
            node_id: node_id,
            required_cpu: 1,
            required_memory: 1,
            required_storage: 1,
            data_hash: [0; 128],
            result_hash: [0; 128],
        })
        .signer(payer)
        .send()
        .expect("Failed to send transaction");

    println!("Transaction: {}", tx.to_string());
    Ok(())
}

/*
   task_id and node_id will be provided by backend
*/
pub fn update_task(
    program: &Program<&Keypair>,
    payer: &Keypair,
    node_id: u64,
    task_id: u64,
    status: u8,
) -> Result<()> {
    let node = get_node_pub(program, node_id).unwrap();
    let task = get_task_pub(program, task_id).unwrap();

    let (event_authority, _) = Pubkey::find_program_address(&[b"__event_authority"], &program.id());

    let tx = program
        .request()
        .accounts(UpdateTask {
            state: *STATE,
            node: node,
            task: task,
            creator: payer.pubkey(),
            system_program: System::id(),
            event_authority: event_authority,
            program: program.id(),
        })
        .args(UpdateTaskArgs {
            task_id: task_id,
            status: status,
        })
        .signer(payer)
        .send()
        .expect("Failed to send transaction");

    println!("Transaction: {}", tx.to_string());
    Ok(())
}
