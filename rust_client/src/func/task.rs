use anchor_client::{
    anchor_lang::prelude::*,
    solana_client::client_error::Result,
    solana_sdk::{signature::Keypair, signer::Signer},
    Program,
};
use anchor_spl::token_2022::Token2022;

use crate::func::config::STATE;
use crate::utility::get_node_pub;
use cosmicgate_sol::accounts::AssignTask;
use cosmicgate_sol::instruction::AddTask as AddTaskArgs;

pub fn add_task(program: &Program<&Keypair>, payer: &Keypair, node_id: u64) -> Result<()> {
    // let soul_nft: Keypair = Keypair::new();
    // let node = get_node_pub(program, node_id).unwrap();
    // println!("{:?}", soul_nft.pubkey().to_string());
    // println!("{:?}", node.to_string());
    // let (event_authority, _) = Pubkey::find_program_address(&[b"__event_authority"], &program.id());

    // let tx = program
    //     .request()
    //     .accounts(RegisterNode {
    //         state: *STATE,
    //         node: node,
    //         soul_nft_mint: soul_nft.pubkey(),
    //         creator: payer.pubkey(),
    //         token_program: Token2022::id(),
    //         system_program: System::id(),
    //         event_authority: event_authority,
    //         program: program.id()
    //     })
    //     .args(AddTaskArgs {
    //         required_cpu: 1,
    //         required_memory: 1,
    //         required_storage: 1,
    //         price: 1,
    //     })
    //     .signer(payer)
    //     .signer(&soul_nft)
    //     .send()
    //     .expect("Failed to send transaction");

    // println!("Transaction: {}", tx.to_string());
    Ok(())
}
