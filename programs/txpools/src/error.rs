use pinocchio::error::ProgramError;

#[repr(u32)]
pub enum TxPoolsError {
    InvalidFee = 0,
    InvalidPda,
    InvalidMint,
    InvalidTokenAccount,
    InvalidOutcome,
    PoolClosed,
    PoolResolved,
    PoolNotResolved,
    EmptyWinningPool,
    NotWinner,
    AlreadyClaimed,
    ZeroAmount,
    ArithmeticOverflow,
    Unauthorized,
    InvalidTimestamps,
    PoolNotReadyToResolve,
    InvalidTxLineProgram,
    InvalidTxLineProof,
    TxLineValidationFailed,
}

impl From<TxPoolsError> for ProgramError {
    fn from(error: TxPoolsError) -> Self {
        Self::Custom(error as u32)
    }
}
