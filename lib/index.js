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
 * Audio configuration: a user settings namespace (`dsh-genshin-lisa-notice`)
 * with two fields — `completionAudio` and `interactionAudio` — holding
 * absolute paths to custom mp3 files; an empty string uses the packaged
 * default (`assets/lisa-notice.mp3` / `assets/luoshaliya-jiaban.mp3`).
 * Changes apply live; each audio route re-reads the current config.
 *
 * HTTP routes (mounted when a webServer exists):
 * - GET /dsh-genshin-lisa-notice/alert.mp3       — completion sound
 * - GET /dsh-genshin-lisa-notice/interaction.mp3 — interaction sound
 * - GET /dsh-genshin-lisa-notice/poll            — drains both counters
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

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

  // User settings: custom audio paths ('' = packaged default). Live applied.
  let audioConfig = { completionAudio: '', interactionAudio: '' }
  const settings = ctx.get('settings')
  if (settings !== undefined) {
    try {
      const scope = settings.register(
        settingsNamespace('dsh-genshin-lisa-notice'),
        z.object({
          completionAudio: z.string()
            .description('完成提醒的自定义音频绝对路径；留空使用默认语音（lisa-notice.mp3）')
            .default(''),
          interactionAudio: z.string()
            .description('交互提醒的自定义音频绝对路径；留空使用默认语音（luoshaliya-jiaban.mp3）')
            .default(''),
        }),
        { applies: 'live' },
      )
      audioConfig = { ...audioConfig, ...scope.get() }
      ctx.effect(() => scope.watch((next) => {
        audioConfig = { ...audioConfig, ...next }
      }))
    } catch (error) {
      console.error('[dsh-genshin-lisa-notice] settings registration failed:', error)
    }
  }

  ctx.inject(['webServer'], (host) => {
    const defaultCompletionUrl = new URL('../assets/lisa-notice.mp3', import.meta.url)
    const defaultInteractionUrl = new URL('../assets/luoshaliya-jiaban.mp3', import.meta.url)

    const resolveAudio = (customPath, defaultUrl) => {
      const path = typeof customPath === 'string' ? customPath.trim() : ''
      if (path !== '' && existsSync(path)) return path
      return defaultUrl
    }

    const serveAudio = async (res, target) => {
      try {
        const bytes = await readFile(target)
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
          handler: (req, res) => serveAudio(res, resolveAudio(audioConfig.completionAudio, defaultCompletionUrl)),
        }),
        host.webServer.register({
          kind: 'exact',
          path: '/dsh-genshin-lisa-notice/interaction.mp3',
          handler: (req, res) => serveAudio(res, resolveAudio(audioConfig.interactionAudio, defaultInteractionUrl)),
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
            res.end(JSON.stringify({ completion, interaction, interactionAudio: true }))
          },
        }),
      ]
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'dsh-genshin-lisa-notice: http routes')
  })
}
