use pinocchio::{cpi::Seed, AccountView, ProgramResult};
use pinocchio_token::instructions::{InitializeAccount3, TransferChecked};

pub fn token_initialize_account(
    account: &AccountView,
    mint: &AccountView,
    owner: &AccountView,
    rent_sysvar: &AccountView,
) -> ProgramResult {
    let _ = rent_sysvar;
    InitializeAccount3::new(account, mint, owner.address()).invoke()
}

pub fn token_transfer_checked(
    from: &AccountView,
    mint: &AccountView,
    to: &AccountView,
    authority: &AccountView,
    amount: u64,
    decimals: u8,
) -> ProgramResult {
    TransferChecked::new(from, mint, to, authority, amount, decimals).invoke()
}

pub fn token_transfer_checked_signed(
    from: &AccountView,
    mint: &AccountView,
    to: &AccountView,
    authority: &AccountView,
    amount: u64,
    decimals: u8,
    signer_seeds: &[Seed],
) -> ProgramResult {
    TransferChecked::new(from, mint, to, authority, amount, decimals)
        .invoke_signed(&[signer_seeds.into()])
}
