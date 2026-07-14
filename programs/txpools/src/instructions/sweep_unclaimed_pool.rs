use pinocchio::{cpi::Seed, error::ProgramError, AccountView, Address, ProgramResult};

use crate::{
    error::TxPoolsError,
    instructions::{token::token_transfer_checked_signed, validate_token_program},
    state::{
        config::Config,
        pool::{validate_outcome, Pool, STATUS_RESOLVED, STATUS_SWEPT},
        token::{parse_token_account, validate_usdc_mint, verify_token_account},
    },
    CONFIG_SEED, POOL_SEED, USDC_DECIMALS, VAULT_SEED,
};

pub const SWEEP_UNCLAIMED_POOL: u8 = 5;

pub struct SweepUnclaimedPool<'a> {
    pub accounts: SweepUnclaimedPoolAccounts<'a>,
}

impl<'a> TryFrom<(&'a [u8], &'a mut [AccountView])> for SweepUnclaimedPool<'a> {
    type Error = ProgramError;

    fn try_from((data, accounts): (&'a [u8], &'a mut [AccountView])) -> Result<Self, Self::Error> {
        // Sweep accepts accounts only and no serialized arguments.
        if !data.is_empty() {
            return Err(ProgramError::InvalidInstructionData);
        }

        // Parse the complete sweep account list.
        Ok(Self {
            accounts: SweepUnclaimedPoolAccounts::try_from(accounts)?,
        })
    }
}

impl SweepUnclaimedPool<'_> {
    pub fn process(&mut self) -> ProgramResult {
        // Restrict token operations to the expected SPL Token program and USDC mint.
        validate_token_program(self.accounts.token_program)?;
        validate_usdc_mint(self.accounts.usdc_mint)?;

        // Load the protocol config and require its current admin.
        let config = Config::load(self.accounts.config)?;
        if self.accounts.admin.address() != &config.admin {
            return Err(TxPoolsError::Unauthorized.into());
        }

        // Derive and verify the singleton config PDA.
        let (config_pda, _) = Address::find_program_address(&[CONFIG_SEED], &crate::ID);
        if self.accounts.config.address() != &config_pda {
            return Err(TxPoolsError::InvalidPda.into());
        }

        // Load the pool and require it to be resolved but not already swept.
        let mut pool = Pool::load(self.accounts.pool)?;
        if pool.status != STATUS_RESOLVED {
            return Err(TxPoolsError::PoolNotResolved.into());
        }

        // Allow recovery only when the winning outcome has no user funds.
        let outcome_index = validate_outcome(pool.winning_outcome)?;
        if pool.outcome_totals[outcome_index] != 0 {
            return Err(TxPoolsError::NotWinner.into());
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

        // Verify the pool vault and configured fee recipient token account.
        verify_token_account(self.accounts.vault, self.accounts.pool.address())?;
        verify_token_account(self.accounts.fee_recipient_token, &config.fee_recipient)?;

        // Read and require a nonzero vault balance to sweep.
        let vault_amount = parse_token_account(self.accounts.vault)?.amount;
        if vault_amount == 0 {
            return Err(TxPoolsError::ZeroAmount.into());
        }

        // Transfer the full vault balance using the pool PDA as authority.
        let pool_bump_seed = [pool.pool_bump];
        let pool_seeds = [
            Seed::from(POOL_SEED),
            Seed::from(&fixture_bytes),
            Seed::from(&pool_bump_seed),
        ];
        token_transfer_checked_signed(
            self.accounts.vault,
            self.accounts.usdc_mint,
            self.accounts.fee_recipient_token,
            self.accounts.pool,
            vault_amount,
            USDC_DECIMALS,
            &pool_seeds,
        )?;

        // Mark the pool swept after the token transfer succeeds.
        pool.status = STATUS_SWEPT;
        pool.store(self.accounts.pool)
    }
}

pub struct SweepUnclaimedPoolAccounts<'a> {
    pub admin: &'a mut AccountView,
    pub config: &'a mut AccountView,
    pub pool: &'a mut AccountView,
    pub vault: &'a mut AccountView,
    pub fee_recipient_token: &'a mut AccountView,
    pub usdc_mint: &'a mut AccountView,
    pub token_program: &'a mut AccountView,
}

impl<'a> TryFrom<&'a mut [AccountView]> for SweepUnclaimedPoolAccounts<'a> {
    type Error = ProgramError;

    fn try_from(accounts: &'a mut [AccountView]) -> Result<Self, Self::Error> {
        // Require the complete sweep-unclaimed-pool account list.
        let [admin, config, pool, vault, fee_recipient_token, usdc_mint, token_program] = accounts
        else {
            return Err(ProgramError::NotEnoughAccountKeys);
        };

        // Require the admin signature and every account changed by the sweep.
        if !admin.is_signer()
            || !pool.is_writable()
            || !vault.is_writable()
            || !fee_recipient_token.is_writable()
        {
            return Err(ProgramError::MissingRequiredSignature);
        }
        Ok(Self {
            admin,
            config,
            pool,
            vault,
            fee_recipient_token,
            usdc_mint,
            token_program,
        })
    }
}
