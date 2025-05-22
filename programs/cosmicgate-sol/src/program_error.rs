use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Only admin")]
    OnlyAdmin,
    #[msg("Node is working")]
    NodeWorking,
    #[msg("Task creator mismatch")]
    TaskCreatorMismatch,
}