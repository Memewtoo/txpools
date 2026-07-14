import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

export const openDb = (dbPath) => {
  if (dirname(dbPath) !== '.') mkdirSync(dirname(dbPath), { recursive: true })

  const db = new DatabaseSync(dbPath)
  db.exec('pragma journal_mode = WAL;')
  db.exec('pragma foreign_keys = ON;')
  db.exec(`
    create table if not exists pools (
      pool_pubkey text primary key,
      fixture_id text not null,
      admin_pubkey text not null,
      vault_pubkey text not null,
      vault_amount text not null default '0',
      close_ts text not null,
      status integer not null,
      total_locked text not null,
      outcome_home text not null,
      outcome_draw text not null,
      outcome_away text not null,
      winning_outcome integer not null,
      final_home_score integer not null,
      final_away_score integer not null,
      fee_bps integer not null,
      fee_amount text not null,
      net_payout_pool text not null,
      pool_bump integer not null,
      vault_bump integer not null,
      updated_slot integer not null,
      updated_at integer not null,
      settled_at integer
    );

    create index if not exists idx_pools_fixture_id on pools (fixture_id);
    create index if not exists idx_pools_status on pools (status);

    create table if not exists positions (
      position_pubkey text primary key,
      pool_pubkey text not null,
      user_pubkey text not null,
      outcome integer not null,
      amount text not null,
      claimed integer not null,
      bump integer not null,
      updated_slot integer not null,
      updated_at integer not null
    );

    create index if not exists idx_positions_pool on positions (pool_pubkey);
    create index if not exists idx_positions_user on positions (user_pubkey);
    create unique index if not exists idx_positions_pool_user_outcome on positions (pool_pubkey, user_pubkey, outcome);

    create table if not exists indexer_meta (
      key text primary key,
      value text not null
    );
  `)

  const poolColumns = new Set(db.prepare('pragma table_info(pools)').all().map((column) => column.name))
  if (!poolColumns.has('settled_at')) {
    db.exec('alter table pools add column settled_at integer;')
  }

  return db
}

export const upsertPool = (db, pool) => {
  db.prepare(`
    insert into pools (
      pool_pubkey, fixture_id, admin_pubkey, vault_pubkey, vault_amount,
      close_ts, status, total_locked, outcome_home, outcome_draw, outcome_away,
      winning_outcome, final_home_score, final_away_score, fee_bps, fee_amount,
      net_payout_pool, pool_bump, vault_bump, updated_slot, updated_at, settled_at
    ) values (
      @pool_pubkey, @fixture_id, @admin_pubkey, @vault_pubkey, @vault_amount,
      @close_ts, @status, @total_locked, @outcome_home, @outcome_draw, @outcome_away,
      @winning_outcome, @final_home_score, @final_away_score, @fee_bps, @fee_amount,
      @net_payout_pool, @pool_bump, @vault_bump, @updated_slot, @updated_at, @settled_at
    )
    on conflict(pool_pubkey) do update set
      fixture_id = excluded.fixture_id,
      admin_pubkey = excluded.admin_pubkey,
      vault_pubkey = excluded.vault_pubkey,
      vault_amount = excluded.vault_amount,
      close_ts = excluded.close_ts,
      status = excluded.status,
      total_locked = excluded.total_locked,
      outcome_home = excluded.outcome_home,
      outcome_draw = excluded.outcome_draw,
      outcome_away = excluded.outcome_away,
      winning_outcome = excluded.winning_outcome,
      final_home_score = excluded.final_home_score,
      final_away_score = excluded.final_away_score,
      fee_bps = excluded.fee_bps,
      fee_amount = excluded.fee_amount,
      net_payout_pool = excluded.net_payout_pool,
      pool_bump = excluded.pool_bump,
      vault_bump = excluded.vault_bump,
      updated_slot = excluded.updated_slot,
      updated_at = excluded.updated_at,
      -- Preserve the first observed settlement time across later polls.
      settled_at = case
        when pools.settled_at is not null then pools.settled_at
        when pools.status = 0 and excluded.status in (1, 2) then coalesce(excluded.settled_at, excluded.updated_at)
        when excluded.status in (1, 2) then excluded.settled_at
        else null
      end
  `).run(pool)
}

export const upsertPosition = (db, position) => {
  db.prepare(`
    insert into positions (
      position_pubkey, pool_pubkey, user_pubkey, outcome, amount, claimed,
      bump, updated_slot, updated_at
    ) values (
      @position_pubkey, @pool_pubkey, @user_pubkey, @outcome, @amount, @claimed,
      @bump, @updated_slot, @updated_at
    )
    on conflict(position_pubkey) do update set
      pool_pubkey = excluded.pool_pubkey,
      user_pubkey = excluded.user_pubkey,
      outcome = excluded.outcome,
      amount = excluded.amount,
      claimed = excluded.claimed,
      bump = excluded.bump,
      updated_slot = excluded.updated_slot,
      updated_at = excluded.updated_at
  `).run(position)
}

export const setMeta = (db, key, value) => {
  db.prepare(`
    insert into indexer_meta (key, value) values (?, ?)
    on conflict(key) do update set value = excluded.value
  `).run(key, String(value))
}

export const getMetaRows = (db) => db.prepare('select key, value from indexer_meta order by key').all()
