use anchor_client::{
    anchor_lang::prelude::*,
    solana_client::client_error::Result,
    solana_sdk::{signature::Keypair, signer::Signer},
    Program,
};
use uuid::Uuid;


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
    node_seed: Pubkey,
    metadata_url: String,
) -> Result<()> {
    let node = get_node_pub(program, node_seed).unwrap();
    let task_seed: Keypair = Keypair::new();
    println!("task seed {:?}", task_seed.pubkey());
    let test_uuid = Uuid::new_v4().to_string();
    let task = get_task_pub(program, task_seed.pubkey()).unwrap();

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
            node_seed: node_seed,
            task_seed: task_seed.pubkey(),
            uuid: test_uuid,
            metadata_url: metadata_url,
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
    node_seed: Pubkey,
    task_seed: Pubkey,
    status: u8,
) -> Result<()> {
    let node = get_node_pub(program, node_seed).unwrap();
    let task = get_task_pub(program, task_seed).unwrap();

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
            node_seed,
            task_seed,
            crc: "CRC Confirm Text".to_string(),        
            status,
            uuid: "uuid".to_string()
        })
        .signer(payer)
        .send()
        .expect("Failed to send transaction");

    println!("Transaction: {}", tx.to_string());
    Ok(())
}
