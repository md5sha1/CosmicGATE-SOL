use anchor_client::{
    anchor_lang::prelude::*,
    solana_client::client_error::Result,
    solana_sdk::{signature::Keypair, signer::Signer},
    Program,
};
use anchor_spl::token_2022::Token2022;

use crate::func::config::STATE;
use crate::utility::get_node_pub;
use cosmicgate_sol::{account_data::node::Node, accounts::RegisterNode};
use cosmicgate_sol::instruction::RegisterNode as RegisterNodeArgs;

pub fn get_node_info(program: &Program<&Keypair>, node_seed: Pubkey) -> Result<()> {
    let node = program.account::<Node>(get_node_pub(program, node_seed).unwrap()).unwrap();
    println!("{:?}", node);
    Ok(())
}

pub fn register_node(program: &Program<&Keypair>, payer: &Keypair) -> Result<()> {
    let soul_nft: Keypair = Keypair::new();
    let node_seed: Keypair = Keypair::new();
    println!("soul nft {:?}", soul_nft.pubkey());
    println!("node seed {:?}", node_seed.pubkey());
    let node = get_node_pub(program, node_seed.pubkey()).unwrap();    
    let (event_authority, _) = Pubkey::find_program_address(&[b"__event_authority"], &program.id());

    let tx = program
        .request()
        .accounts(RegisterNode {
            state: *STATE,
            node: node,
            soul_nft_mint: soul_nft.pubkey(),
            creator: payer.pubkey(),
            token_program: Token2022::id(),
            system_program: System::id(),
            event_authority: event_authority,
            program: program.id()
        })
        .args(RegisterNodeArgs {
            node_seed: node_seed.pubkey(),
            cpu: 1,
            memory: 1,
            storage: 1,
            os: 1,
            arch: 1,
        })
        .signer(payer)
        .signer(&soul_nft)
        .send()
        .expect("Failed to send transaction");

    println!("Transaction: {}", tx.to_string());
    Ok(())
}
