pub mod func;
pub mod utility;
use anchor_client::{
    solana_sdk::{
        commitment_config::CommitmentConfig,
        pubkey::Pubkey,
        signature::{read_keypair_file, Keypair},
        signer::Signer,
    },
    Client, Cluster,
};
use func::state::{initialize, state_info};
use func::node::register_node;
fn main() {
    let payer = read_keypair_file("../wallets/deployer_devnet.json").unwrap();
    let client = Client::new_with_options(Cluster::Devnet, &payer, CommitmentConfig::confirmed());
    let program = client.program(*func::config::PROGRAM_ID).unwrap();

    // let _ = initialize(&program, &payer);
    // let _ = state_info(&program);
    let _ = register_node(&program, &payer, 0);
}
