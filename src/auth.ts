// auth.ts — TransparentRx Authentication + Abuse Prevention
// Handles: magic link flow, session cookies, fingerprint/IP gating, Stripe portal

// ─────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  'https://transparentrx.io',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'true',
}

function json(data: any, status = 200, extra: Record<string,string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extra },
  })
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
}

function randomHex(bytes = 32): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('')
}

function parseCookies(req: Request): Record<string,string> {
  const raw = req.headers.get('Cookie') || ''
  return Object.fromEntries(raw.split(';').map(c => c.trim().split('=').map(decodeURIComponent)))
}

function sessionCookie(token: string, maxAge = 60 * 60 * 24 * 30): string {
  return `trx_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`
}

function clearCookie(): string {
  return `trx_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
}

// ─────────────────────────────────────────────────────────
//  SESSION RESOLUTION — call this at the top of gated routes
//  Returns user row or null
// ─────────────────────────────────────────────────────────

export async function resolveSession(req: Request, env: any): Promise<any | null> {
  const cookies = parseCookies(req)
  const token   = cookies['trx_session']
  if (!token) return null

  const session = await env.DB.prepare(`
    SELECT email FROM sessions
    WHERE token = ? AND type = 'session' AND used = 0
      AND expires_at > datetime('now')
  `).bind(token).first()

  if (!session) return null

  const user = await env.DB.prepare(`
    SELECT * FROM users WHERE email = ?
  `).bind(session.email).first()

  return user || null
}


// ─────────────────────────────────────────────────────────
//  POST /api/auth/request-link
//  Body: { email }
//  Sends a magic link. Rate limited to 3 emails per address per hour.
// ─────────────────────────────────────────────────────────

export async function requestMagicLink(req: Request, env: any): Promise<Response> {
  try {
    const { email } = await req.json() as any
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Invalid email address.' }, 400)
    }

    const lowerEmail = email.toLowerCase().trim()
    const ip         = req.headers.get('CF-Connecting-IP') || 'unknown'
    const ipHash     = await sha256(ip + env.HASH_SALT)

    // Rate limit — max 3 magic links per email per hour
    const recentSends = await env.DB.prepare(`
      SELECT COUNT(*) AS n FROM email_sends
      WHERE email = ? AND sent_at > datetime('now', '-1 hour')
    `).bind(lowerEmail).first() as any

    if (recentSends?.n >= 3) {
      return json({ error: 'Too many requests. Please wait before requesting another link.' }, 429)
    }

    // Create magic link token (expires 15 minutes)
    const token    = randomHex(32)
    const expires  = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO sessions (token, email, type, expires_at, used)
        VALUES (?, ?, 'magic_link', ?, 0)
      `).bind(token, lowerEmail, expires),
      env.DB.prepare(`
        INSERT INTO email_sends (email, ip_hash) VALUES (?, ?)
      `).bind(lowerEmail, ipHash),
    ])

    // Upsert user record (creates if new)
    await env.DB.prepare(`
      INSERT OR IGNORE INTO users (email) VALUES (?)
    `).bind(lowerEmail).run()

    // Send email via Resend
    const magicUrl = `https://transparentrx.io/?magic=${token}`
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'TransparentRx <noreply@transparentrx.io>',
        to:      lowerEmail,
        subject: 'Your TransparentRx sign-in link',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#000;color:#fff;padding:2rem;border-radius:16px;">
            <h2 style="color:#4CFC0F;margin-bottom:1rem;">Sign in to TransparentRx</h2>
            <p style="color:#aaa;margin-bottom:2rem;line-height:1.6;">
              Click the button below to sign in. This link expires in 15 minutes and can only be used once.
            </p>
            <a href="${magicUrl}" style="display:inline-block;padding:.9rem 2rem;background:#4CFC0F;color:#000;border-radius:60px;font-weight:700;text-decoration:none;font-size:1rem;">
              Sign In to TransparentRx →
            </a>
            <p style="color:#333;font-size:.75rem;margin-top:2rem;">
              If you didn't request this, you can safely ignore it.<br>
              Fort Worth, TX · transparentrx.io
            </p>
          </div>
        `,
      }),
    })

    return json({ success: true, message: 'Check your email for the sign-in link.' })

  } catch (e: any) {
    return json({ error: e.message }, 500)
  }
}


// ─────────────────────────────────────────────────────────
//  GET /api/auth/verify?token=
//  Validates magic link → issues session cookie → redirects
// ─────────────────────────────────────────────────────────

export async function verifyMagicLink(req: Request, env: any): Promise<Response> {
  try {
    const url   = new URL(req.url)
    const token = url.searchParams.get('token') || ''

    if (!token) return Response.redirect('https://transparentrx.io/?auth=invalid', 302)

    const magic = await env.DB.prepare(`
      SELECT email FROM sessions
      WHERE token = ? AND type = 'magic_link' AND used = 0
        AND expires_at > datetime('now')
    `).bind(token).first() as any

    if (!magic) {
      return Response.redirect('https://transparentrx.io/?auth=expired', 302)
    }

    // Mark magic link as used
    await env.DB.prepare(`
      UPDATE sessions SET used = 1 WHERE token = ?
    `).bind(token).run()

    // Issue session token (30 days)
    const sessionToken   = randomHex(32)
    const sessionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    await env.DB.prepare(`
      INSERT INTO sessions (token, email, type, expires_at, used)
      VALUES (?, ?, 'session', ?, 0)
    `).bind(sessionToken, magic.email, sessionExpires).run()

    // Redirect with session cookie
    return new Response(null, {
      status: 302,
      headers: {
        'Location':   'https://transparentrx.io/?auth=success',
        'Set-Cookie': sessionCookie(sessionToken),
      },
    })

  } catch (e: any) {
    return Response.redirect('https://transparentrx.io/?auth=error', 302)
  }
}


// ─────────────────────────────────────────────────────────
//  GET /api/auth/session
//  Returns current user state. Called on every page load.
// ─────────────────────────────────────────────────────────

export async function getSession(req: Request, env: any): Promise<Response> {
  const user = await resolveSession(req, env)
  if (!user) return json({ authenticated: false, status: 'guest' })
  return json({
    authenticated: true,
    email:      user.email,
    plan:       user.plan,
    status:     user.status,
    demo_used:  user.demo_used === 1,
    isPremium:  user.status === 'active',
  })
}


// ─────────────────────────────────────────────────────────
//  POST /api/auth/logout
// ─────────────────────────────────────────────────────────

export async function logout(req: Request, env: any): Promise<Response> {
  const cookies = parseCookies(req)
  const token   = cookies['trx_session']
  if (token) {
    await env.DB.prepare(`UPDATE sessions SET used = 1 WHERE token = ?`).bind(token).run()
  }
  return json({ success: true }, 200, { 'Set-Cookie': clearCookie() })
}


// ─────────────────────────────────────────────────────────
//  POST /api/check-usage
//  Body: { fingerprint: string }
//  Server combines fingerprint + CF IP to gate free usage
//  Returns: { allowed: bool, reason?, requiresEmail?: bool }
// ─────────────────────────────────────────────────────────

export async function checkUsage(req: Request, env: any): Promise<Response> {
  try {
    // Check session first — authenticated users bypass fingerprint check
    const user = await resolveSession(req, env)
    if (user) {
      if (user.status === 'active') return json({ allowed: true, isPremium: true })
      if (user.demo_used === 0)     return json({ allowed: true, isPremium: false, userId: user.email })
      return json({ allowed: false, reason: 'demo_used', requiresEmail: false, email: user.email })
    }

    const { fingerprint } = await req.json() as any
    const ip              = req.headers.get('CF-Connecting-IP') || 'unknown'
    const fpHash          = fingerprint ? await sha256(fingerprint + (env.HASH_SALT || '')) : null
    const ipHash          = await sha256(ip + (env.HASH_SALT || ''))

    // Check fingerprint
    if (fpHash) {
      const fpRow = await env.DB.prepare(`
        SELECT email FROM free_usage WHERE signal_type = 'fingerprint' AND signal_value = ?
      `).bind(fpHash).first() as any
      if (fpRow) return json({ allowed: false, reason: 'fingerprint', requiresEmail: true })
    }

    // Check IP (separate gate — catches incognito on same network)
    const ipRow = await env.DB.prepare(`
      SELECT used_at FROM free_usage WHERE signal_type = 'ip' AND signal_value = ?
    `).bind(ipHash).first() as any

    if (ipRow) {
      // IP seen before but fingerprint is clean — soft gate (different device scenario)
      return json({ allowed: false, reason: 'ip', requiresEmail: true })
    }

    // All clean — return tokens so client can confirm after analysis runs
    return json({ allowed: true, isPremium: false, fpHash, ipHash })

  } catch (e: any) {
    // Fail open — don't block legitimate users on errors
    return json({ allowed: true, isPremium: false })
  }
}


// ─────────────────────────────────────────────────────────
//  POST /api/confirm-usage
//  Called AFTER analysis completes successfully
//  Body: { fpHash, ipHash }
//  Marks the usage signals in D1
// ─────────────────────────────────────────────────────────

export async function confirmUsage(req: Request, env: any): Promise<Response> {
  try {
    const { fpHash, ipHash, email } = await req.json() as any
    const ops = []

    if (fpHash) {
      ops.push(env.DB.prepare(`
        INSERT OR IGNORE INTO free_usage (signal_type, signal_value, email)
        VALUES ('fingerprint', ?, ?)
      `).bind(fpHash, email || null))
    }

    if (ipHash) {
      ops.push(env.DB.prepare(`
        INSERT OR IGNORE INTO free_usage (signal_type, signal_value, email)
        VALUES ('ip', ?, ?)
      `).bind(ipHash, email || null))
    }

    // If user is logged in, mark demo_used on their account too
    const user = await resolveSession(req, env)
    if (user) {
      ops.push(env.DB.prepare(`
        UPDATE users SET demo_used = 1, updated_at = datetime('now') WHERE email = ?
      `).bind(user.email))
    }

    if (ops.length) await env.DB.batch(ops)

    return json({ success: true })
  } catch (e: any) {
    return json({ success: false })
  }
}


// ─────────────────────────────────────────────────────────
//  POST /api/auth/email-gate
//  Body: { email, fpHash, ipHash }
//  Called when blocked user submits email in the gate
//  If paid subscriber → unlock. Otherwise → send magic link.
// ─────────────────────────────────────────────────────────

export async function emailGate(req: Request, env: any): Promise<Response> {
  try {
    const { email, fpHash, ipHash } = await req.json() as any
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Invalid email.' }, 400)
    }

    const lowerEmail = email.toLowerCase().trim()

    // Check if this email is a paid subscriber
    const user = await env.DB.prepare(`
      SELECT status, plan, demo_used FROM users WHERE email = ?
    `).bind(lowerEmail).first() as any

    if (user?.status === 'active') {
      // Paid subscriber — log their signals and let them run
      await env.DB.batch([
        ...(fpHash ? [env.DB.prepare(`INSERT OR REPLACE INTO free_usage (signal_type, signal_value, email) VALUES ('fingerprint', ?, ?)`).bind(fpHash, lowerEmail)] : []),
        ...(ipHash ? [env.DB.prepare(`INSERT OR REPLACE INTO free_usage (signal_type, signal_value, email) VALUES ('ip', ?, ?)`).bind(ipHash, lowerEmail)] : []),
      ])
      // Send them a sign-in link too so they get a proper session
      return requestMagicLink(new Request(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify({ email: lowerEmail }),
      }), env).then(() => json({ action: 'unlocked', message: "You're a TransDex™ subscriber — a sign-in link is on its way." }))
    }

    // Not a subscriber — create user record if needed, send upgrade link
    await env.DB.prepare(`
      INSERT OR IGNORE INTO users (email, demo_used) VALUES (?, 1)
    `).bind(lowerEmail).run()

    // Log signals with email so we can track conversion later
    const ops = []
    if (fpHash) ops.push(env.DB.prepare(`INSERT OR REPLACE INTO free_usage (signal_type, signal_value, email) VALUES ('fingerprint', ?, ?)`).bind(fpHash, lowerEmail))
    if (ipHash) ops.push(env.DB.prepare(`INSERT OR REPLACE INTO free_usage (signal_type, signal_value, email) VALUES ('ip', ?, ?)`).bind(ipHash, lowerEmail))
    if (ops.length) await env.DB.batch(ops)

    return json({ action: 'upgrade', message: 'Start your TransDex™ plan to run unlimited analyses.' })

  } catch (e: any) {
    return json({ error: e.message }, 500)
  }
}


// ─────────────────────────────────────────────────────────
//  POST /api/portal
//  Creates a Stripe billing portal session for the current user
// ─────────────────────────────────────────────────────────

export async function stripePortal(req: Request, env: any): Promise<Response> {
  const user = await resolveSession(req, env)
  if (!user) return json({ error: 'Not authenticated' }, 401)
  if (!user.stripe_customer_id) return json({ error: 'No subscription on file' }, 400)

  try {
    const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer:   user.stripe_customer_id,
        return_url: 'https://transparentrx.io/',
      }),
    })
    const portal = await res.json() as any
    if (!portal.url) throw new Error(portal.error?.message || 'Portal URL not returned')
    return json({ url: portal.url })
  } catch (e: any) {
    return json({ error: e.message }, 500)
  }
}