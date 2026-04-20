export type EventType =
  | 'click' | 'lead' | 'sale' | 'signup' | 'embed_render'
  | 'share' | 'qr_scan' | 'deep_link_open' | 'page_view'
  | 'reward_redeemed' | 'points_earned' | 'referral_completed'

export interface TrackableEvent {
  eventType: EventType
  linkId?: string
  memberId?: string
  operatorId?: string
  referralCode?: string
  valuePence?: number
  currency?: string
  landingPage?: string
  referrer?: string
  metadata?: Record<string, unknown>
}

export interface IdentifyParams {
  /** Known contact/user ID (e.g. email, contact prefixed ID) */
  contactId: string
  /** Operator slug or ID for scoping */
  operatorId?: string
  /** Extra traits to persist on the contact (name, email, etc.) */
  traits?: Record<string, unknown>
}

export interface BagdockAnalyticsConfig {
  /** API key or embed token */
  apiKey: string
  /** Base URL of the Loyalty API */
  baseUrl?: string
  /** Flush interval in ms (default: 5000) */
  flushIntervalMs?: number
  /** Max events per batch (default: 25) */
  batchSize?: number
  /** Dedup window in ms (default: 500) — identical events within this window are dropped */
  dedupWindowMs?: number
  /** Automatically track page views (default: false) */
  autoPageView?: boolean
  /** Debug logging (default: false) */
  debug?: boolean
}

export interface UTMParams {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
}

export function parseUTM(url?: string): UTMParams {
  if (typeof window === 'undefined' && !url) return {}
  try {
    const raw = url ?? (typeof window !== 'undefined' ? window.location.href : '')
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    const params = new URL(raw, base).searchParams
    const utm: UTMParams = {}
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const) {
      const val = params.get(key)
      if (val) utm[key] = val
    }
    return utm
  } catch {
    return {}
  }
}

const UTM_STORAGE_KEY = 'bagdock_utm'

function persistUTM(utm: UTMParams): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(UTM_STORAGE_KEY) || '{}')
    const existing = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as UTMParams : {}
    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify({ ...existing, ...utm }))
  } catch { /* storage unavailable */ }
}

function getPersistedUTM(): UTMParams {
  if (typeof sessionStorage === 'undefined') return {}
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(UTM_STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as UTMParams : {}
  } catch {
    return {}
  }
}

const ANON_ID_KEY = 'bagdock_anon_id'
const DEFAULT_BASE_URL = 'https://loyalty-api.bagdock.com'
const DEFAULT_FLUSH_INTERVAL = 5_000
const DEFAULT_BATCH_SIZE = 25
const DEFAULT_DEDUP_WINDOW = 500

function generateAnonId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(new RegExp(`(?:^|;)\\s*${name}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

function setCrossDomainCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return
  const hostname = typeof window !== 'undefined' ? window.location.hostname : ''
  const domain = hostname.endsWith('bagdock.com') ? '.bagdock.com' : undefined
  const maxAge = 60 * 60 * 24 * 400 // 400 days — browser upper bound
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'path=/',
    `max-age=${maxAge}`,
    'samesite=lax',
  ]
  if (domain) parts.push(`domain=${domain}`)
  if (hostname !== 'localhost') parts.push('secure')
  document.cookie = parts.join('; ')
}

function getOrCreateAnonId(): string {
  const fromCookie = getCookie(ANON_ID_KEY)
  if (fromCookie) {
    try { localStorage?.setItem(ANON_ID_KEY, fromCookie) } catch { /* noop */ }
    return fromCookie
  }
  if (typeof localStorage !== 'undefined') {
    try {
      const existing = localStorage.getItem(ANON_ID_KEY)
      if (existing) {
        setCrossDomainCookie(ANON_ID_KEY, existing)
        return existing
      }
    } catch { /* noop */ }
  }
  const id = generateAnonId()
  try { localStorage?.setItem(ANON_ID_KEY, id) } catch { /* noop */ }
  setCrossDomainCookie(ANON_ID_KEY, id)
  return id
}

export class BagdockAnalytics {
  private config: Required<BagdockAnalyticsConfig>
  private queue: TrackableEvent[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private recentHashes = new Map<string, number>()
  private flushing = false
  private utm: UTMParams = {}
  private _anonymousId: string

  constructor(config: BagdockAnalyticsConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, ''),
      flushIntervalMs: config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL,
      batchSize: config.batchSize ?? DEFAULT_BATCH_SIZE,
      dedupWindowMs: config.dedupWindowMs ?? DEFAULT_DEDUP_WINDOW,
      autoPageView: config.autoPageView ?? false,
      debug: config.debug ?? false,
    }

    this._anonymousId = typeof window !== 'undefined' ? getOrCreateAnonId() : generateAnonId()
    this.startFlushTimer()

    if (typeof window !== 'undefined') {
      const freshUTM = parseUTM()
      if (Object.keys(freshUTM).length > 0) {
        persistUTM(freshUTM)
      }
      this.utm = getPersistedUTM()

      window.addEventListener('beforeunload', () => this.flush())
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') this.flush()
        })
      }
      if (this.config.autoPageView) this.trackPageView()
    }
  }

  getUTM(): UTMParams {
    return { ...this.utm }
  }

  get anonymousId(): string {
    return this._anonymousId
  }

  /**
   * Stitch the current anonymous ID to a known contact.
   *
   * Fires a POST to the operator's identify relay endpoint so the
   * backend can upsert `contact_anonymous_ids` and attach attribution
   * data gathered before the visitor was identified.
   *
   * @param params.contactId  Known contact or user ID
   * @param params.operatorId Optional operator scope
   * @param params.traits     Extra contact traits (name, email, etc.)
   */
  async identify(params: IdentifyParams): Promise<void> {
    const payload = {
      anonymous_id: this._anonymousId,
      contact_id: params.contactId,
      operator_id: params.operatorId,
      traits: params.traits,
      utm: Object.keys(this.utm).length > 0 ? this.utm : undefined,
      landing_page: typeof window !== 'undefined' ? window.location.href : undefined,
      referrer: typeof document !== 'undefined' ? document.referrer : undefined,
    }

    this.log('identify →', payload.contact_id, payload.anonymous_id)

    try {
      const url = `${this.config.baseUrl}/api/identify`
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(payload),
        keepalive: true,
      })
    } catch (err) {
      this.log('identify error:', err)
    }
  }

  track(event: TrackableEvent): void {
    if (this.isDuplicate(event)) {
      this.log('Dedup: dropping duplicate event', event.eventType)
      return
    }

    const hasUTM = Object.keys(this.utm).length > 0
    const metadata = hasUTM
      ? { ...this.utm, ...event.metadata }
      : event.metadata

    this.queue.push({
      ...event,
      landingPage: event.landingPage || (typeof window !== 'undefined' ? window.location.href : undefined),
      referrer: event.referrer || (typeof document !== 'undefined' ? document.referrer : undefined),
      metadata,
    })

    this.log('Queued:', event.eventType, `(${this.queue.length}/${this.config.batchSize})`)

    if (this.queue.length >= this.config.batchSize) {
      this.flush()
    }
  }

  trackClick(linkId: string, referralCode?: string): void {
    this.track({ eventType: 'click', linkId, referralCode })
  }

  trackLead(params: { memberId?: string; operatorId?: string; referralCode?: string; metadata?: Record<string, unknown> }): void {
    this.track({ eventType: 'lead', ...params })
  }

  trackSale(params: { memberId?: string; operatorId?: string; valuePence: number; currency?: string; referralCode?: string }): void {
    this.track({ eventType: 'sale', ...params })
  }

  trackPageView(): void {
    this.track({ eventType: 'page_view' })
  }

  trackEmbedRender(operatorId?: string): void {
    this.track({ eventType: 'embed_render', operatorId })
  }

  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return
    this.flushing = true

    const batch = this.queue.splice(0, this.config.batchSize)
    this.log('Flushing', batch.length, 'events')

    try {
      const useBeacon = typeof navigator !== 'undefined' && 'sendBeacon' in navigator
      const url = `${this.config.baseUrl}/api/loyalty/events`

      if (useBeacon && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        for (const event of batch) {
          const payload = JSON.stringify(this.toApiPayload(event))
          navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }))
        }
      } else {
        await Promise.all(
          batch.map(event =>
            fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`,
              },
              body: JSON.stringify(this.toApiPayload(event)),
              keepalive: true,
            }).catch(err => this.log('Send failed:', err)),
          ),
        )
      }
    } catch (err) {
      this.log('Flush error, re-queuing', batch.length, 'events')
      this.queue.unshift(...batch)
    } finally {
      this.flushing = false
    }
  }

  destroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer)
    this.flush()
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private toApiPayload(event: TrackableEvent) {
    return {
      event_type: event.eventType,
      anonymous_id: this._anonymousId,
      link_id: event.linkId,
      member_id: event.memberId,
      operator_id: event.operatorId,
      referral_code: event.referralCode,
      value_pence: event.valuePence,
      currency: event.currency,
      landing_page: event.landingPage,
      referrer: event.referrer,
      metadata: event.metadata,
    }
  }

  private isDuplicate(event: TrackableEvent): boolean {
    const hash = `${event.eventType}:${event.linkId || ''}:${event.referralCode || ''}:${event.memberId || ''}`
    const now = Date.now()
    const lastSeen = this.recentHashes.get(hash)
    if (lastSeen && now - lastSeen < this.config.dedupWindowMs) return true

    this.recentHashes.set(hash, now)

    // Cleanup old entries every 50 inserts
    if (this.recentHashes.size > 200) {
      for (const [k, v] of this.recentHashes) {
        if (now - v > this.config.dedupWindowMs * 10) this.recentHashes.delete(k)
      }
    }

    return false
  }

  private startFlushTimer(): void {
    if (typeof setInterval === 'undefined') return
    this.flushTimer = setInterval(() => this.flush(), this.config.flushIntervalMs)
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) console.log('[BagdockAnalytics]', ...args)
  }
}
