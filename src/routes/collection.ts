import { Hono } from 'hono'
import { getDb } from '../db/init'

export const collectionRoutes = new Hono()

// GET /api/collection
collectionRoutes.get('/', async (c) => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT c.*, col.quantity, col.condition, col.added_at,
      (SELECT tcg_market FROM price_snapshots
       WHERE card_id = c.id ORDER BY snapshot_date DESC LIMIT 1) as tcg_market
    FROM collection col
    JOIN cards c ON col.card_id = c.id
    ORDER BY col.added_at DESC
  `).all() as Array<{
    id: string; name: string; number: string; set_name: string; set_id: string
    rarity: string; image_url: string; image_url_hi_res: string; types: string
    quantity: number; condition: string; tcg_market: number | null
  }>

  return c.json(rows.map(r => ({
    id: r.id,
    name: r.name,
    number: r.number,
    set: r.set_name,
    setId: r.set_id,
    rarity: r.rarity,
    imageUrl: r.image_url,
    imageUrlHiRes: r.image_url_hi_res,
    types: JSON.parse(r.types),
    quantity: r.quantity,
    condition: r.condition,
    prices: r.tcg_market ? {
      tcgplayer: { market: r.tcg_market },
      cardmarket: null,
      history: [],
    } : null,
  })))
})

// POST /api/collection — add card to collection
collectionRoutes.post('/', async (c) => {
  const body = await c.req.json() as {
    cardId: string
    quantity?: number
    condition?: string
  }

  if (!body.cardId) return c.json({ error: 'cardId required' }, 400)

  const db = getDb()
  db.prepare(`
    INSERT INTO collection (card_id, quantity, condition)
    VALUES (?, ?, ?)
    ON CONFLICT(card_id, condition) DO UPDATE SET quantity = quantity + excluded.quantity
  `).run(
    body.cardId,
    body.quantity ?? 1,
    body.condition ?? 'NM'
  )

  return c.json({ success: true })
})

// DELETE /api/collection/:cardId
collectionRoutes.delete('/:cardId', async (c) => {
  const cardId = c.req.param('cardId')
  const db = getDb()
  db.prepare('DELETE FROM collection WHERE card_id = ?').run(cardId)
  return c.json({ success: true })
})
