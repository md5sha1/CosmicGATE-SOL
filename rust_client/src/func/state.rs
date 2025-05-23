use anchor_client::{
    anchor_lang::prelude::*,
    solana_client::client_error::Result,
    solana_sdk::{signature::Keypair, signer::Signer},
    Program,
};
use cosmicgate_sol::{
    account_data::state::State, accounts::Initialize,
    instruction::Initialize as InitializeInstruction,
};

use super::config::STATE;

pub fn state_info(program: &Program<&Keypair>) -> Result<()> {
    println!("State Address: {:?}", (*STATE).to_string());
    let state = program.account::<State>(*STATE).unwrap();
    println!("State: {:?}", state);
    Ok(())
}

pub fn initialize(program: &Program<&Keypair>, payer: &Keypair) -> Result<()> {
    let state: Keypair = Keypair::new();
    println!("{:?}", state.pubkey().to_string());
    let tx = program
        .request()
        .accounts(Initialize {
            state: state.pubkey(),
            creator: payer.pubkey(),
            system_program: System::id(),
        })
        .args(InitializeInstruction {})
        .signer(&payer)
        .signer(&state)
        .send()
        .expect("Failed to send transaction");

    println!("Transaction: {}", tx.to_string());
    Ok(())
}
