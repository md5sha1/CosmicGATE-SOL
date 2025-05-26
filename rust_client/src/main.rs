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
use func::{node::get_node_info, state::{initialize, state_info}, task::{add_task, update_task}};
use func::node::register_node;
fn main() {
    let payer = read_keypair_file("../wallets/deployer_devnet.json").unwrap();
    let client = Client::new_with_options(Cluster::Localnet, &payer, CommitmentConfig::confirmed());
    let program = client.program(*func::config::PROGRAM_ID).unwrap();

    // let _ = initialize(&program, &payer);
    // let _ = state_info(&program);
    // let _ = register_node(&program, &payer, 0);
    // let _ = get_node_info(&program, 0);
    // let _ = add_task(&program, &payer, 0, 0);
    let _ = update_task(&program, &payer, 0, 0, 2);
}
