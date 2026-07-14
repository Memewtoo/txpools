use pinocchio::{cpi::Seed, error::ProgramError, AccountView, Address, ProgramResult};

use crate::{
    error::TxPoolsError,
    instructions::{parse_u16, token::token_transfer_checked_signed, validate_token_program},
    state::{
        config::Config,
        pool::{validate_outcome, Pool, STATUS_OPEN, STATUS_RESOLVED},
        token::{validate_usdc_mint, verify_token_account},
    },
    txline::{
        away_score_stat_key, home_score_stat_key, validate_score_stat, winning_outcome_from_scores,
    },
    BASIS_POINTS_DENOMINATOR, CONFIG_SEED, POOL_SEED, USDC_DECIMALS, VAULT_SEED,
};

pub const RESOLVE_POOL: u8 = 3;

pub struct ResolvePool<'a> {
    pub accounts: ResolvePoolAccounts<'a>,
    pub final_home_score: u16,
    pub final_away_score: u16,
    pub home_validate_stat_data: &'a [u8],
    pub away_validate_stat_data: &'a [u8],
}

impl<'a> TryFrom<(&'a [u8], &'a mut [AccountView])> for ResolvePool<'a> {
    type Error = ProgramError;

    fn try_from((data, accounts): (&'a [u8], &'a mut [AccountView])) -> Result<Self, Self::Error> {
        // Require both scores and both length prefixes before parsing proof data.
        if data.len() < 8 {
            return Err(ProgramError::InvalidInstructionData);
        }

        // Parse the two final score values and the home proof length.
        let final_home_score = parse_u16(&data[0..2])?;
        let final_away_score = parse_u16(&data[2..4])?;
        let home_len = parse_u16(&data[4..6])? as usize;

        // Calculate the home proof range with overflow protection.
        let home_start = 6usize;
        let home_end = home_start
            .checked_add(home_len)
            .ok_or(TxPoolsError::ArithmeticOverflow)?;

        // Require enough remaining bytes for the away proof length.
        if home_end + 2 > data.len() {
            return Err(ProgramError::InvalidInstructionData);
        }

        // Parse the away proof length and calculate its protected range.
        let away_len = parse_u16(&data[home_end..home_end + 2])? as usize;
        let away_start = home_end + 2;
        let away_end = away_start
            .checked_add(away_len)
            .ok_or(TxPoolsError::ArithmeticOverflow)?;

        // Reject truncated proofs and unparsed trailing instruction bytes.
        if away_end != data.len() {
            return Err(ProgramError::InvalidInstructionData);
        }

        // Parse the account list and retain each proof as a byte slice.
        Ok(Self {
            accounts: ResolvePoolAccounts::try_from(accounts)?,
            final_home_score,
            final_away_score,
            home_validate_stat_data: &data[home_start..home_end],
            away_validate_stat_data: &data[away_start..away_end],
        })
    }
}

impl ResolvePool<'_> {
    pub fn process(&mut self) -> ProgramResult {
        // Restrict token operations to the expected SPL Token program and USDC mint.
        validate_token_program(self.accounts.token_program)?;
        validate_usdc_mint(self.accounts.usdc_mint)?;

        // Load the protocol config and verify its singleton PDA.
        let config = Config::load(self.accounts.config)?;
        let (config_pda, _) = Address::find_program_address(&[CONFIG_SEED], &crate::ID);
        if self.accounts.config.address() != &config_pda {
            return Err(TxPoolsError::InvalidPda.into());
        }

        // Load the pool and reject repeated settlement attempts.
        let mut pool = Pool::load(self.accounts.pool)?;
        if pool.status != STATUS_OPEN {
            return Err(TxPoolsError::PoolResolved.into());
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

        // Validate the submitted final home score through TxLINE.
        let home_validation = validate_score_stat(
            self.accounts.txline_program,
            self.accounts.daily_scores_merkle_roots,
            self.home_validate_stat_data,
            pool.fixture_id,
            home_score_stat_key(),
            self.final_home_score,
        )?;

        // Validate the submitted final away score through TxLINE.
        let away_validation = validate_score_stat(
            self.accounts.txline_program,
            self.accounts.daily_scores_merkle_roots,
            self.away_validate_stat_data,
            pool.fixture_id,
            away_score_stat_key(),
            self.final_away_score,
        )?;

        // Require both score proofs to reference the same daily Merkle root.
        if home_validation.epoch_day != away_validation.epoch_day {
            return Err(TxPoolsError::InvalidTxLineProof.into());
        }

        // Require both proven score updates to occur at or after pool close.
        if home_validation.timestamp_secs < pool.close_ts
            || away_validation.timestamp_secs < pool.close_ts
        {
            return Err(TxPoolsError::InvalidTxLineProof.into());
        }

        // Convert the verified score into a pool outcome and winning user total.
        let winning_outcome =
            winning_outcome_from_scores(self.final_home_score, self.final_away_score);
        let outcome_index = validate_outcome(winning_outcome)?;
        let winning_pool = pool.outcome_totals[outcome_index];

        // Verify the pool vault and configured fee recipient token account.
        let vault_info = verify_token_account(self.accounts.vault, self.accounts.pool.address())?;
        verify_token_account(self.accounts.fee_recipient_token, &config.fee_recipient)?;

        // Use the current vault balance as the gross payout pool.
        let gross_payout_pool = vault_info.amount;

        // Charge no fee when the pool has no participants or no winning users.
        let fee_amount = if winning_pool == 0 || pool.total_locked == 0 {
            0
        } else {
            (gross_payout_pool as u128)
                .checked_mul(pool.fee_bps as u128)
                .ok_or(TxPoolsError::ArithmeticOverflow)?
                .checked_div(BASIS_POINTS_DENOMINATOR as u128)
                .ok_or(TxPoolsError::ArithmeticOverflow)? as u64
        };

        // Record the amount remaining for winner claims after the fee.
        let net_payout_pool = gross_payout_pool
            .checked_sub(fee_amount)
            .ok_or(TxPoolsError::ArithmeticOverflow)?;

        // Transfer a nonzero protocol fee using the pool PDA as vault authority.
        if fee_amount > 0 {
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
                fee_amount,
                USDC_DECIMALS,
                &pool_seeds,
            )?;
        }

        // Persist the verified result and final payout accounting.
        pool.status = STATUS_RESOLVED;
        pool.winning_outcome = winning_outcome;
        pool.final_home_score = self.final_home_score;
        pool.final_away_score = self.final_away_score;
        pool.fee_amount = fee_amount;
        pool.net_payout_pool = net_payout_pool;
        pool.store(self.accounts.pool)
    }
}

pub struct ResolvePoolAccounts<'a> {
    pub resolver: &'a mut AccountView,
    pub config: &'a mut AccountView,
    pub pool: &'a mut AccountView,
    pub vault: &'a mut AccountView,
    pub fee_recipient_token: &'a mut AccountView,
    pub usdc_mint: &'a mut AccountView,
    pub token_program: &'a mut AccountView,
    pub txline_program: &'a mut AccountView,
    pub daily_scores_merkle_roots: &'a mut AccountView,
}

impl<'a> TryFrom<&'a mut [AccountView]> for ResolvePoolAccounts<'a> {
    type Error = ProgramError;

    fn try_from(accounts: &'a mut [AccountView]) -> Result<Self, Self::Error> {
        // Require the complete resolve-pool account list.
        let [resolver, config, pool, vault, fee_recipient_token, usdc_mint, token_program, txline_program, daily_scores_merkle_roots] =
            accounts
        else {
            return Err(ProgramError::NotEnoughAccountKeys);
        };

        // Require a resolver signature and writable settlement/token accounts.
        if !resolver.is_signer()
            || !pool.is_writable()
            || !vault.is_writable()
            || !fee_recipient_token.is_writable()
        {
            return Err(ProgramError::MissingRequiredSignature);
        }
        Ok(Self {
            resolver,
            config,
            pool,
            vault,
            fee_recipient_token,
            usdc_mint,
            token_program,
            txline_program,
            daily_scores_merkle_roots,
        })
    }
}
