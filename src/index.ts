import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { cardRoutes } from './routes/cards'
import { scanRoutes } from './routes/scan'
import { collectionRoutes } from './routes/collection'
import { marketRoutes } from './routes/market'
import { initDatabase } from './db/init'
import { startPriceCron } from './cron/price_tracker'

const app = new Hono()

// Middleware
app.use('*', cors())
app.use('*', logger())

// Routes
app.route('/api/cards', cardRoutes)
app.route('/api/scan', scanRoutes)
app.route('/api/collection', collectionRoutes)
app.route('/api/market', marketRoutes)

app.get('/health', (c) => c.json({ status: 'ok', ts: new Date().toISOString() }))

// Init
await initDatabase()
startPriceCron()

const port = parseInt(process.env.PORT ?? '3000')
console.log(`PokéScan backend running on port ${port}`)

export default {
  port,
  fetch: app.fetch,
}
