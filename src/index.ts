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

const DEFAULT_BASE_URL = 'https://loyalty-api.bagdock.com'
const DEFAULT_FLUSH_INTERVAL = 5_000
const DEFAULT_BATCH_SIZE = 25
const DEFAULT_DEDUP_WINDOW = 500

export class BagdockAnalytics {
  private config: Required<BagdockAnalyticsConfig>
  private queue: TrackableEvent[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private recentHashes = new Map<string, number>()
  private flushing = false

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

    this.startFlushTimer()

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush())
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') this.flush()
        })
      }
      if (this.config.autoPageView) this.trackPageView()
    }
  }

  track(event: TrackableEvent): void {
    if (this.isDuplicate(event)) {
      this.log('Dedup: dropping duplicate event', event.eventType)
      return
    }

    this.queue.push({
      ...event,
      landingPage: event.landingPage || (typeof window !== 'undefined' ? window.location.href : undefined),
      referrer: event.referrer || (typeof document !== 'undefined' ? document.referrer : undefined),
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
