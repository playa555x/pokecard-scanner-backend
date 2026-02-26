import { Hono } from 'hono'
import { getDb } from '../db/init'

export const scanRoutes = new Hono()

/**
 * POST /api/scan/phash
 * Accepts a card image, computes a perceptual hash, and finds the closest match.
 * Uses Bun's native image decoding + custom pHash implementation (no extra deps).
 */
scanRoutes.post('/phash', async (c) => {
  try {
    const formData = await c.req.formData()
    const imageFile = formData.get('image') as File | null

    if (!imageFile) {
      return c.json({ error: 'No image provided' }, 400)
    }

    const imageBuffer = Buffer.from(await imageFile.arrayBuffer())
    const sharp = (await import('sharp')).default

    // Resize to 32x32 grayscale for pHash computation
    const { data } = await sharp(imageBuffer)
      .resize(32, 32, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const hash = computePHash(data)

    // Find closest match in DB
    const db = getDb()
    const cards = db.prepare('SELECT id, phash FROM cards WHERE phash IS NOT NULL').all() as {
      id: string
      phash: string
    }[]

    if (cards.length === 0) {
      return c.json({ confidence: 0, card: null })
    }

    let bestMatch: { id: string; distance: number } | null = null

    for (const card of cards) {
      const distance = hammingDistance(hash, card.phash)
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { id: card.id, distance }
      }
    }

    // Distance threshold: < 10 = good match, 10-20 = possible match
    const confidence = bestMatch ? Math.max(0, 1 - bestMatch.distance / 25) : 0

    if (!bestMatch || confidence < 0.8) {
      return c.json({ confidence, card: null })
    }

    const cardRow = db.prepare('SELECT * FROM cards WHERE id = ?').get(bestMatch.id) as {
      id: string; name: string; number: string; set_name: string; set_id: string
      rarity: string; image_url: string; image_url_hi_res: string; types: string
    } | null

    if (!cardRow) return c.json({ confidence: 0, card: null })

    return c.json({
      confidence,
      card: {
        id: cardRow.id,
        name: cardRow.name,
        number: cardRow.number,
        set: cardRow.set_name,
        setId: cardRow.set_id,
        rarity: cardRow.rarity,
        imageUrl: cardRow.image_url,
        imageUrlHiRes: cardRow.image_url_hi_res,
        types: JSON.parse(cardRow.types),
      },
    })
  } catch (err) {
    console.error('[Scan] pHash error:', err)
    return c.json({ error: 'Scan failed' }, 500)
  }
})

/**
 * Compute a 64-bit perceptual hash from a 32x32 grayscale pixel buffer.
 * Based on the average hash (aHash) algorithm — fast and reliable for card matching.
 */
function computePHash(pixels: Buffer): string {
  // Downsample to 8x8 by averaging 4x4 blocks
  const size = 8
  const blockSize = 4 // 32 / 8
  const values: number[] = []

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      let sum = 0
      for (let r = 0; r < blockSize; r++) {
        for (let c = 0; c < blockSize; c++) {
          const idx = (row * blockSize + r) * 32 + (col * blockSize + c)
          sum += pixels[idx]
        }
      }
      values.push(sum / (blockSize * blockSize))
    }
  }

  // Compute mean
  const mean = values.reduce((a, b) => a + b, 0) / values.length

  // Build hash: 1 if above mean, 0 if below
  const bits = values.map(v => (v >= mean ? 1 : 0))

  // Convert to hex string
  let hash = ''
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]
    hash += nibble.toString(16)
  }

  return hash
}

function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) return 64
  let distance = 0
  for (let i = 0; i < hash1.length; i++) {
    const b1 = parseInt(hash1[i], 16)
    const b2 = parseInt(hash2[i], 16)
    const xor = b1 ^ b2
    // Count set bits
    let n = xor
    while (n) {
      distance += n & 1
      n >>= 1
    }
  }
  return distance
}
