import cron from 'node-cron'
import { getDb } from '../db/init'
import { getCardById, extractTCGMarketPrice } from '../services/pokemon_api'

/**
 * Daily price tracker — runs at 06:00 every day
 * Fetches fresh prices from pokemontcg.io and stores them as snapshots.
 * Over time, this builds a full price history database — for free.
 */
export function startPriceCron(): void {
  cron.schedule('0 6 * * *', async () => {
    console.log('[PriceCron] Starting daily price snapshot...')
    await runPriceSnapshot()
  })

  console.log('[PriceCron] Scheduled daily at 06:00')
}

export async function runPriceSnapshot(): Promise<void> {
  const db = getDb()

  // Get all tracked cards from collection + recently scanned
  const cards = db.prepare(`
    SELECT DISTINCT c.id
    FROM cards c
    LEFT JOIN collection col ON c.id = col.card_id
    ORDER BY c.created_at DESC
    LIMIT 500
  `).all() as { id: string }[]

  if (cards.length === 0) {
    console.log('[PriceCron] No cards to track.')
    return
  }

  const insert = db.prepare(`
    INSERT OR REPLACE INTO price_snapshots (
      card_id, snapshot_date,
      tcg_low, tcg_mid, tcg_high, tcg_market,
      tcg_reverse_holo_market, tcg_holofoil_market,
      cm_avg_sell, cm_low, cm_trend,
      cm_avg1, cm_avg7, cm_avg30, cm_reverse_holo_trend
    ) VALUES (
      ?, date('now'),
      ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?
    )
  `)

  let updated = 0
  let failed = 0

  for (const { id } of cards) {
    try {
      const card = await getCardById(id)
      const tcg = card.tcgplayer?.prices
      const cm = card.cardmarket?.prices

      const tcgNormal = tcg?.normal
      const tcgHolo = tcg?.holofoil
      const tcgReverse = tcg?.reverseHolofoil

      insert.run(
        id,
        tcgNormal?.low ?? null,
        tcgNormal?.mid ?? null,
        tcgNormal?.high ?? null,
        extractTCGMarketPrice(card),
        tcgReverse?.market ?? null,
        tcgHolo?.market ?? null,
        cm?.averageSellPrice ?? null,
        cm?.lowPrice ?? null,
        cm?.trendPrice ?? null,
        cm?.avg1 ?? null,
        cm?.avg7 ?? null,
        cm?.avg30 ?? null,
        cm?.reverseHoloTrend ?? null,
      )

      updated++

      // Rate limit: pokemontcg.io allows 20k req/day with free key
      // At 100ms delay, 500 cards = 50 seconds — well within limits
      await new Promise(r => setTimeout(r, 100))
    } catch (err) {
      console.error(`[PriceCron] Failed for ${id}:`, err)
      failed++
    }
  }

  console.log(`[PriceCron] Done. Updated: ${updated}, Failed: ${failed}`)
}

/**
 * Calculate price trend for a card based on stored snapshots
 * Returns percent change over the given number of days
 */
export function calculateTrend(cardId: string, days = 30): {
  percent: number
  direction: 'up' | 'down' | 'stable'
  history: Array<{ date: string; tcgMarket: number; cmTrend: number }>
} {
  const db = getDb()

  const rows = db.prepare(`
    SELECT snapshot_date as date, tcg_market, cm_trend
    FROM price_snapshots
    WHERE card_id = ?
      AND snapshot_date >= date('now', '-${days} days')
      AND tcg_market IS NOT NULL
    ORDER BY snapshot_date ASC
  `).all(cardId) as Array<{
    date: string
    tcg_market: number
    cm_trend: number
  }>

  if (rows.length < 2) {
    return { percent: 0, direction: 'stable', history: [] }
  }

  const oldest = rows[0].tcg_market
  const newest = rows[rows.length - 1].tcg_market
  const percent = ((newest - oldest) / oldest) * 100

  return {
    percent,
    direction: percent > 3 ? 'up' : percent < -3 ? 'down' : 'stable',
    history: rows.map(r => ({
      date: r.date,
      tcgMarket: r.tcg_market,
      cmTrend: r.cm_trend,
    })),
  }
}
