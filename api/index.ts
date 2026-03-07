import { handle } from 'hono/vercel'
import { createApp } from '../server/index'

// On Vercel, skip meta injection for browsers to avoid serverless latency
const app = createApp({ skipBrowsers: true })

export default handle(app)
