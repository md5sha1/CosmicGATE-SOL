use std::str::FromStr;

use anchor_client::solana_sdk::pubkey::Pubkey;
use once_cell::sync::Lazy;


pub static PROGRAM_ID: Lazy<Pubkey> = Lazy::new(|| Pubkey::from_str("4HT4D74NjcEAdM6qbCEkmFmec2qZyVEG4njfv5oavzje").unwrap());
pub static STATE: Lazy<Pubkey> = Lazy::new(|| Pubkey::from_str("F28oXzPemnDNMTPWC6XT3qNyWNbJ32kNCdzkM7dzrawX").unwrap());   //devnet