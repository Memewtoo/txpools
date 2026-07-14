use pinocchio::{error::ProgramError, AccountView, Address};

pub const POOL_DISCRIMINATOR: u8 = 2;
// Pool uses a fixed byte layout so both Pinocchio and the TypeScript client can
// decode it without Borsh or an IDL dependency.
pub const POOL_LEN: usize = 107;
pub const STATUS_OPEN: u8 = 0;
pub const STATUS_RESOLVED: u8 = 1;
pub const STATUS_SWEPT: u8 = 2;
pub const OUTCOME_HOME: u8 = 0;
pub const OUTCOME_DRAW: u8 = 1;
pub const OUTCOME_AWAY: u8 = 2;
pub const OUTCOME_NONE: u8 = 255;

#[derive(Clone, Copy)]
pub struct Pool {
    pub fixture_id: u64,
    pub admin: Address,
    pub close_ts: i64,
    pub status: u8,
    pub total_locked: u64,
    pub outcome_totals: [u64; 3],
    pub winning_outcome: u8,
    pub final_home_score: u16,
    pub final_away_score: u16,
    pub fee_bps: u16,
    pub fee_amount: u64,
    pub net_payout_pool: u64,
    pub pool_bump: u8,
    pub vault_bump: u8,
}

impl Pool {
    pub fn load(account: &AccountView) -> Result<Self, ProgramError> {
        if !account.owned_by(&crate::ID) || account.data_len() < POOL_LEN {
            return Err(ProgramError::InvalidAccountData);
        }

        let data = account.try_borrow()?;
        if data[0] != POOL_DISCRIMINATOR {
            return Err(ProgramError::InvalidAccountData);
        }

        let mut admin = [0u8; 32];
        admin.copy_from_slice(&data[9..41]);

        Ok(Self {
            fixture_id: u64::from_le_bytes(data[1..9].try_into().unwrap()),
            admin: Address::new_from_array(admin),
            close_ts: i64::from_le_bytes(data[41..49].try_into().unwrap()),
            status: data[49],
            total_locked: u64::from_le_bytes(data[50..58].try_into().unwrap()),
            outcome_totals: [
                u64::from_le_bytes(data[58..66].try_into().unwrap()),
                u64::from_le_bytes(data[66..74].try_into().unwrap()),
                u64::from_le_bytes(data[74..82].try_into().unwrap()),
            ],
            winning_outcome: data[82],
            final_home_score: u16::from_le_bytes(data[83..85].try_into().unwrap()),
            final_away_score: u16::from_le_bytes(data[85..87].try_into().unwrap()),
            fee_bps: u16::from_le_bytes(data[87..89].try_into().unwrap()),
            fee_amount: u64::from_le_bytes(data[89..97].try_into().unwrap()),
            net_payout_pool: u64::from_le_bytes(data[97..105].try_into().unwrap()),
            pool_bump: data[105],
            vault_bump: data[106],
        })
    }

    pub fn store(&self, account: &mut AccountView) -> Result<(), ProgramError> {
        if !account.owned_by(&crate::ID) || account.data_len() < POOL_LEN {
            return Err(ProgramError::InvalidAccountData);
        }

        let mut data = account.try_borrow_mut()?;
        data[0] = POOL_DISCRIMINATOR;
        data[1..9].copy_from_slice(&self.fixture_id.to_le_bytes());
        data[9..41].copy_from_slice(self.admin.as_ref());
        data[41..49].copy_from_slice(&self.close_ts.to_le_bytes());
        data[49] = self.status;
        data[50..58].copy_from_slice(&self.total_locked.to_le_bytes());
        data[58..66].copy_from_slice(&self.outcome_totals[0].to_le_bytes());
        data[66..74].copy_from_slice(&self.outcome_totals[1].to_le_bytes());
        data[74..82].copy_from_slice(&self.outcome_totals[2].to_le_bytes());
        data[82] = self.winning_outcome;
        data[83..85].copy_from_slice(&self.final_home_score.to_le_bytes());
        data[85..87].copy_from_slice(&self.final_away_score.to_le_bytes());
        data[87..89].copy_from_slice(&self.fee_bps.to_le_bytes());
        data[89..97].copy_from_slice(&self.fee_amount.to_le_bytes());
        data[97..105].copy_from_slice(&self.net_payout_pool.to_le_bytes());
        data[105] = self.pool_bump;
        data[106] = self.vault_bump;
        Ok(())
    }
}

pub fn validate_outcome(outcome: u8) -> Result<usize, ProgramError> {
    match outcome {
        OUTCOME_HOME => Ok(0),
        OUTCOME_DRAW => Ok(1),
        OUTCOME_AWAY => Ok(2),
        _ => Err(crate::error::TxPoolsError::InvalidOutcome.into()),
    }
}
