use pinocchio::{cpi::Seed, error::ProgramError, AccountView, Address, ProgramResult};

use crate::{
    error::TxPoolsError,
    instructions::{
        create_pda_account, parse_i64, parse_u64,
        token::{token_initialize_account, token_transfer_checked},
        validate_system_and_rent, validate_token_program,
    },
    state::{
        config::Config,
        pool::{Pool, OUTCOME_NONE, POOL_LEN, STATUS_OPEN},
        token::{validate_usdc_mint, verify_token_account, TOKEN_ACCOUNT_LEN},
    },
    BONUS_POOL_AMOUNT, CONFIG_SEED, POOL_SEED, USDC_DECIMALS, VAULT_SEED,
};

pub const INITIALIZE_POOL: u8 = 1;

pub struct InitializePool<'a> {
    pub accounts: InitializePoolAccounts<'a>,
    pub fixture_id: u64,
    pub close_ts: i64,
}

impl<'a> TryFrom<(&'a [u8], &'a mut [AccountView])> for InitializePool<'a> {
    type Error = ProgramError;

    fn try_from((data, accounts): (&'a [u8], &'a mut [AccountView])) -> Result<Self, Self::Error> {
        // Require one u64 fixture ID followed by one i64 close timestamp.
        if data.len() != 16 {
            return Err(ProgramError::InvalidInstructionData);
        }

        // Parse the required accounts and pool initialization arguments.
        Ok(Self {
            accounts: InitializePoolAccounts::try_from(accounts)?,
            fixture_id: parse_u64(&data[0..8])?,
            close_ts: parse_i64(&data[8..16])?,
        })
    }
}

impl InitializePool<'_> {
    pub fn process(&mut self) -> ProgramResult {
        // Reject timestamps outside the supported Unix timestamp range.
        if self.close_ts < 0 {
            return Err(TxPoolsError::InvalidTimestamps.into());
        }

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

        // Restrict token operations to the expected SPL Token program and USDC mint.
        validate_token_program(self.accounts.token_program)?;
        validate_usdc_mint(self.accounts.usdc_mint)?;

        // Derive and verify the pool PDA for this TxLINE fixture ID.
        let fixture_bytes = self.fixture_id.to_le_bytes();
        let (pool_pda, pool_bump) =
            Address::find_program_address(&[POOL_SEED, &fixture_bytes], &crate::ID);
        if self.accounts.pool.address() != &pool_pda {
            return Err(TxPoolsError::InvalidPda.into());
        }

        // Derive and verify the token vault assigned to this pool.
        let (vault_pda, vault_bump) = Address::find_program_address(
            &[VAULT_SEED, self.accounts.pool.address().as_ref()],
            &crate::ID,
        );
        if self.accounts.vault.address() != &vault_pda {
            return Err(TxPoolsError::InvalidPda.into());
        }

        // Create the program-owned pool state account.
        let pool_bump_seed = [pool_bump];
        let pool_seeds = [
            Seed::from(POOL_SEED),
            Seed::from(&fixture_bytes),
            Seed::from(&pool_bump_seed),
        ];
        create_pda_account(
            self.accounts.admin,
            self.accounts.pool,
            POOL_LEN,
            &crate::ID,
            self.accounts.rent_sysvar,
            &pool_seeds,
        )?;

        // Create the SPL Token-owned vault account at its PDA.
        let vault_bump_seed = [vault_bump];
        let vault_seeds = [
            Seed::from(VAULT_SEED),
            Seed::from(self.accounts.pool.address().as_ref()),
            Seed::from(&vault_bump_seed),
        ];
        create_pda_account(
            self.accounts.admin,
            self.accounts.vault,
            TOKEN_ACCOUNT_LEN,
            &crate::TOKEN_PROGRAM_ID,
            self.accounts.rent_sysvar,
            &vault_seeds,
        )?;

        // Initialize the vault for USDC with the pool PDA as its authority.
        token_initialize_account(
            self.accounts.vault,
            self.accounts.usdc_mint,
            self.accounts.pool,
            self.accounts.rent_sysvar,
        )?;

        // Verify the initialized vault and the admin's funding token account.
        verify_token_account(self.accounts.vault, self.accounts.pool.address())?;
        verify_token_account(self.accounts.admin_token, self.accounts.admin.address())?;

        // Transfer the fixed platform bonus into the new pool vault.
        token_transfer_checked(
            self.accounts.admin_token,
            self.accounts.usdc_mint,
            self.accounts.vault,
            self.accounts.admin,
            BONUS_POOL_AMOUNT,
            USDC_DECIMALS,
        )?;

        // Store the open pool with empty user totals and the configured fee rate.
        Pool {
            fixture_id: self.fixture_id,
            admin: config.admin,
            close_ts: self.close_ts,
            status: STATUS_OPEN,
            total_locked: 0,
            outcome_totals: [0; 3],
            winning_outcome: OUTCOME_NONE,
            final_home_score: 0,
            final_away_score: 0,
            fee_bps: config.fee_bps,
            fee_amount: 0,
            net_payout_pool: 0,
            pool_bump,
            vault_bump,
        }
        .store(self.accounts.pool)
    }
}

pub struct InitializePoolAccounts<'a> {
    pub admin: &'a mut AccountView,
    pub config: &'a mut AccountView,
    pub pool: &'a mut AccountView,
    pub vault: &'a mut AccountView,
    pub admin_token: &'a mut AccountView,
    pub usdc_mint: &'a mut AccountView,
    pub token_program: &'a mut AccountView,
    pub system_program: &'a mut AccountView,
    pub rent_sysvar: &'a mut AccountView,
}

impl<'a> TryFrom<&'a mut [AccountView]> for InitializePoolAccounts<'a> {
    type Error = ProgramError;

    fn try_from(accounts: &'a mut [AccountView]) -> Result<Self, Self::Error> {
        // Require the complete initialize-pool account list.
        let [admin, config, pool, vault, admin_token, usdc_mint, token_program, system_program, rent_sysvar] =
            accounts
        else {
            return Err(ProgramError::NotEnoughAccountKeys);
        };

        // Require the admin signature and every account changed by creation or transfer.
        if !admin.is_signer()
            || !admin.is_writable()
            || !pool.is_writable()
            || !vault.is_writable()
            || !admin_token.is_writable()
        {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Verify the system program and rent sysvar addresses used for account creation.
        validate_system_and_rent(system_program, rent_sysvar)?;
        Ok(Self {
            admin,
            config,
            pool,
            vault,
            admin_token,
            usdc_mint,
            token_program,
            system_program,
            rent_sysvar,
        })
    }
}
