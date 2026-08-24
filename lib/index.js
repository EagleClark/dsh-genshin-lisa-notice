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
 * with two fields — `completionAudio` and `interactionAudio`. Each value is
 * one of:
 *   - ''                     — the field's packaged default voice
 *   - a built-in voice key   — any asset under assets/*.mp3 (strip .mp3)
 *   - a custom absolute path — an uploaded file under $DSH_HOME/data/...
 * The host serves the selected voice through the fixed audio routes; the
 * built-in voice list (with friendly labels) is exposed by GET /voices.
 *
 * HTTP routes (mounted when a webServer exists):
 * - GET  /dsh-genshin-lisa-notice/voices            — built-in voice list
 * - GET  /dsh-genshin-lisa-notice/alert.mp3         — completion sound
 * - GET  /dsh-genshin-lisa-notice/interaction.mp3   — interaction sound
 * - POST /dsh-genshin-lisa-notice/upload?kind=…     — store a custom mp3
 * - GET  /dsh-genshin-lisa-notice/poll              — drains both counters
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-genshin-lisa-notice'

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

// Friendly display names for the known built-in voices; unknown keys fall
// back to the base name with dashes replaced by "·".
const VOICE_LABELS = {
  'lisa-notice': '丽莎姐姐聊聊天',
  'luoshaliya-jiaban': '罗莎莉亚不加班',
}
const DEFAULT_VOICES = { completion: 'lisa-notice', interaction: 'luoshaliya-jiaban' }
const labelOf = (key) => VOICE_LABELS[key] || key.replace(/-/g, '·')

const assetsDir = fileURLToPath(new URL('../assets/', import.meta.url))
const builtinKeys = readdirSync(assetsDir).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4))
const assetPath = (key) => join(assetsDir, key + '.mp3')

export function apply(ctx) {
  let pendingCompletion = 0
  let pendingInteraction = 0
  let pendingSummary = ''

  ctx.on('agent/turn-stopping', () => {
    pendingCompletion += 1
    completionArmed = true
  })

  // Waterfall: must continue the pipeline with next().
  ctx.on('tools/pre-execute', (exec, next) => {
    if (exec && exec.name === 'ask_user_question') {
      pendingInteraction += 1
      sendFeishu('需要你的输入，请查看 DeepSeek Harness')
    }
    return next()
  })

  // Capture a short summary of the finished turn for the browser
  // notification. Runs on the idle transition (after the final message is
  // committed; turn-stopping fires too early for the message to exist).
  const summarizeEvents = (events) => {
    if (!Array.isArray(events)) return ''
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]
      if (ev && ev.type === 'assistant/message') {
        const msg = ev.message
        const content = msg ? msg.content : undefined
        if (typeof content === 'string') return content.trim()
        if (Array.isArray(content)) {
          const parts = content
            .filter((b) => b && (b.type === 'text' || b.type === 'markdown'))
            .map((b) => (typeof b.text === 'string' ? b.text : ''))
            .join('\n')
          return parts.trim()
        }
        return ''
      }
    }
    return ''
  }
  ctx.on('agent/status', async (payload) => {
    if (!payload || payload.status !== 'idle') return
    const agent = payload.agent
    const sessionId = agent && typeof agent.sessionId === 'string' ? agent.sessionId : undefined
    // Best-effort summary (for the client notification and the webhook).
    let summary = ''
    const query = ctx.get('sessionQuery')
    if (typeof sessionId === 'string' && query && typeof query.readSurface === 'function') {
      try {
        const surface = await query.readSurface(sessionId)
        summary = summarizeEvents(surface && surface.events)
        if (summary) pendingSummary = summary
      } catch (error) {
        // Summary is best-effort; the webhook still fires below.
      }
    }
    // Fire the completion webhook regardless of summary-read success.
    if (completionArmed) {
      completionArmed = false
      sendFeishu(`任务完成\n${summary || pendingSummary || ''}`.trim())
    }
  })

  // User settings: selected voice key/path ('' = packaged default). Live
  // applied. Registered inside ctx.inject so registration waits for the
  // settings service instead of silently skipping at early boot.
  let config = {
    completionAudio: '',
    interactionAudio: '',
    soundEnabled: true,
    notificationEnabled: true,
    feishuWebhook: '',
    feishuEnabled: false,
  }
  let settingsScope = null
  let completionArmed = false
  ctx.inject(['settings'], (host) => {
    try {
      settingsScope = host.settings.register(
        settingsNamespace('dsh-genshin-lisa-notice'),
        z.object({
          completionAudio: z.string()
            .description('完成提醒语音：内置语音 key 或自定义音频路径；留空使用默认语音')
            .default(''),
          interactionAudio: z.string()
            .description('交互提醒语音：内置语音 key 或自定义音频路径；留空使用默认语音')
            .default(''),
          soundEnabled: z.boolean()
            .description('是否播放声音提醒')
            .default(true),
          notificationEnabled: z.boolean()
            .description('是否发送浏览器系统通知')
            .default(true),
          feishuEnabled: z.boolean()
            .description('是否发送飞书 webhook 通知')
            .default(false),
          feishuWebhook: z.string()
            .description('飞书自定义机器人 Webhook 地址')
            .default(''),
        }),
        { applies: 'live' },
      )
      config = { ...config, ...settingsScope.get() }
      host.effect(() => settingsScope.watch((next) => {
        config = { ...config, ...next }
      }))
    } catch (error) {
      console.error('[dsh-genshin-lisa-notice] settings registration failed:', error)
    }
  })

  // Send a Feishu/Lark custom-bot webhook message when enabled and a URL is set.
  const sendFeishu = (message) => {
    const url = typeof config.feishuWebhook === 'string' ? config.feishuWebhook.trim() : ''
    if (!config.feishuEnabled || url === '') return
    const body = JSON.stringify({ msg_type: 'text', content: { text: message } })
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
      .then(() => {})
      .catch((error) => console.error('[dsh-genshin-lisa-notice] feishu webhook failed:', error))
  }

  ctx.inject(['webServer'], (host) => {
    const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
    const storageDir = join(dshHome, 'data', 'dsh-genshin-lisa-notice')

    const resolveAudio = (value, field) => {
      const v = typeof value === 'string' ? value.trim() : ''
      if (v === '') return assetPath(DEFAULT_VOICES[field])
      const builtin = assetPath(v)
      if (existsSync(builtin)) return builtin
      if (existsSync(v)) return v
      return assetPath(DEFAULT_VOICES[field])
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
          path: '/dsh-genshin-lisa-notice/voices',
          handler: (req, res) => {
            res.writeHead(200, {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'no-store',
            })
            res.end(JSON.stringify({
              voices: builtinKeys.map((k) => ({ key: k, label: labelOf(k) })),
              defaults: DEFAULT_VOICES,
            }))
          },
        }),
        host.webServer.register({
          kind: 'exact',
          path: '/dsh-genshin-lisa-notice/alert.mp3',
          handler: (req, res) => serveAudio(res, resolveAudio(config.completionAudio, 'completion')),
        }),
        host.webServer.register({
          kind: 'exact',
          path: '/dsh-genshin-lisa-notice/interaction.mp3',
          handler: (req, res) => serveAudio(res, resolveAudio(config.interactionAudio, 'interaction')),
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
            const summary = pendingSummary
            pendingCompletion = 0
            pendingInteraction = 0
            pendingSummary = ''
            res.writeHead(200, {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'no-store',
            })
            res.end(JSON.stringify({ completion, interaction, summary, interactionAudio: true }))
          },
        }),
      ]
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'dsh-genshin-lisa-notice: http routes')
  })
}
