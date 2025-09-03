use anchor_lang::error_code;

#[error_code]
pub enum ErrorCode {
    #[msg("Insufficient stake")]
    InsufficientStake,

    #[msg("Stake is still locked")]
    StillLocked,

    #[msg("Task already completed")]
    TaskAlreadyCompleted,
}
