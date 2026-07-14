use pinocchio::{error::ProgramError, AccountView, Address};

use crate::{error::TxPoolsError, TOKEN_PROGRAM_ID, USDC_DECIMALS, USDC_MINT};

pub const MINT_LEN: usize = 82;
pub const TOKEN_ACCOUNT_LEN: usize = 165;
const MINT_DECIMALS_OFFSET: usize = 44;
const MINT_INITIALIZED_OFFSET: usize = 45;
const TOKEN_AMOUNT_OFFSET: usize = 64;
const TOKEN_STATE_OFFSET: usize = 108;

#[derive(Clone, Copy)]
pub struct TokenAccountInfo {
    pub mint: Address,
    pub owner: Address,
    pub amount: u64,
}

pub fn validate_usdc_mint(mint: &AccountView) -> Result<u8, ProgramError> {
    if mint.address() != &USDC_MINT
        || !mint.owned_by(&TOKEN_PROGRAM_ID)
        || mint.data_len() != MINT_LEN
    {
        return Err(TxPoolsError::InvalidMint.into());
    }

    let data = mint.try_borrow()?;
    if data[MINT_INITIALIZED_OFFSET] != 1 || data[MINT_DECIMALS_OFFSET] != USDC_DECIMALS {
        return Err(TxPoolsError::InvalidMint.into());
    }
    Ok(data[MINT_DECIMALS_OFFSET])
}

pub fn parse_token_account(account: &AccountView) -> Result<TokenAccountInfo, ProgramError> {
    if !account.owned_by(&TOKEN_PROGRAM_ID) || account.data_len() != TOKEN_ACCOUNT_LEN {
        return Err(TxPoolsError::InvalidTokenAccount.into());
    }

    let data = account.try_borrow()?;
    if data[TOKEN_STATE_OFFSET] != 1 {
        return Err(TxPoolsError::InvalidTokenAccount.into());
    }

    Ok(TokenAccountInfo {
        mint: read_address(&data[0..32]),
        owner: read_address(&data[32..64]),
        amount: u64::from_le_bytes(
            data[TOKEN_AMOUNT_OFFSET..TOKEN_AMOUNT_OFFSET + 8]
                .try_into()
                .unwrap(),
        ),
    })
}

pub fn verify_token_account(
    account: &AccountView,
    expected_owner: &Address,
) -> Result<TokenAccountInfo, ProgramError> {
    let parsed = parse_token_account(account)?;
    if parsed.mint != USDC_MINT || parsed.owner != *expected_owner {
        return Err(TxPoolsError::InvalidTokenAccount.into());
    }
    Ok(parsed)
}

fn read_address(data: &[u8]) -> Address {
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(data);
    Address::new_from_array(bytes)
}
