use std::str::FromStr;

use anchor_client::solana_sdk::pubkey::Pubkey;
use once_cell::sync::Lazy;


pub static PROGRAM_ID: Lazy<Pubkey> = Lazy::new(|| Pubkey::from_str("Bw542RoLc3equ6jTWZMp7gEJmiakoDTnLrCHc7n5QMgv").unwrap());
pub static STATE: Lazy<Pubkey> = Lazy::new(|| Pubkey::from_str("BfT2cSiemNxWiNj1kV1cwMWNEdoduCEXexo2dh9jTKaP").unwrap());   //devnet