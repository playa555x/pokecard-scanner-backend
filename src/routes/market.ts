import { Hono } from 'hono'
import { getTrendingCards, extractTCGMarketPrice } from '../services/pokemon_api'
import { calculateTrend } from '../cron/price_tracker'

export const marketRoutes = new Hono()

// GET /api/market/trending
marketRoutes.get('/trending', async (c) => {
  try {
    const cards = await getTrendingCards(30)

    const results = await Promise.all(
      cards.map(async (card) => {
        const trend = calculateTrend(card.id, 30)
        const tcg = card.tcgplayer?.prices
        const cm = card.cardmarket?.prices

        return {
          id: card.id,
          name: card.name,
          number: card.number,
          set: card.set.name,
          setId: card.set.id,
          rarity: card.rarity ?? 'Unknown',
          imageUrl: card.images.small,
          imageUrlHiRes: card.images.large,
          types: card.types ?? [],
          prices: {
            tcgplayer: {
              market: extractTCGMarketPrice(card),
              low: tcg?.normal?.low ?? tcg?.holofoil?.low,
            },
            cardmarket: cm ? {
              trendPrice: cm.trendPrice,
              avg7: cm.avg7,
            } : null,
            history: trend.history.map(h => ({
              date: h.date,
              tcgMarket: h.tcgMarket,
              cmTrend: h.cmTrend,
            })),
          },
        }
      })
    )

    // Sort by trend percent (biggest gainers first)
    results.sort((a, b) => {
      const tA = calculateTrend(a.id, 7).percent
      const tB = calculateTrend(b.id, 7).percent
      return tB - tA
    })

    return c.json(results)
  } catch (err) {
    console.error('[Market] trending error:', err)
    return c.json({ error: 'Failed to fetch market data' }, 500)
  }
})
