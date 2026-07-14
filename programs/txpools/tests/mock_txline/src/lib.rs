#![no_std]

use pinocchio::{
    entrypoint, error::ProgramError, nostd_panic_handler, AccountView, Address, ProgramResult,
};

solana_address::declare_id!("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

const VALIDATE_STAT_DISCRIMINATOR: [u8; 8] = [107, 197, 232, 90, 191, 136, 105, 185];

entrypoint!(process_instruction);
nostd_panic_handler!();

fn process_instruction(
    _program_id: &Address,
    _accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    if instruction_data.len() < 8 || instruction_data[0..8] != VALIDATE_STAT_DISCRIMINATOR {
        return Err(ProgramError::InvalidInstructionData);
    }

    #[cfg(target_os = "solana")]
    unsafe {
        pinocchio::syscalls::sol_set_return_data([1u8].as_ptr(), 1);
    }

    Ok(())
}
