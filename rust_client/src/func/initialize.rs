use anchor_client::{
    anchor_lang::prelude::*,
    solana_client::client_error::Result,
    solana_sdk::{signature::Keypair, signer::Signer},
    Program,
};


use cosmicgate_sol::accounts::Initialize;

pub fn initialize(program: &Program<&Keypair>, payer: &Keypair) -> Result<()> {
    let state: Keypair = Keypair::new();
    println!("{:?}", state.pubkey().to_string());
    let tx = program.request().accounts(Initialize{
        state: state.pubkey(),
        creator: payer.pubkey(),
        system_program: System::id(),
    }).signer(payer).send().expect("Failed to send transaction");

    println!("Transaction: {}", tx.to_string());
    Ok(())
}