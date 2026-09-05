import type { RequestHandler } from 'express'

/** Bounded in-process admission control; a trusted proxy may impose stricter limits. */
export function rateLimit(limit: number, windowMs = 60_000): RequestHandler {
    const buckets = new Map<string, { count: number; until: number }>()
    return (request, response, next) => {
        const now = Date.now()
        for (const [key, bucket] of buckets) if (bucket.until <= now) buckets.delete(key)
        const key = request.ip ?? 'unknown'
        let bucket = buckets.get(key)
        if (!bucket) {
            if (buckets.size >= 2048) {
                response
                    .status(429)
                    .set('Retry-After', '60')
                    .json({ error: { code: 'rate_limited', message: 'Please try again later' } })
                return
            }
            bucket = { count: 0, until: now + windowMs }
            buckets.set(key, bucket)
        }
        bucket.count++
        if (bucket.count > limit) {
            response
                .status(429)
                .set('Retry-After', String(Math.ceil((bucket.until - now) / 1000)))
                .json({ error: { code: 'rate_limited', message: 'Please try again later' } })
            return
        }
        next()
    }
}
