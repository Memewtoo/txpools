use pinocchio::{error::ProgramError, AccountView, Address};

pub const CONFIG_DISCRIMINATOR: u8 = 1;
// Fixed account layout: discriminator + admin + fee recipient + fee bps + bump.
pub const CONFIG_LEN: usize = 68;

#[derive(Clone, Copy)]
pub struct Config {
    pub admin: Address,
    pub fee_recipient: Address,
    pub fee_bps: u16,
    pub bump: u8,
}

impl Config {
    pub fn load(account: &AccountView) -> Result<Self, ProgramError> {
        if !account.owned_by(&crate::ID) || account.data_len() < CONFIG_LEN {
            return Err(ProgramError::InvalidAccountData);
        }

        let data = account.try_borrow()?;
        if data[0] != CONFIG_DISCRIMINATOR {
            return Err(ProgramError::InvalidAccountData);
        }

        let mut admin = [0u8; 32];
        admin.copy_from_slice(&data[1..33]);
        let mut fee_recipient = [0u8; 32];
        fee_recipient.copy_from_slice(&data[33..65]);

        Ok(Self {
            admin: Address::new_from_array(admin),
            fee_recipient: Address::new_from_array(fee_recipient),
            fee_bps: u16::from_le_bytes(data[65..67].try_into().unwrap()),
            bump: data[67],
        })
    }

    pub fn store(&self, account: &mut AccountView) -> Result<(), ProgramError> {
        if !account.owned_by(&crate::ID) || account.data_len() < CONFIG_LEN {
            return Err(ProgramError::InvalidAccountData);
        }

        let mut data = account.try_borrow_mut()?;
        data[0] = CONFIG_DISCRIMINATOR;
        data[1..33].copy_from_slice(self.admin.as_ref());
        data[33..65].copy_from_slice(self.fee_recipient.as_ref());
        data[65..67].copy_from_slice(&self.fee_bps.to_le_bytes());
        data[67] = self.bump;
        Ok(())
    }
}
