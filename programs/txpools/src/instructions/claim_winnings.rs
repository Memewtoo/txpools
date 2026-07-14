use pinocchio::{cpi::Seed, error::ProgramError, AccountView, Address, ProgramResult};

use crate::{
    error::TxPoolsError,
    instructions::{token::token_transfer_checked_signed, validate_token_program},
    state::{
        pool::{Pool, STATUS_RESOLVED},
        position::Position,
        token::{validate_usdc_mint, verify_token_account},
    },
    POOL_SEED, USDC_DECIMALS, VAULT_SEED,
};

pub const CLAIM_WINNINGS: u8 = 4;

pub struct ClaimWinnings<'a> {
    pub accounts: ClaimWinningsAccounts<'a>,
}

impl<'a> TryFrom<(&'a [u8], &'a mut [AccountView])> for ClaimWinnings<'a> {
    type Error = ProgramError;

    fn try_from((data, accounts): (&'a [u8], &'a mut [AccountView])) -> Result<Self, Self::Error> {
        // Claim winnings accepts accounts only and no serialized arguments.
        if !data.is_empty() {
            return Err(ProgramError::InvalidInstructionData);
        }

        // Parse the complete claim account list.
        Ok(Self {
            accounts: ClaimWinningsAccounts::try_from(accounts)?,
        })
    }
}

impl ClaimWinnings<'_> {
    pub fn process(&mut self) -> ProgramResult {
        // Restrict token operations to the expected SPL Token program and USDC mint.
        validate_token_program(self.accounts.token_program)?;
        validate_usdc_mint(self.accounts.usdc_mint)?;

        // Load the pool and require a verified settlement result.
        let pool = Pool::load(self.accounts.pool)?;
        if pool.status != STATUS_RESOLVED {
            return Err(TxPoolsError::PoolNotResolved.into());
        }

        // Load the position and require the caller to own a winning position.
        let mut position = Position::load(self.accounts.position)?;
        if position.user != *self.accounts.user.address()
            || position.pool != *self.accounts.pool.address()
            || position.outcome != pool.winning_outcome
        {
            return Err(TxPoolsError::NotWinner.into());
        }

        // Reject a position that has already transferred its payout.
        if position.claimed {
            return Err(TxPoolsError::AlreadyClaimed.into());
        }

        // Require a nonzero denominator for the pro-rata payout calculation.
        let winning_pool_total = pool.outcome_totals[pool.winning_outcome as usize];
        if winning_pool_total == 0 {
            return Err(TxPoolsError::EmptyWinningPool.into());
        }

        // Calculate the position's pro-rata share with u128 intermediates.
        let claim_amount = ((position.amount as u128)
            .checked_mul(pool.net_payout_pool as u128)
            .ok_or(TxPoolsError::ArithmeticOverflow)?
            / winning_pool_total as u128) as u64;

        // Reject positions whose integer payout rounds down to zero.
        if claim_amount == 0 {
            return Err(TxPoolsError::ZeroAmount.into());
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

        // Verify the pool-owned vault and the user's destination token account.
        verify_token_account(self.accounts.vault, self.accounts.pool.address())?;
        verify_token_account(self.accounts.user_token, self.accounts.user.address())?;

        // Transfer the payout using the pool PDA as vault authority.
        let pool_bump_seed = [pool.pool_bump];
        let pool_seeds = [
            Seed::from(POOL_SEED),
            Seed::from(&fixture_bytes),
            Seed::from(&pool_bump_seed),
        ];
        token_transfer_checked_signed(
            self.accounts.vault,
            self.accounts.usdc_mint,
            self.accounts.user_token,
            self.accounts.pool,
            claim_amount,
            USDC_DECIMALS,
            &pool_seeds,
        )?;

        // Mark the position claimed after the transfer succeeds.
        position.claimed = true;
        position.store(self.accounts.position)
    }
}

pub struct ClaimWinningsAccounts<'a> {
    pub user: &'a mut AccountView,
    pub pool: &'a mut AccountView,
    pub position: &'a mut AccountView,
    pub vault: &'a mut AccountView,
    pub user_token: &'a mut AccountView,
    pub usdc_mint: &'a mut AccountView,
    pub token_program: &'a mut AccountView,
}

impl<'a> TryFrom<&'a mut [AccountView]> for ClaimWinningsAccounts<'a> {
    type Error = ProgramError;

    fn try_from(accounts: &'a mut [AccountView]) -> Result<Self, Self::Error> {
        // Require the complete claim-winnings account list.
        let [user, pool, position, vault, user_token, usdc_mint, token_program] = accounts else {
            return Err(ProgramError::NotEnoughAccountKeys);
        };

        // Require the user signature and every account changed by the claim.
        if !user.is_signer()
            || !user.is_writable()
            || !pool.is_writable()
            || !position.is_writable()
            || !vault.is_writable()
            || !user_token.is_writable()
        {
            return Err(ProgramError::MissingRequiredSignature);
        }
        Ok(Self {
            user,
            pool,
            position,
            vault,
            user_token,
            usdc_mint,
            token_program,
        })
    }
}
