/**
 * dsh-genshin-lisa-notice — host entry.
 *
 * Two alert kinds, two counters:
 * - completion: an agent turn is about to close (`agent/turn-stopping`) —
 *   the execution finished.
 * - interaction: the agent is about to ask the user for input
 *   (`tools/pre-execute` for the `ask_user_question` tool). Note this must
 *   fire BEFORE dispatch: ask_user_question's execute() blocks until the
 *   user answers, so `tools/result` would fire far too late.
 *
 * dsh-scope routes scoped events up the scope chain, so an app-level
 * listener hears every agent composed under it.
 *
 * HTTP routes (mounted when a webServer exists):
 * - GET /dsh-genshin-lisa-notice/alert.mp3       — completion sound
 * - GET /dsh-genshin-lisa-notice/interaction.mp3 — interaction sound
 *   (only when assets/interaction.mp3 ships in the package)
 * - GET /dsh-genshin-lisa-notice/poll            — drains both counters
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

export const name = 'dsh-genshin-lisa-notice'

export function apply(ctx) {
  let pendingCompletion = 0
  let pendingInteraction = 0

  ctx.on('agent/turn-stopping', () => {
    pendingCompletion += 1
  })

  // Waterfall: must continue the pipeline with next().
  ctx.on('tools/pre-execute', (exec, next) => {
    if (exec && exec.name === 'ask_user_question') {
      pendingInteraction += 1
    }
    return next()
  })

  ctx.inject(['webServer'], (host) => {
    const completionAudioUrl = new URL('../assets/lisa-notice.mp3', import.meta.url)
    const interactionAudioUrl = new URL('../assets/interaction.mp3', import.meta.url)
    const hasInteractionAudio = existsSync(interactionAudioUrl)

    const serveAudio = async (res, url) => {
      try {
        const bytes = await readFile(url)
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
    }

    host.effect(() => {
      const disposers = [
        host.webServer.register({
          kind: 'exact',
          path: '/dsh-genshin-lisa-notice/alert.mp3',
          handler: (req, res) => serveAudio(res, completionAudioUrl),
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
            const completion = pendingCompletion
            const interaction = pendingInteraction
            pendingCompletion = 0
            pendingInteraction = 0
            res.writeHead(200, {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'no-store',
            })
            res.end(JSON.stringify({ completion, interaction, interactionAudio: hasInteractionAudio }))
          },
        }),
      ]
      if (hasInteractionAudio) {
        disposers.push(host.webServer.register({
          kind: 'exact',
          path: '/dsh-genshin-lisa-notice/interaction.mp3',
          handler: (req, res) => serveAudio(res, interactionAudioUrl),
        }))
      }
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'dsh-genshin-lisa-notice: http routes')
  })
}
