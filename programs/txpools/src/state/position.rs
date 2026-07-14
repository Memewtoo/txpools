use pinocchio::{error::ProgramError, AccountView, Address};

pub const POSITION_DISCRIMINATOR: u8 = 3;
// One fixed-size account exists per (pool, user, outcome) tuple.
pub const POSITION_LEN: usize = 76;

#[derive(Clone, Copy)]
pub struct Position {
    pub user: Address,
    pub pool: Address,
    pub outcome: u8,
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
}

impl Position {
    pub fn load(account: &AccountView) -> Result<Self, ProgramError> {
        if !account.owned_by(&crate::ID) || account.data_len() < POSITION_LEN {
            return Err(ProgramError::InvalidAccountData);
        }

        let data = account.try_borrow()?;
        if data[0] != POSITION_DISCRIMINATOR {
            return Err(ProgramError::InvalidAccountData);
        }

        let mut user = [0u8; 32];
        user.copy_from_slice(&data[1..33]);
        let mut pool = [0u8; 32];
        pool.copy_from_slice(&data[33..65]);

        Ok(Self {
            user: Address::new_from_array(user),
            pool: Address::new_from_array(pool),
            outcome: data[65],
            amount: u64::from_le_bytes(data[66..74].try_into().unwrap()),
            claimed: data[74] == 1,
            bump: data[75],
        })
    }

    pub fn store(&self, account: &mut AccountView) -> Result<(), ProgramError> {
        if !account.owned_by(&crate::ID) || account.data_len() < POSITION_LEN {
            return Err(ProgramError::InvalidAccountData);
        }

        let mut data = account.try_borrow_mut()?;
        data[0] = POSITION_DISCRIMINATOR;
        data[1..33].copy_from_slice(self.user.as_ref());
        data[33..65].copy_from_slice(self.pool.as_ref());
        data[65] = self.outcome;
        data[66..74].copy_from_slice(&self.amount.to_le_bytes());
        data[74] = self.claimed as u8;
        data[75] = self.bump;
        Ok(())
    }
}
