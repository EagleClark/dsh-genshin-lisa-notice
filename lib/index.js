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
 * Custom files arrive through a same-origin POST upload route that stores
 * the bytes under $DSH_HOME/data/dsh-genshin-lisa-notice and updates the
 * settings namespace, so every change applies live.
 *
 * HTTP routes (mounted when a webServer exists):
 * - GET  /dsh-genshin-lisa-notice/alert.mp3        — completion sound
 * - GET  /dsh-genshin-lisa-notice/interaction.mp3  — interaction sound
 * - POST /dsh-genshin-lisa-notice/upload?kind=…    — store a custom mp3
 * - GET  /dsh-genshin-lisa-notice/poll             — drains both counters
 */
import { existsSync, mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-genshin-lisa-notice'

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

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
  // Registered inside ctx.inject so registration waits for the settings
  // service instead of silently skipping at early boot.
  let audioConfig = { completionAudio: '', interactionAudio: '' }
  let settingsScope = null
  ctx.inject(['settings'], (host) => {
    try {
      settingsScope = host.settings.register(
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
      audioConfig = { ...audioConfig, ...settingsScope.get() }
      host.effect(() => settingsScope.watch((next) => {
        audioConfig = { ...audioConfig, ...next }
      }))
    } catch (error) {
      console.error('[dsh-genshin-lisa-notice] settings registration failed:', error)
    }
  })

  ctx.inject(['webServer'], (host) => {
    const defaultCompletionUrl = new URL('../assets/lisa-notice.mp3', import.meta.url)
    const defaultInteractionUrl = new URL('../assets/luoshaliya-jiaban.mp3', import.meta.url)
    const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
    const storageDir = join(dshHome, 'data', 'dsh-genshin-lisa-notice')

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

    const sameOrigin = (req) => {
      const origin = req.headers.origin
      const host = req.headers.host
      if (typeof origin !== 'string' || origin === '') return true
      try {
        return new URL(origin).host === host
      } catch {
        return false
      }
    }

    const readBody = async (req, res) => {
      const chunks = []
      let total = 0
      for await (const chunk of req) {
        total += chunk.length
        if (total > MAX_UPLOAD_BYTES) {
          if (!res.headersSent) {
            res.writeHead(413, { 'content-type': 'text/plain; charset=utf-8' })
          }
          res.end('upload too large')
          return null
        }
        chunks.push(chunk)
      }
      return Buffer.concat(chunks)
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
          path: '/dsh-genshin-lisa-notice/upload',
          handler: async (req, res) => {
            if (req.method !== 'POST') {
              res.writeHead(405, { allow: 'POST' })
              res.end()
              return
            }
            if (!sameOrigin(req)) {
              res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
              res.end('untrusted origin')
              return
            }
            const kind = new URL(req.url, 'http://localhost').searchParams.get('kind')
            if (kind !== 'completion' && kind !== 'interaction') {
              res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
              res.end('kind must be completion or interaction')
              return
            }
            const declared = Number(req.headers['content-length'])
            if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
              res.writeHead(413, { 'content-type': 'text/plain; charset=utf-8' })
              res.end('upload too large')
              return
            }
            try {
              const bytes = await readBody(req, res)
              if (bytes === null) return
              if (bytes.length === 0) {
                res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
                res.end('empty body')
                return
              }
              mkdirSync(storageDir, { recursive: true })
              const field = kind === 'completion' ? 'completionAudio' : 'interactionAudio'
              const filePath = join(storageDir, `${kind}-${Date.now()}.mp3`)
              await writeFile(filePath, bytes)
              if (settingsScope !== null) {
                await settingsScope.update({ [field]: filePath })
              }
              res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ ok: true, path: filePath }))
            } catch (error) {
              console.error('[dsh-genshin-lisa-notice] upload failed:', error)
              if (!res.headersSent) {
                res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
              }
              res.end('upload failed')
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
