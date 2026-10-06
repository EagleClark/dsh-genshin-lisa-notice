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
 * Audio configuration: this plugin's own Config schema (exported below) holds
 * every user-editable field, marked `volatile()` so a settings write commits
 * into the running references instead of remounting the entry, and so the
 * browser half can render the same section through `ctx.configForms`.
 * Each audio value is one of:
 *   - ''                     — the field's packaged default voice
 *   - a built-in voice key   — any asset under assets/*.mp3 (strip .mp3)
 *   - a custom absolute path — an uploaded file under $DSH_HOME/data/...
 * The host serves the selected voice through the fixed audio routes; the
 * built-in voice list (with friendly labels) is exposed by GET /voices.
 *
 * HTTP routes (mounted when a webServer exists):
 * - GET  /dsh-genshin-lisa-notice/voices            — built-in voice list
 * - GET  /dsh-genshin-lisa-notice/voice.mp3?key=…   — one packaged voice (preview)
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

/**
 * User-editable preferences. Fields marked `volatile()` accept live writes
 * from the settings document: the Loader commits new values into the running
 * references, so the audio routes and the Feishu sender below always read the
 * latest value without a remount.
 */
export const Config = z.object({
  completionAudio: z
    .string()
    .description('完成提醒语音：内置语音 key 或自定义音频路径；留空使用默认语音')
    .default('')
    .volatile(),
  interactionAudio: z
    .string()
    .description('交互提醒语音：内置语音 key 或自定义音频路径；留空使用默认语音')
    .default('')
    .volatile(),
  soundEnabled: z
    .boolean()
    .description('是否播放声音提醒')
    .default(true)
    .volatile(),
  notificationEnabled: z
    .boolean()
    .description('是否发送浏览器系统通知')
    .default(true)
    .volatile(),
  feishuEnabled: z
    .boolean()
    .description('是否发送飞书 webhook 通知')
    .default(false)
    .volatile(),
  feishuWebhook: z
    .string()
    .description('飞书自定义机器人 Webhook 地址')
    .default('')
    .volatile(),
})

export function apply(ctx, config) {
  let pendingCompletion = 0
  let pendingInteraction = 0
  // One entry per completed turn, so concurrent sessions each keep their own
  // summary instead of overwriting a single global slot.
  let pendingSummaries = []
  let pendingInteractionSummary = ''
  // Everything summary-related is keyed by session id: several sessions may run
  // at once and completion order is nondeterministic, so a single global "last
  // message" would attribute one session's text to another session's alert.
  const sessionTexts = new Map() // sessionId -> { task, result }
  const armed = new Set() // sessionIds whose turn just stopped

  const textOf = (content) => {
    if (typeof content === 'string') return content.trim()
    if (Array.isArray(content)) {
      return content
        .filter((b) => b && (b.type === 'text' || b.type === 'markdown'))
        .map((b) => (typeof b.text === 'string' ? b.text : ''))
        .join('\n')
        .trim()
    }
    return ''
  }
  const clip = (s, n) => {
    const t = String(s || '').trim().replace(/\s+/g, ' ')
    return t.length > n ? t.slice(0, n) + '…' : t
  }
  const textsOf = (sessionId) => (sessionId !== '' ? sessionTexts.get(sessionId) : undefined) || { task: '', result: '' }
  // An Agent's session identity is `agent.id` — the Agent interface's `id` is
  // the SessionId it shares with `agent.session` (there is no `sessionId`).
  // `agent.session.id` is a defensive fallback.
  const agentSessionId = (agent) => {
    if (!agent) return ''
    if (typeof agent.id === 'string' && agent.id !== '') return agent.id
    const session = agent.session
    if (session && typeof session.id === 'string' && session.id !== '') return session.id
    return ''
  }
  // Question text from an ask_user_question execution's parsed arguments.
  const extractQuestion = (exec) => {
    try {
      const args = exec && exec.arguments
      const qs = args && Array.isArray(args.questions) ? args.questions : []
      const question = (qs[0] && typeof qs[0].question === 'string' ? qs[0].question : '') || (qs.length > 1 ? `（共 ${qs.length} 个问题）` : '')
      return question.trim()
    } catch (error) {
      return ''
    }
  }

  // Volatile config fields arrive as live references; read them at use time so
  // a settings write is visible without remounting this entry.
  const readRef = (ref, fallback) => {
    try {
      const value = ref !== null && typeof ref === 'object' && typeof ref.get === 'function' ? ref.get() : ref
      return value === undefined || value === null ? fallback : value
    } catch (error) {
      return fallback
    }
  }
  const readString = (ref, fallback) => {
    const value = readRef(ref, fallback)
    return typeof value === 'string' ? value : fallback
  }
  const preferences = () => ({
    completionAudio: readString(config && config.completionAudio, ''),
    interactionAudio: readString(config && config.interactionAudio, ''),
    feishuWebhook: readString(config && config.feishuWebhook, ''),
    feishuEnabled: readRef(config && config.feishuEnabled, false) === true,
  })

  ctx.on('agent/turn-stopping', (payload) => {
    const sid = agentSessionId(payload && payload.agent)
    if (sid !== '') armed.add(sid)
  })

  // Waterfall: must continue the pipeline with next().
  ctx.on('tools/pre-execute', (exec, next) => {
    if (exec && exec.name === 'ask_user_question') {
      pendingInteraction += 1
      const sid = agentSessionId(exec.agent)
      const t = textsOf(sid)
      const question = extractQuestion(exec)
      const lines = []
      if (t.task !== '') lines.push('任务：' + clip(t.task, 80))
      if (question !== '') lines.push('问题：' + clip(question, 120))
      const s = lines.join('\n')
      if (s) pendingInteractionSummary = s
      sendFeishu(s ? `💬 需要你的输入\n${s}` : '💬 需要你的输入，请查看 DeepSeek Harness')
    }
    return next()
  })

  // Track each session's latest user task text and assistant result text as
  // events flow; `session/event` fires for every committed session event and
  // root listeners receive them all.
  ctx.on('session/event', (session, event) => {
    const sid = session && typeof session.id === 'string' ? session.id : ''
    if (sid === '' || !event || !event.data) return
    const entry = sessionTexts.get(sid) || { task: '', result: '' }
    if (event.type === 'user/message') {
      const t = textOf(event.data.content)
      if (t) entry.task = t
    } else if (event.type === 'assistant/message') {
      const r = textOf(event.data && event.data.message && event.data.message.content)
      if (r) entry.result = r
    }
    sessionTexts.set(sid, entry)
  })

  // Drop a session's captured text once it leaves the store.
  ctx.on('session/disposed', (session) => {
    const sid = session && typeof session.id === 'string' ? session.id : ''
    if (sid === '') return
    sessionTexts.delete(sid)
    armed.delete(sid)
  })

  // Completion alert for the exact session that just went idle. The count and
  // the summary are collected together here, so each completed session owns
  // its own entry instead of overwriting a shared slot.
  ctx.on('agent/status', (payload) => {
    if (!payload || payload.status !== 'idle') return
    const sid = agentSessionId(payload.agent)
    if (sid === '' || !armed.has(sid)) return
    armed.delete(sid)
    const t = textsOf(sid)
    const lines = []
    if (t.task !== '') lines.push('任务：' + clip(t.task, 80))
    if (t.result !== '') lines.push('结果：' + clip(t.result, 200))
    const s = lines.join('\n')
    pendingCompletion += 1
    pendingSummaries.push(s)
    sendFeishu(s ? `✅ 任务完成\n${s}` : '✅ 任务完成')
  })

  // This bundle ships its own configuration page — the browser half registers
  // it on the Plugins page (`plugins.bundle.config`, keyed by package name) —
  // so the schema-derived generic page stays off. Optional child: the plugin
  // runs without a settings service.
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })

  // Send a Feishu/Lark custom-bot webhook message when enabled and a URL is set.
  const sendFeishu = (message) => {
    const current = preferences()
    const url = current.feishuWebhook.trim()
    if (!current.feishuEnabled || url === '') return
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
          path: '/dsh-genshin-lisa-notice/voice.mp3',
          handler: (req, res) => {
            const key = new URL(req.url, 'http://localhost').searchParams.get('key') ?? ''
            // Preview one packaged voice by key; never serves an arbitrary path.
            if (!builtinKeys.includes(key)) {
              res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
              res.end('unknown voice')
              return
            }
            return serveAudio(res, assetPath(key))
          },
        }),
        host.webServer.register({
          kind: 'exact',
          path: '/dsh-genshin-lisa-notice/alert.mp3',
          handler: (req, res) => serveAudio(res, resolveAudio(preferences().completionAudio, 'completion')),
        }),
        host.webServer.register({
          kind: 'exact',
          path: '/dsh-genshin-lisa-notice/interaction.mp3',
          handler: (req, res) => serveAudio(res, resolveAudio(preferences().interactionAudio, 'interaction')),
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
              const filePath = join(storageDir, `${kind}-${Date.now()}.mp3`)
              await writeFile(filePath, bytes)
              // The browser half writes the returned path into this entry's
              // `completionAudio`/`interactionAudio` field through the shared
              // configuration form, which owns the revision fence.
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
            const summaries = pendingSummaries
            const interactionSummary = pendingInteractionSummary
            pendingCompletion = 0
            pendingInteraction = 0
            pendingSummaries = []
            pendingInteractionSummary = ''
            res.writeHead(200, {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'no-store',
            })
            res.end(JSON.stringify({ completion, interaction, summaries, interactionSummary, interactionAudio: true }))
          },
        }),
      ]
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'dsh-genshin-lisa-notice: http routes')
  })
}
