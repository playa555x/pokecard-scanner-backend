import { Hono } from 'hono'
import { getDb } from '../db/init'
import { getCardById, searchCards } from '../services/pokemon_api'
import { calculateTrend } from '../cron/price_tracker'

export const cardRoutes = new Hono()

// GET /api/cards/:id — full card details with price history
cardRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const db = getDb()

  try {
    // Fetch from pokemontcg.io (cached)
    const apiCard = await getCardById(id)

    // Get price history from our local DB
    const trend = calculateTrend(id, 90)

    // Save card to local DB if not exists
    db.prepare(`
      INSERT OR IGNORE INTO cards (id, name, number, set_name, set_id, rarity, image_url, image_url_hi_res, types)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      apiCard.id,
      apiCard.name,
      apiCard.number,
      apiCard.set.name,
      apiCard.set.id,
      apiCard.rarity ?? 'Unknown',
      apiCard.images.small,
      apiCard.images.large,
      JSON.stringify(apiCard.types ?? [])
    )

    const tcg = apiCard.tcgplayer?.prices
    const cm = apiCard.cardmarket?.prices

    return c.json({
      id: apiCard.id,
      name: apiCard.name,
      number: apiCard.number,
      set: apiCard.set.name,
      setId: apiCard.set.id,
      rarity: apiCard.rarity ?? 'Unknown',
      imageUrl: apiCard.images.small,
      imageUrlHiRes: apiCard.images.large,
      types: apiCard.types ?? [],
      prices: {
        tcgplayer: tcg ? {
          low: tcg.normal?.low ?? tcg.holofoil?.low,
          mid: tcg.normal?.mid ?? tcg.holofoil?.mid,
          high: tcg.normal?.high ?? tcg.holofoil?.high,
          market: tcg.holofoil?.market ?? tcg.normal?.market ?? tcg.reverseHolofoil?.market,
          reverseHoloMarket: tcg.reverseHolofoil?.market,
          holofoilMarket: tcg.holofoil?.market,
          updatedAt: apiCard.tcgplayer?.updatedAt,
        } : null,
        cardmarket: cm ? {
          averageSellPrice: cm.averageSellPrice,
          lowPrice: cm.lowPrice,
          trendPrice: cm.trendPrice,
          avg1: cm.avg1,
          avg7: cm.avg7,
          avg30: cm.avg30,
          reverseHoloTrend: cm.reverseHoloTrend,
          updatedAt: apiCard.cardmarket?.updatedAt,
        } : null,
        history: trend.history.map(h => ({
          date: h.date,
          tcgMarket: h.tcgMarket,
          cmTrend: h.cmTrend,
        })),
      },
    })
  } catch (err) {
    return c.json({ error: 'Card not found' }, 404)
  }
})

// GET /api/cards/search?q=charizard&limit=20
cardRoutes.get('/search', async (c) => {
  const query = c.req.query('q') ?? ''
  const limit = parseInt(c.req.query('limit') ?? '20')

  if (!query || query.length < 2) {
    return c.json([])
  }

  try {
    const cards = await searchCards(query, Math.min(limit, 50))
    return c.json(cards.map(card => ({
      id: card.id,
      name: card.name,
      number: card.number,
      set: card.set.name,
      setId: card.set.id,
      rarity: card.rarity ?? 'Unknown',
      imageUrl: card.images.small,
      imageUrlHiRes: card.images.large,
      types: card.types ?? [],
    })))
  } catch (err) {
    return c.json({ error: 'Search failed' }, 500)
  }
})
