#![no_std]

use pinocchio::{
    entrypoint, error::ProgramError, nostd_panic_handler, AccountView, Address, ProgramResult,
};

pub mod error;
pub mod instructions;
pub mod state;
pub mod txline;

use instructions::{
    claim_winnings::{ClaimWinnings, CLAIM_WINNINGS},
    initialize_config::{InitializeConfig, INITIALIZE_CONFIG},
    initialize_pool::{InitializePool, INITIALIZE_POOL},
    lock_prediction::{LockPrediction, LOCK_PREDICTION},
    resolve_pool::{ResolvePool, RESOLVE_POOL},
    sweep_unclaimed_pool::{SweepUnclaimedPool, SWEEP_UNCLAIMED_POOL},
};

solana_address::declare_id!("txpWnpDSkz98Xgm451KBpezot1YL4FM8LnnUA4Tyfh1");

pub const CONFIG_SEED: &[u8] = b"config";
pub const POOL_SEED: &[u8] = b"pool";
pub const POSITION_SEED: &[u8] = b"position";
pub const VAULT_SEED: &[u8] = b"vault";
pub const USDC_DECIMALS: u8 = 6;
pub const BASIS_POINTS_DENOMINATOR: u64 = 10_000;
pub const BONUS_POOL_AMOUNT: u64 = 150_000_000;
pub const TXLINE_HOME_SCORE_STAT_KEY: u32 = 1;
pub const TXLINE_AWAY_SCORE_STAT_KEY: u32 = 2;

pub const BOOTSTRAP_AUTHORITY: Address = Address::new_from_array(five8_const::decode_32_const(
    "6SUpfDcY6DK3XCdWXMxEa1Jzf899F2vqTPuR5bMGTTj6",
));

pub const TOKEN_PROGRAM_ID: Address = Address::new_from_array(five8_const::decode_32_const(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
));

pub const USDC_MINT: Address = Address::new_from_array(five8_const::decode_32_const(
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
));

pub const TXLINE_PROGRAM_ID: Address = Address::new_from_array(five8_const::decode_32_const(
    "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
));

entrypoint!(process_instruction);
nostd_panic_handler!();

fn process_instruction(
    _program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    let (discriminator, data) = instruction_data
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;

    // The first byte is a compact instruction discriminator; each handler owns
    // the remaining byte layout and performs its own account validation.
    match *discriminator {
        INITIALIZE_CONFIG => {
            let mut ix = InitializeConfig::try_from((data, accounts))?;
            ix.process()
        }
        INITIALIZE_POOL => {
            let mut ix = InitializePool::try_from((data, accounts))?;
            ix.process()
        }
        LOCK_PREDICTION => {
            let mut ix = LockPrediction::try_from((data, accounts))?;
            ix.process()
        }
        RESOLVE_POOL => {
            let mut ix = ResolvePool::try_from((data, accounts))?;
            ix.process()
        }
        CLAIM_WINNINGS => {
            let mut ix = ClaimWinnings::try_from((data, accounts))?;
            ix.process()
        }
        SWEEP_UNCLAIMED_POOL => {
            let mut ix = SweepUnclaimedPool::try_from((data, accounts))?;
            ix.process()
        }
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
