use std::str::FromStr;

use anchor_client::solana_sdk::pubkey::Pubkey;
use once_cell::sync::Lazy;


pub static PROGRAM_ID: Lazy<Pubkey> = Lazy::new(|| Pubkey::from_str("Bw542RoLc3equ6jTWZMp7gEJmiakoDTnLrCHc7n5QMgv").unwrap());
pub static STATE: Lazy<Pubkey> = Lazy::new(|| Pubkey::from_str("5JM5TBpdQxmB5WSwUNbUcWHgUasCHzUrW3E8w3vanve6").unwrap());