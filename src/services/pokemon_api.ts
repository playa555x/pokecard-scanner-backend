/**
 * pokemontcg.io API service
 * Free API with kostenlosem Key (20,000 req/day)
 * Get your free key at: https://pokemontcg.io/
 */

const BASE_URL = 'https://api.pokemontcg.io/v2'
const API_KEY = process.env.POKEMON_TCG_API_KEY ?? ''

// Simple in-memory cache to reduce API calls (24h TTL)
const cache = new Map<string, { data: unknown; expiresAt: number }>()

async function fetchWithCache<T>(url: string, cacheKey: string): Promise<T> {
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (API_KEY) headers['X-Api-Key'] = API_KEY

  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Pokemon TCG API error: ${res.status}`)

  const data = await res.json() as T
  cache.set(cacheKey, { data, expiresAt: Date.now() + 24 * 60 * 60 * 1000 })
  return data
}

export interface PokemonTCGCard {
  id: string
  name: string
  number: string
  set: {
    id: string
    name: string
  }
  rarity: string
  images: {
    small: string
    large: string
  }
  types?: string[]
  tcgplayer?: {
    updatedAt: string
    prices?: {
      normal?: TCGPrice
      holofoil?: TCGPrice
      reverseHolofoil?: TCGPrice
      '1stEditionHolofoil'?: TCGPrice
    }
  }
  cardmarket?: {
    updatedAt: string
    prices?: {
      averageSellPrice?: number
      lowPrice?: number
      trendPrice?: number
      avg1?: number
      avg7?: number
      avg30?: number
      reverseHoloTrend?: number
      reverseHoloSell?: number
    }
  }
}

interface TCGPrice {
  low?: number
  mid?: number
  high?: number
  market?: number
  directLow?: number
}

export async function getCardById(id: string): Promise<PokemonTCGCard> {
  const data = await fetchWithCache<{ data: PokemonTCGCard }>(
    `${BASE_URL}/cards/${id}`,
    `card:${id}`
  )
  return data.data
}

export async function searchCards(query: string, limit = 20): Promise<PokemonTCGCard[]> {
  const encoded = encodeURIComponent(`name:"${query}"`)
  const data = await fetchWithCache<{ data: PokemonTCGCard[] }>(
    `${BASE_URL}/cards?q=${encoded}&pageSize=${limit}&orderBy=-set.releaseDate`,
    `search:${query}:${limit}`
  )
  return data.data
}

export async function getTrendingCards(limit = 20): Promise<PokemonTCGCard[]> {
  // Get popular/recent high-value cards
  // We fetch recent popular sets and return cards with prices
  const data = await fetchWithCache<{ data: PokemonTCGCard[] }>(
    `${BASE_URL}/cards?q=rarity:"Special Illustration Rare" OR rarity:"Hyper Rare"&pageSize=${limit}&orderBy=-set.releaseDate`,
    `trending:${limit}`
  )
  return data.data
}

export async function getAllCardsForSet(setId: string): Promise<PokemonTCGCard[]> {
  const data = await fetchWithCache<{ data: PokemonTCGCard[] }>(
    `${BASE_URL}/cards?q=set.id:${setId}&pageSize=250`,
    `set:${setId}`
  )
  return data.data
}

/**
 * Extract the best available price from a card
 */
export function extractTCGMarketPrice(card: PokemonTCGCard): number | null {
  const prices = card.tcgplayer?.prices
  if (!prices) return null
  return prices.holofoil?.market
    ?? prices.normal?.market
    ?? prices.reverseHolofoil?.market
    ?? prices['1stEditionHolofoil']?.market
    ?? null
}
