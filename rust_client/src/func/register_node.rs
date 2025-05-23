use anchor_client::{
    anchor_lang::prelude::*,
    solana_client::client_error::Result,
    solana_sdk::{signature::Keypair, signer::Signer},
    Program,
};

use crate::func::config::STATE;
use crate::utility::get_node_pub;
use cosmicgate_sol::accounts::RegisterNode;
use cosmicgate_sol::instruction::RegisterNode as RegisterNodeArgs;

pub fn register_node(program: &Program<&Keypair>, payer: &Keypair, node_id: u64) -> Result<()> {
    let soul_nft : Keypair = Keypair::new();
    let node = get_node_pub(program, node_id).unwrap();
    let tx = program.request().accounts(RegisterNode{
        state: *STATE,
        node: node.pubkey(),
        soul_nft_mint: soul_nft.pubkey(),
        creator: payer.pubkey(),
        token_program: Token2022::id(),
        system_program: System::id(),
    }).args(RegisterNodeArgs{
        cpu: 1,
        memory: 1,
        storage: 1,
        os: 1,
        arch: 1,
    })
    .signer(payer).send().expect("Failed to send transaction");

    println!("Transaction: {}", tx.to_string());
    Ok(())
}