#[cfg(test)]
mod tests {
    use mollusk_svm::{
        result::{InstructionResult, ProgramResult},
        Mollusk,
    };
    use solana_account::Account;
    use solana_instruction::{AccountMeta, Instruction};
    use solana_program_pack::Pack;
    use solana_pubkey::Pubkey;
    use spl_token_interface::state::{Account as TokenAccount, AccountState, Mint};
    use txpools::ID;

    const INITIALIZE_CONFIG: u8 = 0;
    const INITIALIZE_POOL: u8 = 1;
    const LOCK_PREDICTION: u8 = 2;
    const RESOLVE_POOL: u8 = 3;
    const CLAIM_WINNINGS: u8 = 4;
    const SWEEP_UNCLAIMED_POOL: u8 = 5;

    const OUTCOME_HOME: u8 = 0;
    const OUTCOME_AWAY: u8 = 2;
    const VALIDATE_STAT_DISCRIMINATOR: [u8; 8] = [107, 197, 232, 90, 191, 136, 105, 185];
    const HOME_SCORE_STAT_KEY: u32 = 1;
    const AWAY_SCORE_STAT_KEY: u32 = 2;
    const TXLINE_EPOCH_DAY: u16 = 20_000;
    const TXLINE_TS: i64 = 1_728_000_000_000;
    const TXLINE_TS_SECS: i64 = TXLINE_TS / 1_000;

    const CONFIG_LEN: usize = 68;
    const POOL_LEN: usize = 107;
    const POSITION_LEN: usize = 76;
    const FEE_BPS: u16 = 200;
    const BONUS_POOL_AMOUNT: u64 = 150_000_000;
    const USER_LAMPORTS: u64 = 1_000_000_000;
    const FIXTURE_ID: u64 = 2026070801;

    const PROGRAM_ID: Pubkey = Pubkey::new_from_array(*ID.as_array());

    #[derive(Clone, Copy)]
    struct Fixture {
        fixture_id: u64,
        admin: Pubkey,
        fee_recipient: Pubkey,
        user_home: Pubkey,
        user_away: Pubkey,
        config: Pubkey,
        pool: Pubkey,
        vault: Pubkey,
        admin_token: Pubkey,
        fee_recipient_token: Pubkey,
        home_token: Pubkey,
        away_token: Pubkey,
        home_position: Pubkey,
        away_position: Pubkey,
    }

    fn mollusk() -> Mollusk {
        std::env::set_var("SBF_OUT_DIR", "target/deploy");
        let mut mollusk = Mollusk::new(&PROGRAM_ID, "txpools");
        mollusk_svm_programs_token::token::add_program(&mut mollusk);
        mollusk.add_program(&txline_program_id(), "mock_txline");
        mollusk
    }

    fn usdc_mint() -> Pubkey {
        Pubkey::new_from_array(*txpools::USDC_MINT.as_array())
    }

    fn txline_program_id() -> Pubkey {
        Pubkey::new_from_array(*txpools::TXLINE_PROGRAM_ID.as_array())
    }

    fn empty_system_account() -> Account {
        Account::new(0, 0, &solana_sdk_ids::system_program::id())
    }

    fn funded_system_account() -> Account {
        Account::new(USER_LAMPORTS, 0, &solana_sdk_ids::system_program::id())
    }

    fn mint_account() -> Account {
        mollusk_svm_programs_token::token::create_account_for_mint(Mint {
            supply: 10_000_000_000,
            decimals: txpools::USDC_DECIMALS,
            is_initialized: true,
            ..Mint::default()
        })
    }

    fn token_account(mint: Pubkey, owner: Pubkey, amount: u64) -> Account {
        mollusk_svm_programs_token::token::create_account_for_token_account(TokenAccount {
            mint,
            owner,
            amount,
            state: AccountState::Initialized,
            ..TokenAccount::default()
        })
    }

    fn config_pda() -> Pubkey {
        Pubkey::find_program_address(&[b"config"], &PROGRAM_ID).0
    }

    fn pool_pda(fixture_id: u64) -> Pubkey {
        Pubkey::find_program_address(&[b"pool", &fixture_id.to_le_bytes()], &PROGRAM_ID).0
    }

    fn vault_pda(pool: Pubkey) -> Pubkey {
        Pubkey::find_program_address(&[b"vault", pool.as_ref()], &PROGRAM_ID).0
    }

    fn daily_scores_pda() -> Pubkey {
        Pubkey::find_program_address(
            &[b"daily_scores_roots", &TXLINE_EPOCH_DAY.to_le_bytes()],
            &txline_program_id(),
        )
        .0
    }

    fn txline_program_account() -> (Pubkey, Account) {
        (
            txline_program_id(),
            mollusk_svm::program::create_program_account_loader_v3(&txline_program_id()),
        )
    }

    fn advance_to_settlement(mollusk: &mut Mollusk) {
        mollusk.sysvars.clock.unix_timestamp = TXLINE_TS_SECS;
    }

    fn position_pda(pool: Pubkey, user: Pubkey, outcome: u8) -> Pubkey {
        Pubkey::find_program_address(
            &[b"position", pool.as_ref(), user.as_ref(), &[outcome]],
            &PROGRAM_ID,
        )
        .0
    }

    fn make_fixture(seed: u8) -> Fixture {
        let fixture_id = FIXTURE_ID + seed as u64;
        let admin = Pubkey::new_from_array(*txpools::BOOTSTRAP_AUTHORITY.as_array());
        let fee_recipient = Pubkey::new_from_array([seed + 1; 32]);
        let user_home = Pubkey::new_from_array([seed + 2; 32]);
        let user_away = Pubkey::new_from_array([seed + 3; 32]);
        let pool = pool_pda(fixture_id);
        Fixture {
            fixture_id,
            admin,
            fee_recipient,
            user_home,
            user_away,
            config: config_pda(),
            pool,
            vault: vault_pda(pool),
            admin_token: Pubkey::new_from_array([seed + 4; 32]),
            fee_recipient_token: Pubkey::new_from_array([seed + 5; 32]),
            home_token: Pubkey::new_from_array([seed + 6; 32]),
            away_token: Pubkey::new_from_array([seed + 7; 32]),
            home_position: position_pda(pool, user_home, OUTCOME_HOME),
            away_position: position_pda(pool, user_away, OUTCOME_AWAY),
        }
    }

    fn account(result: &InstructionResult, address: Pubkey) -> Account {
        result
            .resulting_accounts
            .iter()
            .find(|(pubkey, _)| *pubkey == address)
            .map(|(_, account)| account.clone())
            .unwrap()
    }

    fn merge_accounts(
        previous: &[(Pubkey, Account)],
        result: &InstructionResult,
    ) -> Vec<(Pubkey, Account)> {
        previous
            .iter()
            .map(|(address, old_account)| {
                let account = result
                    .resulting_accounts
                    .iter()
                    .find(|(updated_address, _)| updated_address == address)
                    .map(|(_, updated_account)| updated_account.clone())
                    .unwrap_or_else(|| old_account.clone());
                (*address, account)
            })
            .collect()
    }

    fn unpack_token(result: &InstructionResult, address: Pubkey) -> TokenAccount {
        TokenAccount::unpack(&account(result, address).data).unwrap()
    }

    fn read_u64(data: &[u8], offset: usize) -> u64 {
        u64::from_le_bytes(data[offset..offset + 8].try_into().unwrap())
    }

    fn read_u16(data: &[u8], offset: usize) -> u16 {
        u16::from_le_bytes(data[offset..offset + 2].try_into().unwrap())
    }

    fn initialize_config_ix(fixture: Fixture) -> Instruction {
        let data = [vec![INITIALIZE_CONFIG], FEE_BPS.to_le_bytes().to_vec()].concat();
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &data,
            vec![
                AccountMeta::new(fixture.admin, true),
                AccountMeta::new(fixture.config, false),
                AccountMeta::new_readonly(fixture.fee_recipient, false),
                AccountMeta::new_readonly(solana_sdk_ids::system_program::id(), false),
                AccountMeta::new_readonly(solana_sdk_ids::sysvar::rent::id(), false),
            ],
        )
    }

    fn initialize_pool_ix(fixture: Fixture) -> Instruction {
        initialize_pool_ix_with_close(fixture, 1)
    }

    fn initialize_pool_ix_with_close(fixture: Fixture, close_ts: i64) -> Instruction {
        let data = [
            vec![INITIALIZE_POOL],
            fixture.fixture_id.to_le_bytes().to_vec(),
            close_ts.to_le_bytes().to_vec(),
        ]
        .concat();
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &data,
            vec![
                AccountMeta::new(fixture.admin, true),
                AccountMeta::new_readonly(fixture.config, false),
                AccountMeta::new(fixture.pool, false),
                AccountMeta::new(fixture.vault, false),
                AccountMeta::new(fixture.admin_token, false),
                AccountMeta::new_readonly(usdc_mint(), false),
                AccountMeta::new_readonly(mollusk_svm_programs_token::token::ID, false),
                AccountMeta::new_readonly(solana_sdk_ids::system_program::id(), false),
                AccountMeta::new_readonly(solana_sdk_ids::sysvar::rent::id(), false),
            ],
        )
    }

    fn lock_prediction_ix(
        fixture: Fixture,
        user: Pubkey,
        position: Pubkey,
        user_token: Pubkey,
        outcome: u8,
        amount: u64,
    ) -> Instruction {
        let data = [
            vec![LOCK_PREDICTION, outcome],
            amount.to_le_bytes().to_vec(),
        ]
        .concat();
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &data,
            vec![
                AccountMeta::new(user, true),
                AccountMeta::new(fixture.pool, false),
                AccountMeta::new(position, false),
                AccountMeta::new(user_token, false),
                AccountMeta::new(fixture.vault, false),
                AccountMeta::new_readonly(usdc_mint(), false),
                AccountMeta::new_readonly(mollusk_svm_programs_token::token::ID, false),
                AccountMeta::new_readonly(solana_sdk_ids::system_program::id(), false),
                AccountMeta::new_readonly(solana_sdk_ids::sysvar::rent::id(), false),
            ],
        )
    }

    fn txline_validate_stat_data_with_ts(
        fixture_id: u64,
        stat_key: u32,
        score: u16,
        timestamp_ms: i64,
    ) -> Vec<u8> {
        let mut data = Vec::new();
        data.extend_from_slice(&VALIDATE_STAT_DISCRIMINATOR);
        data.extend_from_slice(&timestamp_ms.to_le_bytes());
        data.extend_from_slice(&(fixture_id as i64).to_le_bytes());
        data.extend_from_slice(&1i32.to_le_bytes());
        data.extend_from_slice(&timestamp_ms.to_le_bytes());
        data.extend_from_slice(&timestamp_ms.to_le_bytes());
        data.extend_from_slice(&[0u8; 32]);
        data.extend_from_slice(&0u32.to_le_bytes());
        data.extend_from_slice(&0u32.to_le_bytes());
        data.extend_from_slice(&(score as i32).to_le_bytes());
        data.push(2);
        data.extend_from_slice(&stat_key.to_le_bytes());
        data.extend_from_slice(&(score as i32).to_le_bytes());
        data.extend_from_slice(&0i32.to_le_bytes());
        data.extend_from_slice(&[0u8; 32]);
        data.extend_from_slice(&0u32.to_le_bytes());
        data.push(0);
        data.push(0);
        data
    }

    fn resolve_pool_ix(fixture: Fixture, home_score: u16, away_score: u16) -> Instruction {
        resolve_pool_ix_with_ts(fixture, home_score, away_score, TXLINE_TS)
    }

    fn resolve_pool_ix_with_ts(
        fixture: Fixture,
        home_score: u16,
        away_score: u16,
        timestamp_ms: i64,
    ) -> Instruction {
        let home_data = txline_validate_stat_data_with_ts(
            fixture.fixture_id,
            HOME_SCORE_STAT_KEY,
            home_score,
            timestamp_ms,
        );
        let away_data = txline_validate_stat_data_with_ts(
            fixture.fixture_id,
            AWAY_SCORE_STAT_KEY,
            away_score,
            timestamp_ms,
        );
        let mut data = vec![RESOLVE_POOL];
        data.extend_from_slice(&home_score.to_le_bytes());
        data.extend_from_slice(&away_score.to_le_bytes());
        data.extend_from_slice(&(home_data.len() as u16).to_le_bytes());
        data.extend_from_slice(&home_data);
        data.extend_from_slice(&(away_data.len() as u16).to_le_bytes());
        data.extend_from_slice(&away_data);
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &data,
            vec![
                AccountMeta::new(fixture.admin, true),
                AccountMeta::new_readonly(fixture.config, false),
                AccountMeta::new(fixture.pool, false),
                AccountMeta::new(fixture.vault, false),
                AccountMeta::new(fixture.fee_recipient_token, false),
                AccountMeta::new_readonly(usdc_mint(), false),
                AccountMeta::new_readonly(mollusk_svm_programs_token::token::ID, false),
                AccountMeta::new_readonly(txline_program_id(), false),
                AccountMeta::new_readonly(daily_scores_pda(), false),
            ],
        )
    }

    fn claim_winnings_ix(
        fixture: Fixture,
        user: Pubkey,
        position: Pubkey,
        user_token: Pubkey,
    ) -> Instruction {
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &[CLAIM_WINNINGS],
            vec![
                AccountMeta::new(user, true),
                AccountMeta::new(fixture.pool, false),
                AccountMeta::new(position, false),
                AccountMeta::new(fixture.vault, false),
                AccountMeta::new(user_token, false),
                AccountMeta::new_readonly(usdc_mint(), false),
                AccountMeta::new_readonly(mollusk_svm_programs_token::token::ID, false),
            ],
        )
    }

    fn sweep_unclaimed_pool_ix(fixture: Fixture) -> Instruction {
        Instruction::new_with_bytes(
            PROGRAM_ID,
            &[SWEEP_UNCLAIMED_POOL],
            vec![
                AccountMeta::new(fixture.admin, true),
                AccountMeta::new_readonly(fixture.config, false),
                AccountMeta::new(fixture.pool, false),
                AccountMeta::new(fixture.vault, false),
                AccountMeta::new(fixture.fee_recipient_token, false),
                AccountMeta::new_readonly(usdc_mint(), false),
                AccountMeta::new_readonly(mollusk_svm_programs_token::token::ID, false),
            ],
        )
    }

    fn initialized_accounts(mollusk: &Mollusk, fixture: Fixture) -> Vec<(Pubkey, Account)> {
        vec![
            (fixture.admin, funded_system_account()),
            (fixture.config, empty_system_account()),
            (fixture.fee_recipient, funded_system_account()),
            mollusk_svm::program::keyed_account_for_system_program(),
            mollusk.sysvars.keyed_account_for_rent_sysvar(),
        ]
    }

    fn pool_accounts(
        mollusk: &Mollusk,
        fixture: Fixture,
        config: Account,
    ) -> Vec<(Pubkey, Account)> {
        vec![
            (fixture.admin, funded_system_account()),
            (fixture.config, config),
            (fixture.pool, empty_system_account()),
            (fixture.vault, empty_system_account()),
            (
                fixture.admin_token,
                token_account(usdc_mint(), fixture.admin, 1_000_000_000),
            ),
            (usdc_mint(), mint_account()),
            mollusk_svm_programs_token::token::keyed_account(),
            mollusk_svm::program::keyed_account_for_system_program(),
            mollusk.sysvars.keyed_account_for_rent_sysvar(),
        ]
    }

    fn happy_path_base(mollusk: &Mollusk, fixture: Fixture) -> Vec<(Pubkey, Account)> {
        let init_config = mollusk.process_instruction(
            &initialize_config_ix(fixture),
            &initialized_accounts(mollusk, fixture),
        );
        assert_eq!(init_config.program_result, ProgramResult::Success);

        let init_pool = mollusk.process_instruction(
            &initialize_pool_ix(fixture),
            &pool_accounts(mollusk, fixture, account(&init_config, fixture.config)),
        );
        assert_eq!(init_pool.program_result, ProgramResult::Success);

        vec![
            (fixture.user_home, funded_system_account()),
            (fixture.user_away, funded_system_account()),
            (fixture.pool, account(&init_pool, fixture.pool)),
            (fixture.home_position, empty_system_account()),
            (fixture.away_position, empty_system_account()),
            (
                fixture.home_token,
                token_account(usdc_mint(), fixture.user_home, 1_000_000),
            ),
            (
                fixture.away_token,
                token_account(usdc_mint(), fixture.user_away, 1_000_000),
            ),
            (fixture.vault, account(&init_pool, fixture.vault)),
            (
                fixture.fee_recipient_token,
                token_account(usdc_mint(), fixture.fee_recipient, 0),
            ),
            (usdc_mint(), account(&init_pool, usdc_mint())),
            mollusk_svm_programs_token::token::keyed_account(),
            mollusk_svm::program::keyed_account_for_system_program(),
            mollusk.sysvars.keyed_account_for_rent_sysvar(),
        ]
    }

    #[test]
    fn initializes_config_and_pool() {
        let mollusk = mollusk();
        let fixture = make_fixture(10);

        let init_config = mollusk.process_instruction(
            &initialize_config_ix(fixture),
            &initialized_accounts(&mollusk, fixture),
        );
        assert_eq!(init_config.program_result, ProgramResult::Success);
        let config = account(&init_config, fixture.config);
        assert_eq!(config.data.len(), CONFIG_LEN);
        assert_eq!(config.data[0], 1);
        assert_eq!(&config.data[1..33], fixture.admin.as_ref());
        assert_eq!(&config.data[33..65], fixture.fee_recipient.as_ref());
        assert_eq!(read_u16(&config.data, 65), FEE_BPS);

        let init_pool = mollusk.process_instruction(
            &initialize_pool_ix(fixture),
            &pool_accounts(&mollusk, fixture, config),
        );
        assert_eq!(init_pool.program_result, ProgramResult::Success);
        let pool = account(&init_pool, fixture.pool);
        assert_eq!(pool.data.len(), POOL_LEN);
        assert_eq!(pool.data[0], 2);
        assert_eq!(read_u64(&pool.data, 1), fixture.fixture_id);
        assert_eq!(pool.data[49], 0);
        assert_eq!(read_u64(&pool.data, 50), 0);
        assert_eq!(unpack_token(&init_pool, fixture.vault).owner, fixture.pool);
        assert_eq!(unpack_token(&init_pool, fixture.vault).mint, usdc_mint());
        assert_eq!(
            unpack_token(&init_pool, fixture.vault).amount,
            BONUS_POOL_AMOUNT
        );
        assert_eq!(
            unpack_token(&init_pool, fixture.admin_token).amount,
            1_000_000_000 - BONUS_POOL_AMOUNT
        );
    }

    #[test]
    fn locks_predictions_resolves_and_claims_winnings() {
        let mut mollusk = mollusk();
        let fixture = make_fixture(30);
        let mut accounts = happy_path_base(&mollusk, fixture);

        let home_lock = mollusk.process_instruction(
            &lock_prediction_ix(
                fixture,
                fixture.user_home,
                fixture.home_position,
                fixture.home_token,
                OUTCOME_HOME,
                600_000,
            ),
            &[
                accounts[0].clone(),
                accounts[2].clone(),
                accounts[3].clone(),
                accounts[5].clone(),
                accounts[7].clone(),
                accounts[9].clone(),
                accounts[10].clone(),
                accounts[11].clone(),
                accounts[12].clone(),
            ],
        );
        assert_eq!(home_lock.program_result, ProgramResult::Success);
        accounts = merge_accounts(&accounts, &home_lock);
        assert_eq!(
            account(&home_lock, fixture.home_position).data.len(),
            POSITION_LEN
        );
        assert_eq!(
            unpack_token(&home_lock, fixture.vault).amount,
            BONUS_POOL_AMOUNT + 600_000
        );

        let away_lock = mollusk.process_instruction(
            &lock_prediction_ix(
                fixture,
                fixture.user_away,
                fixture.away_position,
                fixture.away_token,
                OUTCOME_AWAY,
                400_000,
            ),
            &[
                accounts[1].clone(),
                accounts[2].clone(),
                accounts[4].clone(),
                accounts[6].clone(),
                accounts[7].clone(),
                accounts[9].clone(),
                accounts[10].clone(),
                accounts[11].clone(),
                accounts[12].clone(),
            ],
        );
        assert_eq!(away_lock.program_result, ProgramResult::Success);
        accounts = merge_accounts(&accounts, &away_lock);
        assert_eq!(
            unpack_token(&away_lock, fixture.vault).amount,
            BONUS_POOL_AMOUNT + 1_000_000
        );

        advance_to_settlement(&mut mollusk);
        let stale_resolve = mollusk.process_instruction(
            &resolve_pool_ix_with_ts(fixture, 2, 1, 0),
            &[
                (fixture.admin, funded_system_account()),
                (fixture.config, {
                    let init_config = mollusk.process_instruction(
                        &initialize_config_ix(fixture),
                        &initialized_accounts(&mollusk, fixture),
                    );
                    account(&init_config, fixture.config)
                }),
                accounts[2].clone(),
                accounts[7].clone(),
                accounts[8].clone(),
                accounts[9].clone(),
                accounts[10].clone(),
                txline_program_account(),
                (daily_scores_pda(), empty_system_account()),
            ],
        );
        assert_ne!(stale_resolve.program_result, ProgramResult::Success);

        let resolve = mollusk.process_instruction(
            &resolve_pool_ix(fixture, 2, 1),
            &[
                (fixture.admin, funded_system_account()),
                (fixture.config, {
                    let init_config = mollusk.process_instruction(
                        &initialize_config_ix(fixture),
                        &initialized_accounts(&mollusk, fixture),
                    );
                    account(&init_config, fixture.config)
                }),
                accounts[2].clone(),
                accounts[7].clone(),
                accounts[8].clone(),
                accounts[9].clone(),
                accounts[10].clone(),
                txline_program_account(),
                (daily_scores_pda(), empty_system_account()),
            ],
        );
        assert_eq!(resolve.program_result, ProgramResult::Success);
        accounts = merge_accounts(&accounts, &resolve);
        let resolved_pool = account(&resolve, fixture.pool);
        assert_eq!(resolved_pool.data[49], 1);
        assert_eq!(resolved_pool.data[82], OUTCOME_HOME);
        assert_eq!(read_u16(&resolved_pool.data, 83), 2);
        assert_eq!(read_u16(&resolved_pool.data, 85), 1);
        assert_eq!(read_u64(&resolved_pool.data, 89), 3_020_000);
        assert_eq!(read_u64(&resolved_pool.data, 97), 147_980_000);
        assert_eq!(
            unpack_token(&resolve, fixture.fee_recipient_token).amount,
            3_020_000
        );

        let claim = mollusk.process_instruction(
            &claim_winnings_ix(
                fixture,
                fixture.user_home,
                fixture.home_position,
                fixture.home_token,
            ),
            &[
                accounts[0].clone(),
                accounts[2].clone(),
                accounts[3].clone(),
                accounts[7].clone(),
                accounts[5].clone(),
                accounts[9].clone(),
                accounts[10].clone(),
            ],
        );
        assert_eq!(claim.program_result, ProgramResult::Success);
        assert_eq!(unpack_token(&claim, fixture.home_token).amount, 148_380_000);
        assert_eq!(unpack_token(&claim, fixture.vault).amount, 0);
        assert_eq!(account(&claim, fixture.home_position).data[74], 1);

        let lost_claim = mollusk.process_instruction(
            &claim_winnings_ix(
                fixture,
                fixture.user_away,
                fixture.away_position,
                fixture.away_token,
            ),
            &[
                accounts[1].clone(),
                (fixture.pool, account(&claim, fixture.pool)),
                accounts[4].clone(),
                (fixture.vault, account(&claim, fixture.vault)),
                accounts[6].clone(),
                accounts[9].clone(),
                accounts[10].clone(),
            ],
        );
        assert_ne!(lost_claim.program_result, ProgramResult::Success);
    }

    #[test]
    fn rejects_invalid_fee_and_sweeps_empty_winning_pool() {
        let mut mollusk = mollusk();
        let fixture = make_fixture(70);

        let invalid_fee_data = [vec![INITIALIZE_CONFIG], 10_001u16.to_le_bytes().to_vec()].concat();
        let invalid_fee = mollusk.process_instruction(
            &Instruction::new_with_bytes(
                PROGRAM_ID,
                &invalid_fee_data,
                vec![
                    AccountMeta::new(fixture.admin, true),
                    AccountMeta::new(fixture.config, false),
                    AccountMeta::new_readonly(fixture.fee_recipient, false),
                    AccountMeta::new_readonly(solana_sdk_ids::system_program::id(), false),
                    AccountMeta::new_readonly(solana_sdk_ids::sysvar::rent::id(), false),
                ],
            ),
            &initialized_accounts(&mollusk, fixture),
        );
        assert_ne!(invalid_fee.program_result, ProgramResult::Success);

        let mut accounts = happy_path_base(&mollusk, fixture);
        let home_lock = mollusk.process_instruction(
            &lock_prediction_ix(
                fixture,
                fixture.user_home,
                fixture.home_position,
                fixture.home_token,
                OUTCOME_HOME,
                600_000,
            ),
            &[
                accounts[0].clone(),
                accounts[2].clone(),
                accounts[3].clone(),
                accounts[5].clone(),
                accounts[7].clone(),
                accounts[9].clone(),
                accounts[10].clone(),
                accounts[11].clone(),
                accounts[12].clone(),
            ],
        );
        assert_eq!(home_lock.program_result, ProgramResult::Success);
        accounts = merge_accounts(&accounts, &home_lock);

        advance_to_settlement(&mut mollusk);
        let empty_winner = mollusk.process_instruction(
            &resolve_pool_ix(fixture, 1, 1),
            &[
                (fixture.admin, funded_system_account()),
                (fixture.config, {
                    let init_config = mollusk.process_instruction(
                        &initialize_config_ix(fixture),
                        &initialized_accounts(&mollusk, fixture),
                    );
                    account(&init_config, fixture.config)
                }),
                accounts[2].clone(),
                accounts[7].clone(),
                accounts[8].clone(),
                accounts[9].clone(),
                accounts[10].clone(),
                txline_program_account(),
                (daily_scores_pda(), empty_system_account()),
            ],
        );
        assert_eq!(empty_winner.program_result, ProgramResult::Success);
        accounts = merge_accounts(&accounts, &empty_winner);
        let resolved_pool = account(&empty_winner, fixture.pool);
        assert_eq!(resolved_pool.data[49], 1);
        assert_eq!(read_u64(&resolved_pool.data, 89), 0);
        assert_eq!(
            read_u64(&resolved_pool.data, 97),
            BONUS_POOL_AMOUNT + 600_000
        );
        assert_eq!(
            unpack_token(&empty_winner, fixture.fee_recipient_token).amount,
            0
        );

        let empty_claim = mollusk.process_instruction(
            &claim_winnings_ix(
                fixture,
                fixture.user_home,
                fixture.home_position,
                fixture.home_token,
            ),
            &[
                accounts[0].clone(),
                accounts[2].clone(),
                accounts[3].clone(),
                accounts[7].clone(),
                accounts[5].clone(),
                accounts[9].clone(),
                accounts[10].clone(),
            ],
        );
        assert_ne!(empty_claim.program_result, ProgramResult::Success);

        let sweep = mollusk.process_instruction(
            &sweep_unclaimed_pool_ix(fixture),
            &[
                (fixture.admin, funded_system_account()),
                (fixture.config, {
                    let init_config = mollusk.process_instruction(
                        &initialize_config_ix(fixture),
                        &initialized_accounts(&mollusk, fixture),
                    );
                    account(&init_config, fixture.config)
                }),
                accounts[2].clone(),
                accounts[7].clone(),
                accounts[8].clone(),
                accounts[9].clone(),
                accounts[10].clone(),
            ],
        );
        assert_eq!(sweep.program_result, ProgramResult::Success);
        assert_eq!(account(&sweep, fixture.pool).data[49], 2);
        assert_eq!(unpack_token(&sweep, fixture.vault).amount, 0);
        assert_eq!(
            unpack_token(&sweep, fixture.fee_recipient_token).amount,
            BONUS_POOL_AMOUNT + 600_000
        );
    }

    #[test]
    fn initialize_config_rejects_duplicate_and_initialize_pool_rejects_wrong_admin() {
        let mollusk = mollusk();
        let fixture = make_fixture(90);

        let init_config = mollusk.process_instruction(
            &initialize_config_ix(fixture),
            &initialized_accounts(&mollusk, fixture),
        );
        assert_eq!(init_config.program_result, ProgramResult::Success);

        let duplicate_config = mollusk.process_instruction(
            &initialize_config_ix(fixture),
            &[
                (fixture.admin, funded_system_account()),
                (fixture.config, account(&init_config, fixture.config)),
                (fixture.fee_recipient, funded_system_account()),
                mollusk_svm::program::keyed_account_for_system_program(),
                mollusk.sysvars.keyed_account_for_rent_sysvar(),
            ],
        );
        assert_ne!(duplicate_config.program_result, ProgramResult::Success);

        let wrong_admin = Pubkey::new_from_array([91; 32]);
        let mut wrong_admin_ix = initialize_pool_ix(fixture);
        wrong_admin_ix.accounts[0] = AccountMeta::new(wrong_admin, true);
        let wrong_admin_pool = mollusk.process_instruction(
            &wrong_admin_ix,
            &[
                (wrong_admin, funded_system_account()),
                (fixture.config, account(&init_config, fixture.config)),
                (fixture.pool, empty_system_account()),
                (fixture.vault, empty_system_account()),
                (
                    fixture.admin_token,
                    token_account(usdc_mint(), wrong_admin, 1_000_000_000),
                ),
                (usdc_mint(), mint_account()),
                mollusk_svm_programs_token::token::keyed_account(),
                mollusk_svm::program::keyed_account_for_system_program(),
                mollusk.sysvars.keyed_account_for_rent_sysvar(),
            ],
        );
        assert_ne!(wrong_admin_pool.program_result, ProgramResult::Success);
    }

    #[test]
    fn initialize_config_rejects_unauthorized_bootstrap_signer() {
        let mollusk = mollusk();
        let fixture = make_fixture(91);
        let unauthorized = Pubkey::new_from_array([91; 32]);
        let mut instruction = initialize_config_ix(fixture);
        instruction.accounts[0] = AccountMeta::new(unauthorized, true);

        let result = mollusk.process_instruction(
            &instruction,
            &[
                (unauthorized, funded_system_account()),
                (fixture.config, empty_system_account()),
                (fixture.fee_recipient, funded_system_account()),
                mollusk_svm::program::keyed_account_for_system_program(),
                mollusk.sysvars.keyed_account_for_rent_sysvar(),
            ],
        );

        assert_ne!(result.program_result, ProgramResult::Success);
        assert_eq!(account(&result, fixture.config).data.len(), 0);
    }

    #[test]
    fn initialize_pool_stores_valid_fixture_id_and_timestamps() {
        let mollusk = mollusk();
        let fixture = make_fixture(92);
        let close_ts = 1_900_000_000i64;
        let init_config = mollusk.process_instruction(
            &initialize_config_ix(fixture),
            &initialized_accounts(&mollusk, fixture),
        );
        assert_eq!(init_config.program_result, ProgramResult::Success);

        let init_pool = mollusk.process_instruction(
            &initialize_pool_ix_with_close(fixture, close_ts),
            &pool_accounts(&mollusk, fixture, account(&init_config, fixture.config)),
        );
        assert_eq!(init_pool.program_result, ProgramResult::Success);

        let pool = account(&init_pool, fixture.pool);
        assert_eq!(read_u64(&pool.data, 1), fixture.fixture_id);
        assert_eq!(
            i64::from_le_bytes(pool.data[41..49].try_into().unwrap()),
            close_ts
        );
    }

    #[test]
    fn lock_rejects_after_close_after_resolution_and_token_mismatches() {
        let mut mollusk = mollusk();
        let closed_fixture = make_fixture(94);
        let init_config = mollusk.process_instruction(
            &initialize_config_ix(closed_fixture),
            &initialized_accounts(&mollusk, closed_fixture),
        );
        assert_eq!(init_config.program_result, ProgramResult::Success);
        let init_closed_pool = mollusk.process_instruction(
            &initialize_pool_ix_with_close(closed_fixture, 0),
            &pool_accounts(
                &mollusk,
                closed_fixture,
                account(&init_config, closed_fixture.config),
            ),
        );
        assert_eq!(init_closed_pool.program_result, ProgramResult::Success);
        let closed_lock = mollusk.process_instruction(
            &lock_prediction_ix(
                closed_fixture,
                closed_fixture.user_home,
                closed_fixture.home_position,
                closed_fixture.home_token,
                OUTCOME_HOME,
                100_000,
            ),
            &[
                (closed_fixture.user_home, funded_system_account()),
                (
                    closed_fixture.pool,
                    account(&init_closed_pool, closed_fixture.pool),
                ),
                (closed_fixture.home_position, empty_system_account()),
                (
                    closed_fixture.home_token,
                    token_account(usdc_mint(), closed_fixture.user_home, 1_000_000),
                ),
                (
                    closed_fixture.vault,
                    account(&init_closed_pool, closed_fixture.vault),
                ),
                (usdc_mint(), account(&init_closed_pool, usdc_mint())),
                mollusk_svm_programs_token::token::keyed_account(),
                mollusk_svm::program::keyed_account_for_system_program(),
                mollusk.sysvars.keyed_account_for_rent_sysvar(),
            ],
        );
        assert_ne!(closed_lock.program_result, ProgramResult::Success);

        let fixture = make_fixture(96);
        let mut accounts = happy_path_base(&mollusk, fixture);
        let home_lock = mollusk.process_instruction(
            &lock_prediction_ix(
                fixture,
                fixture.user_home,
                fixture.home_position,
                fixture.home_token,
                OUTCOME_HOME,
                600_000,
            ),
            &[
                accounts[0].clone(),
                accounts[2].clone(),
                accounts[3].clone(),
                accounts[5].clone(),
                accounts[7].clone(),
                accounts[9].clone(),
                accounts[10].clone(),
                accounts[11].clone(),
                accounts[12].clone(),
            ],
        );
        assert_eq!(home_lock.program_result, ProgramResult::Success);
        accounts = merge_accounts(&accounts, &home_lock);

        let mut wrong_token_program_ix = lock_prediction_ix(
            fixture,
            fixture.user_away,
            fixture.away_position,
            fixture.away_token,
            OUTCOME_AWAY,
            100_000,
        );
        wrong_token_program_ix.accounts[6] =
            AccountMeta::new_readonly(solana_sdk_ids::system_program::id(), false);
        let wrong_token_program = mollusk.process_instruction(
            &wrong_token_program_ix,
            &[
                accounts[1].clone(),
                accounts[2].clone(),
                accounts[4].clone(),
                accounts[6].clone(),
                accounts[7].clone(),
                accounts[9].clone(),
                mollusk_svm::program::keyed_account_for_system_program(),
                accounts[11].clone(),
                accounts[12].clone(),
            ],
        );
        assert_ne!(wrong_token_program.program_result, ProgramResult::Success);

        let wrong_mint = Pubkey::new_from_array([200; 32]);
        let mut wrong_mint_ix = lock_prediction_ix(
            fixture,
            fixture.user_away,
            fixture.away_position,
            fixture.away_token,
            OUTCOME_AWAY,
            100_000,
        );
        wrong_mint_ix.accounts[5] = AccountMeta::new_readonly(wrong_mint, false);
        let wrong_mint_lock = mollusk.process_instruction(
            &wrong_mint_ix,
            &[
                accounts[1].clone(),
                accounts[2].clone(),
                accounts[4].clone(),
                accounts[6].clone(),
                accounts[7].clone(),
                (wrong_mint, mint_account()),
                accounts[10].clone(),
                accounts[11].clone(),
                accounts[12].clone(),
            ],
        );
        assert_ne!(wrong_mint_lock.program_result, ProgramResult::Success);

        advance_to_settlement(&mut mollusk);
        let resolve = mollusk.process_instruction(
            &resolve_pool_ix(fixture, 1, 0),
            &[
                (fixture.admin, funded_system_account()),
                (fixture.config, {
                    let init_config = mollusk.process_instruction(
                        &initialize_config_ix(fixture),
                        &initialized_accounts(&mollusk, fixture),
                    );
                    account(&init_config, fixture.config)
                }),
                accounts[2].clone(),
                accounts[7].clone(),
                accounts[8].clone(),
                accounts[9].clone(),
                accounts[10].clone(),
                txline_program_account(),
                (daily_scores_pda(), empty_system_account()),
            ],
        );
        assert_eq!(resolve.program_result, ProgramResult::Success);
        accounts = merge_accounts(&accounts, &resolve);

        let lock_after_resolution = mollusk.process_instruction(
            &lock_prediction_ix(
                fixture,
                fixture.user_away,
                fixture.away_position,
                fixture.away_token,
                OUTCOME_AWAY,
                100_000,
            ),
            &[
                accounts[1].clone(),
                accounts[2].clone(),
                accounts[4].clone(),
                accounts[6].clone(),
                accounts[7].clone(),
                accounts[9].clone(),
                accounts[10].clone(),
                accounts[11].clone(),
                accounts[12].clone(),
            ],
        );
        assert_ne!(lock_after_resolution.program_result, ProgramResult::Success);
    }

    #[test]
    fn multiple_locks_same_user_outcome_increment_position_and_pool_totals() {
        let mollusk = mollusk();
        let fixture = make_fixture(100);
        let mut accounts = happy_path_base(&mollusk, fixture);

        let first_lock = mollusk.process_instruction(
            &lock_prediction_ix(
                fixture,
                fixture.user_home,
                fixture.home_position,
                fixture.home_token,
                OUTCOME_HOME,
                100_000,
            ),
            &[
                accounts[0].clone(),
                accounts[2].clone(),
                accounts[3].clone(),
                accounts[5].clone(),
                accounts[7].clone(),
                accounts[9].clone(),
                accounts[10].clone(),
                accounts[11].clone(),
                accounts[12].clone(),
            ],
        );
        assert_eq!(first_lock.program_result, ProgramResult::Success);
        accounts = merge_accounts(&accounts, &first_lock);

        let second_lock = mollusk.process_instruction(
            &lock_prediction_ix(
                fixture,
                fixture.user_home,
                fixture.home_position,
                fixture.home_token,
                OUTCOME_HOME,
                200_000,
            ),
            &[
                accounts[0].clone(),
                accounts[2].clone(),
                accounts[3].clone(),
                accounts[5].clone(),
                accounts[7].clone(),
                accounts[9].clone(),
                accounts[10].clone(),
                accounts[11].clone(),
                accounts[12].clone(),
            ],
        );
        assert_eq!(second_lock.program_result, ProgramResult::Success);

        let pool = account(&second_lock, fixture.pool);
        let position = account(&second_lock, fixture.home_position);
        assert_eq!(
            unpack_token(&second_lock, fixture.vault).amount,
            BONUS_POOL_AMOUNT + 300_000
        );
        assert_eq!(read_u64(&pool.data, 50), 300_000);
        assert_eq!(read_u64(&pool.data, 58), 300_000);
        assert_eq!(read_u64(&position.data, 66), 300_000);
    }

    #[test]
    fn resolve_is_permissionless_and_claim_is_exact_once_only() {
        let mut mollusk = mollusk();
        let fixture = make_fixture(104);
        let mut accounts = happy_path_base(&mollusk, fixture);

        let home_lock = mollusk.process_instruction(
            &lock_prediction_ix(
                fixture,
                fixture.user_home,
                fixture.home_position,
                fixture.home_token,
                OUTCOME_HOME,
                600_000,
            ),
            &[
                accounts[0].clone(),
                accounts[2].clone(),
                accounts[3].clone(),
                accounts[5].clone(),
                accounts[7].clone(),
                accounts[9].clone(),
                accounts[10].clone(),
                accounts[11].clone(),
                accounts[12].clone(),
            ],
        );
        assert_eq!(home_lock.program_result, ProgramResult::Success);
        accounts = merge_accounts(&accounts, &home_lock);

        let away_lock = mollusk.process_instruction(
            &lock_prediction_ix(
                fixture,
                fixture.user_away,
                fixture.away_position,
                fixture.away_token,
                OUTCOME_AWAY,
                400_000,
            ),
            &[
                accounts[1].clone(),
                accounts[2].clone(),
                accounts[4].clone(),
                accounts[6].clone(),
                accounts[7].clone(),
                accounts[9].clone(),
                accounts[10].clone(),
                accounts[11].clone(),
                accounts[12].clone(),
            ],
        );
        assert_eq!(away_lock.program_result, ProgramResult::Success);
        accounts = merge_accounts(&accounts, &away_lock);

        let non_admin = Pubkey::new_from_array([105; 32]);
        let mut non_admin_ix = resolve_pool_ix(fixture, 2, 1);
        non_admin_ix.accounts[0] = AccountMeta::new(non_admin, true);
        advance_to_settlement(&mut mollusk);
        let resolve = mollusk.process_instruction(
            &non_admin_ix,
            &[
                (non_admin, funded_system_account()),
                (fixture.config, {
                    let init_config = mollusk.process_instruction(
                        &initialize_config_ix(fixture),
                        &initialized_accounts(&mollusk, fixture),
                    );
                    account(&init_config, fixture.config)
                }),
                accounts[2].clone(),
                accounts[7].clone(),
                accounts[8].clone(),
                accounts[9].clone(),
                accounts[10].clone(),
                txline_program_account(),
                (daily_scores_pda(), empty_system_account()),
            ],
        );
        assert_eq!(resolve.program_result, ProgramResult::Success);
        accounts = merge_accounts(&accounts, &resolve);

        let claim = mollusk.process_instruction(
            &claim_winnings_ix(
                fixture,
                fixture.user_home,
                fixture.home_position,
                fixture.home_token,
            ),
            &[
                accounts[0].clone(),
                accounts[2].clone(),
                accounts[3].clone(),
                accounts[7].clone(),
                accounts[5].clone(),
                accounts[9].clone(),
                accounts[10].clone(),
            ],
        );
        assert_eq!(claim.program_result, ProgramResult::Success);
        assert_eq!(unpack_token(&claim, fixture.home_token).amount, 148_380_000);
        assert_eq!(account(&claim, fixture.home_position).data[74], 1);

        let double_claim = mollusk.process_instruction(
            &claim_winnings_ix(
                fixture,
                fixture.user_home,
                fixture.home_position,
                fixture.home_token,
            ),
            &[
                accounts[0].clone(),
                (fixture.pool, account(&claim, fixture.pool)),
                (
                    fixture.home_position,
                    account(&claim, fixture.home_position),
                ),
                (fixture.vault, account(&claim, fixture.vault)),
                (fixture.home_token, account(&claim, fixture.home_token)),
                accounts[9].clone(),
                accounts[10].clone(),
            ],
        );
        assert_ne!(double_claim.program_result, ProgramResult::Success);
    }
}
