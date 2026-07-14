pub mod claim_winnings;
pub mod initialize_config;
pub mod initialize_pool;
pub mod lock_prediction;
pub mod resolve_pool;
pub mod sweep_unclaimed_pool;
pub mod token;

use pinocchio::{
    cpi::{Seed, Signer},
    error::ProgramError,
    AccountView, Address, ProgramResult,
};
use pinocchio_system::instructions::CreateAccount;

pub fn parse_u16(data: &[u8]) -> Result<u16, ProgramError> {
    Ok(u16::from_le_bytes(
        data.try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    ))
}

pub fn parse_i64(data: &[u8]) -> Result<i64, ProgramError> {
    Ok(i64::from_le_bytes(
        data.try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    ))
}

pub fn parse_u64(data: &[u8]) -> Result<u64, ProgramError> {
    Ok(u64::from_le_bytes(
        data.try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    ))
}

pub fn validate_system_and_rent(
    system_program: &AccountView,
    rent_sysvar: &AccountView,
) -> ProgramResult {
    if system_program.address() != &pinocchio_system::ID {
        return Err(ProgramError::InvalidAccountOwner);
    }
    if rent_sysvar.address() != &pinocchio::sysvars::rent::RENT_ID {
        return Err(ProgramError::InvalidArgument);
    }
    Ok(())
}

pub fn validate_token_program(token_program: &AccountView) -> ProgramResult {
    if token_program.address() != &crate::TOKEN_PROGRAM_ID {
        return Err(ProgramError::IncorrectProgramId);
    }
    Ok(())
}

pub fn create_pda_account(
    payer: &AccountView,
    account: &AccountView,
    space: usize,
    owner: &Address,
    rent_sysvar: &AccountView,
    seeds: &[Seed],
) -> ProgramResult {
    if account.lamports() != 0 || account.data_len() != 0 {
        return Err(ProgramError::AccountAlreadyInitialized);
    }

    // Support both the legacy Rent sysvar (rate + f64 threshold) and the compact
    // format (effective rate only) without storing a cluster-specific lamport value.
    let rent_data = rent_sysvar.try_borrow()?;
    let lamports_per_byte = u64::from_le_bytes(
        rent_data
            .get(..8)
            .ok_or(ProgramError::InvalidAccountData)?
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    let exemption_multiplier = match rent_data.get(8..16) {
        Some(bytes) if bytes == 1f64.to_le_bytes() => 1,
        Some(bytes) if bytes == 2f64.to_le_bytes() => 2,
        Some(_) => return Err(ProgramError::InvalidAccountData),
        None => 1,
    };
    let rent_exempt_lamports = (space as u64)
        .checked_add(128)
        .and_then(|bytes| bytes.checked_mul(lamports_per_byte))
        .and_then(|lamports| lamports.checked_mul(exemption_multiplier))
        .ok_or(ProgramError::ArithmeticOverflow)?;

    CreateAccount {
        from: payer,
        to: account,
        lamports: rent_exempt_lamports,
        space: space as u64,
        owner,
    }
    .invoke_signed(&[Signer::from(seeds)])
}
