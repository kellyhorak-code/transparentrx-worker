import { Router } from 'itty-router'
import { checkoutHandler, webhookHandler } from './checkout'

const router = Router()

router.post('/api/checkout', (req, env) => checkoutHandler(req, env))
router.post('/api/webhook', (req, env) => webhookHandler(req, env))

export default {
  fetch: (request, env, ctx) => router.handle(request, env, ctx)
}
