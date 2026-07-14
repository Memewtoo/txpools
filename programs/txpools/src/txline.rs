use core::{mem::MaybeUninit, slice::from_raw_parts};

use pinocchio::{
    cpi::invoke_signed as txline_validate_stat_cpi,
    error::ProgramError,
    instruction::{InstructionAccount, InstructionView},
    AccountView, Address, ProgramResult,
};

use crate::{
    error::TxPoolsError, TXLINE_AWAY_SCORE_STAT_KEY, TXLINE_HOME_SCORE_STAT_KEY, TXLINE_PROGRAM_ID,
};

pub const DAILY_SCORES_SEED: &[u8] = b"daily_scores_roots";
const MS_PER_DAY: i64 = 86_400_000;
const VALIDATE_STAT_DISCRIMINATOR: [u8; 8] = [107, 197, 232, 90, 191, 136, 105, 185];
const COMPARISON_EQUAL_TO: u8 = 2;
const MAX_RETURN_DATA: usize = 1024;

#[derive(Clone, Copy)]
pub struct ValidatedScore {
    pub epoch_day: u16,
    pub timestamp_secs: i64,
}

pub fn validate_score_stat(
    txline_program: &AccountView,
    daily_scores_merkle_roots: &AccountView,
    validate_stat_data: &[u8],
    pool_fixture_id: u64,
    expected_stat_key: u32,
    expected_score: u16,
) -> Result<ValidatedScore, ProgramError> {
    verify_txline_program(txline_program)?;

    // Parse and bind the opaque CPI payload before forwarding it, preventing a
    // caller from validating a different fixture, stat key, or score.
    let parsed = parse_validate_stat_data(
        validate_stat_data,
        pool_fixture_id,
        expected_stat_key,
        expected_score,
    )?;

    let expected_daily_scores_pda = daily_scores_pda(parsed.epoch_day);
    if daily_scores_merkle_roots.address() != &expected_daily_scores_pda {
        return Err(TxPoolsError::InvalidPda.into());
    }

    let accounts = [InstructionAccount::readonly(
        daily_scores_merkle_roots.address(),
    )];
    let instruction = InstructionView {
        program_id: &crate::TXLINE_PROGRAM_ID,
        accounts: &accounts,
        data: validate_stat_data,
    };
    verify_program_id(txline_program.address(), &crate::TXLINE_PROGRAM_ID)?;
    txline_validate_stat_cpi(&instruction, &[daily_scores_merkle_roots], &[])?;

    // A successful CPI is not enough: TxLINE communicates the validation result
    // as return data and must explicitly return byte 1.
    require_txline_return_true(txline_program.address())?;
    Ok(parsed)
}

fn verify_txline_program(txline_program: &AccountView) -> ProgramResult {
    verify_program_id(txline_program.address(), &TXLINE_PROGRAM_ID)
}

fn verify_program_id(program_id: &Address, expected_program_id: &Address) -> ProgramResult {
    if program_id != expected_program_id {
        return Err(TxPoolsError::InvalidTxLineProgram.into());
    }
    Ok(())
}

fn parse_validate_stat_data(
    data: &[u8],
    pool_fixture_id: u64,
    expected_stat_key: u32,
    expected_score: u16,
) -> Result<ValidatedScore, ProgramError> {
    // This mirrors TxLINE's serialized validate_stat arguments. Cursor reads are
    // bounds-checked and trailing bytes are rejected to keep the parser strict.
    let mut cursor = Cursor::new(data);
    let discriminator = cursor.bytes::<8>()?;
    if discriminator != VALIDATE_STAT_DISCRIMINATOR {
        return Err(TxPoolsError::InvalidTxLineProof.into());
    }

    let ts = cursor.i64()?;
    let fixture_id = cursor.i64()?;
    if fixture_id < 0 || fixture_id as u64 != pool_fixture_id {
        return Err(TxPoolsError::InvalidTxLineProof.into());
    }

    let _update_count = cursor.i32()?;
    let min_timestamp = cursor.i64()?;
    let _max_timestamp = cursor.i64()?;
    cursor.skip(32)?;
    skip_proof_vec(&mut cursor)?;
    skip_proof_vec(&mut cursor)?;

    let threshold = cursor.i32()?;
    let comparison = cursor.u8()?;
    if comparison != COMPARISON_EQUAL_TO || threshold != expected_score as i32 {
        return Err(TxPoolsError::InvalidTxLineProof.into());
    }

    let stat_key = cursor.u32()?;
    let stat_value = cursor.i32()?;
    let _period = cursor.i32()?;
    if stat_key != expected_stat_key || stat_value != expected_score as i32 {
        return Err(TxPoolsError::InvalidTxLineProof.into());
    }
    cursor.skip(32)?;
    skip_proof_vec(&mut cursor)?;

    let stat_b_present = cursor.u8()?;
    let op_present = cursor.u8()?;
    if stat_b_present != 0 || op_present != 0 {
        return Err(TxPoolsError::InvalidTxLineProof.into());
    }
    if !cursor.is_done() {
        return Err(TxPoolsError::InvalidTxLineProof.into());
    }

    let target_ts = if min_timestamp > 0 { min_timestamp } else { ts };
    if target_ts < 0 {
        return Err(TxPoolsError::InvalidTxLineProof.into());
    }
    let epoch_day = (target_ts / MS_PER_DAY) as u64;
    if epoch_day > u16::MAX as u64 {
        return Err(TxPoolsError::InvalidTxLineProof.into());
    }

    Ok(ValidatedScore {
        epoch_day: epoch_day as u16,
        timestamp_secs: target_ts / 1_000,
    })
}

fn skip_proof_vec(cursor: &mut Cursor) -> ProgramResult {
    // Each TxLINE proof node is a 32-byte hash plus one sibling-direction byte.
    let len = cursor.u32()? as usize;
    let bytes = len
        .checked_mul(33)
        .ok_or(TxPoolsError::ArithmeticOverflow)?;
    cursor.skip(bytes)
}

fn daily_scores_pda(epoch_day: u16) -> Address {
    Address::find_program_address(
        &[DAILY_SCORES_SEED, &epoch_day.to_le_bytes()],
        &TXLINE_PROGRAM_ID,
    )
    .0
}

fn require_txline_return_true(expected_program: &Address) -> ProgramResult {
    let return_data = get_return_data().ok_or(TxPoolsError::TxLineValidationFailed)?;
    if return_data.program_id() != expected_program || return_data.as_slice() != [1] {
        return Err(TxPoolsError::TxLineValidationFailed.into());
    }
    Ok(())
}

fn get_return_data() -> Option<ReturnData> {
    #[cfg(target_os = "solana")]
    {
        const UNINIT_BYTE: MaybeUninit<u8> = MaybeUninit::<u8>::uninit();
        let mut data = [UNINIT_BYTE; MAX_RETURN_DATA];
        let mut program_id = MaybeUninit::<Address>::uninit();

        // Pinocchio exposes the raw syscall, so keep storage on the stack and
        // cap the visible slice even if a callee reports oversized return data.
        let size = unsafe {
            pinocchio::syscalls::sol_get_return_data(
                data.as_mut_ptr() as *mut u8,
                data.len() as u64,
                program_id.as_mut_ptr() as *mut u8,
            )
        };

        if size == 0 {
            None
        } else {
            Some(ReturnData {
                program_id: unsafe { program_id.assume_init() },
                data,
                size: core::cmp::min(size as usize, MAX_RETURN_DATA),
            })
        }
    }

    #[cfg(not(target_os = "solana"))]
    core::hint::black_box(None)
}

struct ReturnData {
    program_id: Address,
    data: [MaybeUninit<u8>; MAX_RETURN_DATA],
    size: usize,
}

impl ReturnData {
    fn program_id(&self) -> &Address {
        &self.program_id
    }

    fn as_slice(&self) -> &[u8] {
        unsafe { from_raw_parts(self.data.as_ptr() as _, self.size) }
    }
}

struct Cursor<'a> {
    data: &'a [u8],
    offset: usize,
}

impl<'a> Cursor<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, offset: 0 }
    }

    fn is_done(&self) -> bool {
        self.offset == self.data.len()
    }

    fn skip(&mut self, len: usize) -> ProgramResult {
        self.take(len).map(|_| ())
    }

    fn take(&mut self, len: usize) -> Result<&'a [u8], ProgramError> {
        let end = self
            .offset
            .checked_add(len)
            .ok_or(TxPoolsError::ArithmeticOverflow)?;
        if end > self.data.len() {
            return Err(TxPoolsError::InvalidTxLineProof.into());
        }
        let slice = &self.data[self.offset..end];
        self.offset = end;
        Ok(slice)
    }

    fn bytes<const N: usize>(&mut self) -> Result<[u8; N], ProgramError> {
        self.take(N)?
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)
    }

    fn u8(&mut self) -> Result<u8, ProgramError> {
        Ok(self.take(1)?[0])
    }

    fn u32(&mut self) -> Result<u32, ProgramError> {
        Ok(u32::from_le_bytes(self.bytes::<4>()?))
    }

    fn i32(&mut self) -> Result<i32, ProgramError> {
        Ok(i32::from_le_bytes(self.bytes::<4>()?))
    }

    fn i64(&mut self) -> Result<i64, ProgramError> {
        Ok(i64::from_le_bytes(self.bytes::<8>()?))
    }
}

pub fn winning_outcome_from_scores(home_score: u16, away_score: u16) -> u8 {
    match home_score.cmp(&away_score) {
        core::cmp::Ordering::Greater => crate::state::pool::OUTCOME_HOME,
        core::cmp::Ordering::Less => crate::state::pool::OUTCOME_AWAY,
        core::cmp::Ordering::Equal => crate::state::pool::OUTCOME_DRAW,
    }
}

pub fn home_score_stat_key() -> u32 {
    TXLINE_HOME_SCORE_STAT_KEY
}

pub fn away_score_stat_key() -> u32 {
    TXLINE_AWAY_SCORE_STAT_KEY
}
