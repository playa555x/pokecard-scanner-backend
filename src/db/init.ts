import { join } from 'path'
import { mkdirSync } from 'fs'

// Use bun:sqlite for native Bun SQLite support (no extra dependency needed)
import { Database } from 'bun:sqlite'

let db: Database

export function getDb(): Database {
  if (!db) {
    const dataDir = join(import.meta.dir, '../../data')
    mkdirSync(dataDir, { recursive: true })

    db = new Database(join(dataDir, 'pokecard.db'))
    db.run('PRAGMA journal_mode = WAL')
    db.run('PRAGMA foreign_keys = ON')
  }
  return db
}

export async function initDatabase(): Promise<void> {
  const db = getDb()

  db.run(`
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      number TEXT NOT NULL,
      set_name TEXT NOT NULL,
      set_id TEXT NOT NULL,
      rarity TEXT NOT NULL,
      image_url TEXT NOT NULL,
      image_url_hi_res TEXT NOT NULL,
      types TEXT NOT NULL DEFAULT '[]',
      phash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS price_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id TEXT NOT NULL REFERENCES cards(id),
      snapshot_date TEXT NOT NULL DEFAULT (date('now')),
      tcg_low REAL,
      tcg_mid REAL,
      tcg_high REAL,
      tcg_market REAL,
      tcg_reverse_holo_market REAL,
      tcg_holofoil_market REAL,
      cm_avg_sell REAL,
      cm_low REAL,
      cm_trend REAL,
      cm_avg1 REAL,
      cm_avg7 REAL,
      cm_avg30 REAL,
      cm_reverse_holo_trend REAL,
      UNIQUE(card_id, snapshot_date)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS collection (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id TEXT NOT NULL REFERENCES cards(id),
      quantity INTEGER NOT NULL DEFAULT 1,
      condition TEXT NOT NULL DEFAULT 'NM',
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(card_id, condition)
    )
  `)

  db.run(`CREATE INDEX IF NOT EXISTS idx_price_snapshots_card ON price_snapshots(card_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_price_snapshots_date ON price_snapshots(snapshot_date)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_cards_phash ON cards(phash)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name)`)

  console.log('Database initialized')
}
