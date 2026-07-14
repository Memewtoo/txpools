use pinocchio::{cpi::Seed, error::ProgramError, AccountView, Address, ProgramResult};

use crate::{
    error::TxPoolsError,
    instructions::{create_pda_account, parse_u16, validate_system_and_rent},
    state::config::{Config, CONFIG_LEN},
    BASIS_POINTS_DENOMINATOR, BOOTSTRAP_AUTHORITY, CONFIG_SEED,
};

pub const INITIALIZE_CONFIG: u8 = 0;

pub struct InitializeConfig<'a> {
    pub accounts: InitializeConfigAccounts<'a>,
    pub fee_bps: u16,
}

impl<'a> TryFrom<(&'a [u8], &'a mut [AccountView])> for InitializeConfig<'a> {
    type Error = ProgramError;

    fn try_from((data, accounts): (&'a [u8], &'a mut [AccountView])) -> Result<Self, Self::Error> {
        // Require exactly one serialized u16 fee argument.
        if data.len() != 2 {
            return Err(ProgramError::InvalidInstructionData);
        }

        // Parse the required accounts and fee basis points.
        Ok(Self {
            accounts: InitializeConfigAccounts::try_from(accounts)?,
            fee_bps: parse_u16(data)?,
        })
    }
}

impl InitializeConfig<'_> {
    pub fn process(&mut self) -> ProgramResult {
        // Require the deployment's bootstrap authority as the first admin.
        if self.accounts.admin.address() != &BOOTSTRAP_AUTHORITY {
            return Err(TxPoolsError::Unauthorized.into());
        }

        // Keep the configured fee within the full basis-point range.
        if self.fee_bps as u64 > BASIS_POINTS_DENOMINATOR {
            return Err(TxPoolsError::InvalidFee.into());
        }

        // Derive and verify the singleton config PDA.
        let (config_pda, bump) = Address::find_program_address(&[CONFIG_SEED], &crate::ID);
        if self.accounts.config.address() != &config_pda {
            return Err(TxPoolsError::InvalidPda.into());
        }

        // Create the program-owned config account with the derived PDA signer.
        let bump_seed = [bump];
        let seeds = [Seed::from(CONFIG_SEED), Seed::from(&bump_seed)];
        create_pda_account(
            self.accounts.admin,
            self.accounts.config,
            CONFIG_LEN,
            &crate::ID,
            self.accounts.rent_sysvar,
            &seeds,
        )?;

        // Store the initial authority, fee recipient, fee rate, and PDA bump.
        Config {
            admin: *self.accounts.admin.address(),
            fee_recipient: *self.accounts.fee_recipient.address(),
            fee_bps: self.fee_bps,
            bump,
        }
        .store(self.accounts.config)
    }
}

pub struct InitializeConfigAccounts<'a> {
    pub admin: &'a mut AccountView,
    pub config: &'a mut AccountView,
    pub fee_recipient: &'a mut AccountView,
    pub system_program: &'a mut AccountView,
    pub rent_sysvar: &'a mut AccountView,
}

impl<'a> TryFrom<&'a mut [AccountView]> for InitializeConfigAccounts<'a> {
    type Error = ProgramError;

    fn try_from(accounts: &'a mut [AccountView]) -> Result<Self, Self::Error> {
        // Require the complete initialize-config account list.
        let [admin, config, fee_recipient, system_program, rent_sysvar] = accounts else {
            return Err(ProgramError::NotEnoughAccountKeys);
        };

        // Require the admin signature and writable funding/config accounts.
        if !admin.is_signer() || !admin.is_writable() || !config.is_writable() {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Verify the system program and rent sysvar addresses.
        validate_system_and_rent(system_program, rent_sysvar)?;
        Ok(Self {
            admin,
            config,
            fee_recipient,
            system_program,
            rent_sysvar,
        })
    }
}
