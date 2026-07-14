use pinocchio::{
    cpi::Seed,
    error::ProgramError,
    sysvars::{clock::Clock, Sysvar},
    AccountView, Address, ProgramResult,
};

use crate::{
    error::TxPoolsError,
    instructions::{
        create_pda_account, parse_u64, token::token_transfer_checked, validate_system_and_rent,
        validate_token_program,
    },
    state::{
        pool::{validate_outcome, Pool, STATUS_OPEN},
        position::{Position, POSITION_LEN},
        token::{validate_usdc_mint, verify_token_account},
    },
    POOL_SEED, POSITION_SEED, USDC_DECIMALS, VAULT_SEED,
};

pub const LOCK_PREDICTION: u8 = 2;

pub struct LockPrediction<'a> {
    pub accounts: LockPredictionAccounts<'a>,
    pub outcome: u8,
    pub amount: u64,
}

impl<'a> TryFrom<(&'a [u8], &'a mut [AccountView])> for LockPrediction<'a> {
    type Error = ProgramError;

    fn try_from((data, accounts): (&'a [u8], &'a mut [AccountView])) -> Result<Self, Self::Error> {
        // Require one outcome byte followed by one u64 token amount.
        if data.len() != 9 {
            return Err(ProgramError::InvalidInstructionData);
        }

        // Parse the required accounts, selected outcome, and lock amount.
        Ok(Self {
            accounts: LockPredictionAccounts::try_from(accounts)?,
            outcome: data[0],
            amount: parse_u64(&data[1..9])?,
        })
    }
}

impl LockPrediction<'_> {
    pub fn process(&mut self) -> ProgramResult {
        // Reject token transfers that would add no position value.
        if self.amount == 0 {
            return Err(TxPoolsError::ZeroAmount.into());
        }

        // Validate the outcome and obtain its totals-array index.
        let outcome_index = validate_outcome(self.outcome)?;

        // Restrict token operations to the expected SPL Token program and USDC mint.
        validate_token_program(self.accounts.token_program)?;
        validate_usdc_mint(self.accounts.usdc_mint)?;

        // Load the pool and require it to remain unresolved.
        let mut pool = Pool::load(self.accounts.pool)?;
        if pool.status != STATUS_OPEN {
            return Err(TxPoolsError::PoolResolved.into());
        }

        // Stop new locks at or after the pool's close timestamp.
        if Clock::get()?.unix_timestamp >= pool.close_ts {
            return Err(TxPoolsError::PoolClosed.into());
        }

        // Derive and verify the pool PDA from its stored fixture ID.
        let fixture_bytes = pool.fixture_id.to_le_bytes();
        let (pool_pda, _) = Address::find_program_address(&[POOL_SEED, &fixture_bytes], &crate::ID);
        if self.accounts.pool.address() != &pool_pda {
            return Err(TxPoolsError::InvalidPda.into());
        }

        // Derive and verify the vault PDA assigned to the pool.
        let (vault_pda, _) = Address::find_program_address(
            &[VAULT_SEED, self.accounts.pool.address().as_ref()],
            &crate::ID,
        );
        if self.accounts.vault.address() != &vault_pda {
            return Err(TxPoolsError::InvalidPda.into());
        }

        // Verify the user source account and pool-owned destination vault.
        verify_token_account(self.accounts.user_token, self.accounts.user.address())?;
        verify_token_account(self.accounts.vault, self.accounts.pool.address())?;

        // Derive one position PDA for this user, pool, and outcome combination.
        let (position_pda, position_bump) = Address::find_program_address(
            &[
                POSITION_SEED,
                self.accounts.pool.address().as_ref(),
                self.accounts.user.address().as_ref(),
                &[self.outcome],
            ],
            &crate::ID,
        );
        if self.accounts.position.address() != &position_pda {
            return Err(TxPoolsError::InvalidPda.into());
        }

        // Create a new position or load the existing position for this outcome.
        let mut position = if self.accounts.position.lamports() == 0 {
            // Create and initialize the position PDA on its first lock.
            let bump_seed = [position_bump];
            let outcome_seed = [self.outcome];
            let seeds = [
                Seed::from(POSITION_SEED),
                Seed::from(self.accounts.pool.address().as_ref()),
                Seed::from(self.accounts.user.address().as_ref()),
                Seed::from(&outcome_seed),
                Seed::from(&bump_seed),
            ];
            create_pda_account(
                self.accounts.user,
                self.accounts.position,
                POSITION_LEN,
                &crate::ID,
                self.accounts.rent_sysvar,
                &seeds,
            )?;
            Position {
                user: *self.accounts.user.address(),
                pool: *self.accounts.pool.address(),
                outcome: self.outcome,
                amount: 0,
                claimed: false,
                bump: position_bump,
            }
        } else {
            // Verify an existing position still belongs to the supplied user and pool.
            let loaded = Position::load(self.accounts.position)?;
            if loaded.user != *self.accounts.user.address()
                || loaded.pool != *self.accounts.pool.address()
                || loaded.outcome != self.outcome
            {
                return Err(TxPoolsError::InvalidPda.into());
            }
            loaded
        };

        // Transfer the requested USDC amount from the user into the pool vault.
        token_transfer_checked(
            self.accounts.user_token,
            self.accounts.usdc_mint,
            self.accounts.vault,
            self.accounts.user,
            self.amount,
            USDC_DECIMALS,
        )?;

        // Add the lock amount to the user's outcome position.
        position.amount = position
            .amount
            .checked_add(self.amount)
            .ok_or(TxPoolsError::ArithmeticOverflow)?;
        position.store(self.accounts.position)?;

        // Add the lock amount to the pool total and selected outcome total.
        pool.total_locked = pool
            .total_locked
            .checked_add(self.amount)
            .ok_or(TxPoolsError::ArithmeticOverflow)?;
        pool.outcome_totals[outcome_index] = pool.outcome_totals[outcome_index]
            .checked_add(self.amount)
            .ok_or(TxPoolsError::ArithmeticOverflow)?;
        pool.store(self.accounts.pool)
    }
}

pub struct LockPredictionAccounts<'a> {
    pub user: &'a mut AccountView,
    pub pool: &'a mut AccountView,
    pub position: &'a mut AccountView,
    pub user_token: &'a mut AccountView,
    pub vault: &'a mut AccountView,
    pub usdc_mint: &'a mut AccountView,
    pub token_program: &'a mut AccountView,
    pub system_program: &'a mut AccountView,
    pub rent_sysvar: &'a mut AccountView,
}

impl<'a> TryFrom<&'a mut [AccountView]> for LockPredictionAccounts<'a> {
    type Error = ProgramError;

    fn try_from(accounts: &'a mut [AccountView]) -> Result<Self, Self::Error> {
        // Require the complete lock-prediction account list.
        let [user, pool, position, user_token, vault, usdc_mint, token_program, system_program, rent_sysvar] =
            accounts
        else {
            return Err(ProgramError::NotEnoughAccountKeys);
        };

        // Require the user signature and every account changed by creation or transfer.
        if !user.is_signer()
            || !user.is_writable()
            || !pool.is_writable()
            || !position.is_writable()
            || !user_token.is_writable()
            || !vault.is_writable()
        {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Verify the system program and rent sysvar used for first-position creation.
        validate_system_and_rent(system_program, rent_sysvar)?;
        Ok(Self {
            user,
            pool,
            position,
            user_token,
            vault,
            usdc_mint,
            token_program,
            system_program,
            rent_sysvar,
        })
    }
}
