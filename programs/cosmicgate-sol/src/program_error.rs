use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Only admin")]
    OnlyAdmin,
    #[msg("Node is not idle")]
    NodeNotIdle,    
    #[msg("Task creator mismatch")]
    TaskCreatorMismatch,
    #[msg("Node not enough cpu")]
    NodeNotEnoughCpu,
    #[msg("Node not enough memory")]
    NodeNotEnoughMemory,
    #[msg("Node not enough storage")]
    NodeNotEnoughStorage,
}