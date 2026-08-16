/**
 * dsh-genshin-lisa-notice — host entry.
 *
 * - Listens for agent turn completion (`agent/turn-stopping`). dsh-scope
 *   routes scoped events up the scope chain, so an app-level listener hears
 *   every agent composed under it; each completed turn bumps the pending
 *   counter once.
 * - Serves the alert audio over HTTP (`/dsh-genshin-lisa-notice/alert.mp3`).
 * - Exposes a completion poll endpoint (`/dsh-genshin-lisa-notice/poll`)
 *   that the browser half drains; it returns the accumulated count and
 *   resets it, so bursts coalesce into one playback.
 */
import { readFile } from 'node:fs/promises'

export const name = 'dsh-genshin-lisa-notice'

export function apply(ctx) {
  let pending = 0

  ctx.on('agent/turn-stopping', () => {
    pending += 1
  })

  // Mount HTTP routes only when a webServer exists (headless profiles skip).
  ctx.inject(['webServer'], (host) => {
    const audioUrl = new URL('../assets/lisa-notice.mp3', import.meta.url)

    host.effect(() => {
      const disposers = [
        host.webServer.register({
          kind: 'exact',
          path: '/dsh-genshin-lisa-notice/alert.mp3',
          handler: async (req, res) => {
            try {
              const bytes = await readFile(audioUrl)
              res.writeHead(200, {
                'content-type': 'audio/mpeg',
                'content-length': String(bytes.length),
                'cache-control': 'no-store',
              })
              res.end(bytes)
            } catch (error) {
              if (!res.headersSent) {
                res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
              }
              res.end('audio unavailable')
            }
          },
        }),
        host.webServer.register({
          kind: 'exact',
          path: '/dsh-genshin-lisa-notice/poll',
          handler: async (req, res) => {
            if (req.method !== 'GET') {
              res.writeHead(405, { allow: 'GET' })
              res.end()
              return
            }
            const count = pending
            pending = 0
            res.writeHead(200, {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'no-store',
            })
            res.end(JSON.stringify({ count }))
          },
        }),
      ]
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'dsh-genshin-lisa-notice: http routes')
  })
}
