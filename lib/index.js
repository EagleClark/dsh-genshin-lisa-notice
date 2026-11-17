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
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { buildFeishuCard, describeFailure } from './feishu-card.js'
import { createFeishuBot, messageText, pickRoute, stripTargetToken } from './feishu-bot.js'

export const name = 'dsh-genshin-lisa-notice'

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

// Friendly display names for the known built-in voices; unknown keys fall
// back to the base name with dashes replaced by "·".
const VOICE_LABELS = {
  'lisa-notice': '丽莎姐姐聊聊天',
  'luoshaliya-jiaban': '罗莎莉亚不加班',
  systemsound1: '系统音效 1',
  systemsound2: '系统音效 2',
  systemsound3: '系统音效 3',
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
  feishuBotEnabled: z
    .boolean()
    .description('使用飞书助手（应用机器人）：通知发到指定群聊，并能把群里对通知的回复送回原会话')
    .default(false)
    .volatile(),
  feishuAppId: z
    .string()
    .description('飞书应用的 App ID（cli_ 开头）')
    .default('')
    .volatile(),
  feishuAppSecret: z
    .string()
    .description('飞书应用的 App Secret')
    .default('')
    .volatile(),
  feishuChatId: z
    .string()
    .description('助手所在群聊的 chat_id（oc_ 开头）')
    .default('')
    .volatile(),
  feishuPollSeconds: z
    .number()
    .description('拉取群里回复的间隔（秒），2–60')
    .default(5)
    .volatile(),
})

export function apply(ctx, config) {
  let pendingCompletion = 0
  let pendingInteraction = 0
  let pendingFailure = 0
  // One entry per completed turn, so concurrent sessions each keep their own
  // summary instead of overwriting a single global slot.
  let pendingSummaries = []
  let pendingInteractionSummary = ''
  const pendingFailureSummaries = []
  // Everything summary-related is keyed by session id: several sessions may run
  // at once and completion order is nondeterministic, so a single global "last
  // message" would attribute one session's text to another session's alert.
  const sessionTexts = new Map() // sessionId -> { task, result }
  const armed = new Set() // sessionIds whose turn just stopped
  // Model-request failures, kept per session so a later `agent/error` can report
  // the concrete cause (status code, provider code, message). `reportedTurn`
  // suppresses duplicate alerts for the same failed turn.
  const failures = new Map() // sessionId -> { status?, code, message, at }
  const reportedTurn = new Map() // sessionId -> turn number

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
    feishuBotEnabled: readRef(config && config.feishuBotEnabled, false) === true,
    feishuAppId: readString(config && config.feishuAppId, '').trim(),
    feishuAppSecret: readString(config && config.feishuAppSecret, '').trim(),
    feishuChatId: readString(config && config.feishuChatId, '').trim(),
    feishuPollSeconds: Math.min(60, Math.max(2, Number(readRef(config && config.feishuPollSeconds, 5)) || 5)),
  })

  // ── Feishu assistant channel (app bot) ───────────────────────────────────
  // The bot both sends the notification and collects the human's answer, so a
  // notification can be replied to in Feishu. Routing works on the sent
  // message's id: a quote-reply carries it as parent_id/root_id.
  const feishuHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  const routesFile = join(feishuHome, 'data', 'dsh-genshin-lisa-notice', 'feishu-routes.json')
  const routes = new Map() // feishu message_id -> { sessionId, at }
  let lastRoute = null // { sessionId, at, chatId } — fallback for a plain message
  let cursorMs = 0 // newest create_time already processed
  let botCache = { key: '', bot: null }

  const botOf = (current) => {
    if (!current.feishuBotEnabled) return null
    if (current.feishuAppId === '' || current.feishuAppSecret === '' || current.feishuChatId === '') return null
    const key = `${current.feishuAppId}|${current.feishuAppSecret}|${current.feishuChatId}`
    if (botCache.key !== key) {
      botCache = { key, bot: createFeishuBot({ appId: current.feishuAppId, appSecret: current.feishuAppSecret, chatId: current.feishuChatId }) }
    }
    return botCache.bot
  }

  const persistRoutes = () => {
    try {
      mkdirSync(dirname(routesFile), { recursive: true })
      writeFile(routesFile, JSON.stringify({ cursor: cursorMs, routes: Object.fromEntries(routes) })).catch(() => {})
    } catch (error) { /* best-effort */ }
  }

  const rememberRoute = (messageId, sessionId, chatId) => {
    if (typeof messageId !== 'string' || messageId === '' || sessionId === '') return
    const at = Date.now()
    routes.set(messageId, { sessionId, at })
    lastRoute = { sessionId, at, chatId }
    if (routes.size > 500) {
      for (const key of Array.from(routes.keys()).slice(0, routes.size - 500)) routes.delete(key)
    }
    persistRoutes()
  }

  const loadRoutes = async () => {
    try {
      const raw = await readFile(routesFile, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && parsed.routes && typeof parsed.routes === 'object') {
        for (const [key, value] of Object.entries(parsed.routes)) {
          if (value && typeof value.sessionId === 'string' && value.sessionId !== '') {
            routes.set(key, { sessionId: value.sessionId, at: Number(value.at) || 0 })
          }
        }
        cursorMs = Number(parsed.cursor) || 0
      }
    } catch (error) { /* first run, or an unreadable file */ }
  }
  const routesReady = loadRoutes()

  const webhookPost = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    .then((response) => response.json().catch(() => ({})))
    .catch(() => ({ code: -1 }))

  const postWebhook = (current, payload, fallback) => {
    const url = current.feishuWebhook.trim()
    if (url === '') return
    webhookPost(url, payload).then((answer) => {
      // Feishu answers 200 with a business code; anything but 0 means the card
      // was refused (unsupported field, oversized body, …), so retry as text.
      if (answer && answer.code === 0) return
      console.error('[dsh-genshin-lisa-notice] feishu card refused, falling back to text:', answer)
      return webhookPost(url, fallback)
    }).catch((error) => {
      console.error('[dsh-genshin-lisa-notice] feishu webhook failed:', error)
    })
  }

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
      sendFeishuCard({ kind: 'interaction', task: t.task, question, sessionId: sid })
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

  // Drop a session's captured state once it leaves the store.
  ctx.on('session/disposed', (session) => {
    const sid = session && typeof session.id === 'string' ? session.id : ''
    if (sid === '') return
    sessionTexts.delete(sid)
    armed.delete(sid)
    failures.delete(sid)
    reportedTurn.delete(sid)
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
    sendFeishuCard({ kind: 'completion', task: t.task, result: t.result, sessionId: sid })
  })

  // Capture the concrete cause of one failed model-request attempt (429, 5xx,
  // network, quota, …). Waterfall: delegate to the retry pipeline with next()
  // and never claim recovery ourselves.
  ctx.on('agent/request-error', (payload, next) => {
    try {
      const sid = agentSessionId(payload && payload.agent)
      const failure = payload && payload.failure
      if (sid !== '' && failure) {
        failures.set(sid, {
          status: typeof failure.status === 'number' ? failure.status : undefined,
          code: typeof failure.code === 'string' ? failure.code : '',
          message: typeof failure.message === 'string' ? failure.message : '',
          at: Date.now(),
        })
      }
    } catch (error) {
      // Capture is best-effort; the retry pipeline must still run.
    }
    return next()
  })

  // A step or turn errored — the case that stayed silent before. Report it on the
  // same channels as a completion, with the captured cause when there is one.
  ctx.on('agent/error', (payload) => {
    if (!payload) return
    const sid = agentSessionId(payload.agent)
    const turn = typeof payload.turn === 'number' ? payload.turn : -1
    // One alert per failed turn: a retried step must not spam the channel.
    if (sid !== '' && reportedTurn.get(sid) === turn) return
    if (sid !== '') reportedTurn.set(sid, turn)
    const captured = sid !== '' ? failures.get(sid) : undefined
    if (sid !== '') failures.delete(sid)
    let detail = describeFailure({ failure: captured, error: payload.error })
    if (detail === '') detail = '未捕获到具体错误信息（可能是网络中断或进程被中断）'
    const t = textsOf(sid)
    pendingFailure += 1
    const lines = []
    if (t.task !== '') lines.push('任务：' + clip(t.task, 80))
    lines.push('原因：' + clip(detail.replace(/\s*\n\s*/g, ' / '), 200))
    pendingFailureSummaries.push(lines.join('\n'))
    sendFeishuCard({ kind: 'failure', task: t.task, failure: detail, sessionId: sid })
  })

  // This bundle ships its own configuration page — the browser half registers
  // it on the Plugins page (`plugins.bundle.config`, keyed by package name) —
  // so the schema-derived generic page stays off. Optional child: the plugin
  // runs without a settings service.
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })

  // Feishu/Lark custom-bot delivery: a Card JSON 2.0 message built by
  // ./feishu-card.js, which renders markdown tables as native tables and keeps
  // the payload inside the webhook body budget. A refused card falls back to a
  // plain-text message.
  const sendFeishuCard = ({ kind, task = '', result = '', question = '', failure = '', sessionId = '' }) => {
    const current = preferences()
    const { payload, fallback } = buildFeishuCard({ kind, task, result, question, failure, sessionId })
    // The app bot is preferred: only it can carry a reply back into the session.
    const bot = botOf(current)
    if (bot !== null) {
      let card = null
      try { card = JSON.parse(payload).card } catch (error) { card = null }
      if (card !== null) {
        bot.send({ msgType: 'interactive', content: card })
          .then((sent) => rememberRoute(sent.messageId, sessionId, current.feishuChatId))
          .catch((error) => {
            console.error('[dsh-genshin-lisa-notice] feishu bot send failed, trying the webhook:', error)
            if (current.feishuEnabled) postWebhook(current, payload, fallback)
          })
        return
      }
    }
    if (!current.feishuEnabled) return
    postWebhook(current, payload, fallback)
  }

  // Poll the assistant chat for human replies and feed them back into the
  // session that produced the notification. `agents.get` only finds sessions
  // that are currently live; a reply for a closed session is answered in Feishu
  // rather than dropped silently.
  ctx.inject(['agents'], (child) => {
    let lastPollAt = 0
    let polling = false
    // The cursor advances only after a batch is processed, so a failed poll can
    // replay a few messages; remember what was already delivered.
    const processed = new Set()

    const deliver = async (bot, item) => {
      const messageId = typeof item.message_id === 'string' ? item.message_id : ''
      if (messageId !== '') {
        if (processed.has(messageId)) return
        processed.add(messageId)
        if (processed.size > 500) {
          for (const key of Array.from(processed).slice(0, processed.size - 500)) processed.delete(key)
        }
      }
      const text = messageText(item)
      if (text === '') return
      const target = pickRoute({
        text,
        parentId: typeof item.parent_id === 'string' ? item.parent_id : '',
        rootId: typeof item.root_id === 'string' ? item.root_id : '',
        routes,
        lastRoute,
      })
      if (target === null) return
      const short = target.sessionId.slice(0, 8)
      const agent = child.agents.get(target.sessionId)
      if (agent === undefined) {
        await bot.reply(item.message_id, { content: { text: `会话 ${short} 当前没有打开，消息未送达。请先在 DSH 里打开该会话再回复。` } }).catch(() => {})
        return
      }
      // `#会话号` is routing syntax, not something the model should read.
      const delivered = stripTargetToken(text)
      try {
        agent.followup({
          id: `feishu-${item.message_id || Date.now()}`,
          role: 'user',
          content: [{ type: 'text', text: delivered }],
          source: { kind: 'user' },
        })
        await bot.reply(item.message_id, { content: { text: `✅ 已送入会话 ${short}` } }).catch(() => {})
      } catch (error) {
        console.error('[dsh-genshin-lisa-notice] feishu reply delivery failed:', error)
        const reason = String(error && error.message ? error.message : error).slice(0, 120)
        await bot.reply(item.message_id, { content: { text: `⚠️ 送入会话 ${short} 失败：${reason}` } }).catch(() => {})
      }
    }

    const pollOnce = async () => {
      await routesReady
      const current = preferences()
      const bot = botOf(current)
      if (bot === null) return
      const nowMs = Date.now()
      if (cursorMs === 0) {
        // First run: start from now so old history is never replayed.
        cursorMs = nowMs
        persistRoutes()
        return
      }
      const startSec = Math.max(0, Math.floor(cursorMs / 1000) - 5)
      const items = await bot.list({ startTimeSec: startSec, pageSize: 20 })
      const fresh = []
      let newest = cursorMs
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        const created = Number(item.create_time) || 0
        if (created > newest) newest = created
        if (created <= cursorMs) continue
        if (item.deleted === true) continue
        const sender = item.sender
        if (!sender || sender.sender_type !== 'user') continue
        fresh.push(item)
      }
      fresh.sort((a, b) => (Number(a.create_time) || 0) - (Number(b.create_time) || 0))
      for (const item of fresh) await deliver(bot, item)
      if (newest !== cursorMs) {
        cursorMs = newest
        persistRoutes()
      }
    }

    const tick = () => {
      const current = preferences()
      if (botOf(current) === null) return
      const nowMs = Date.now()
      if (nowMs - lastPollAt < current.feishuPollSeconds * 1000) return
      if (polling) return
      lastPollAt = nowMs
      polling = true
      pollOnce()
        .catch((error) => console.error('[dsh-genshin-lisa-notice] feishu poll failed:', error))
        .finally(() => { polling = false })
    }

    let timer = null
    child.effect(() => {
      timer = setInterval(tick, 1000)
      return () => {
        if (timer !== null) clearInterval(timer)
        timer = null
      }
    })
  })

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
            const failure = pendingFailure
            const summaries = pendingSummaries
            const interactionSummary = pendingInteractionSummary
            const failureSummaries = pendingFailureSummaries.splice(0, pendingFailureSummaries.length)
            pendingCompletion = 0
            pendingInteraction = 0
            pendingFailure = 0
            pendingSummaries = []
            pendingInteractionSummary = ''
            res.writeHead(200, {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'no-store',
            })
            res.end(JSON.stringify({ completion, interaction, failure, summaries, interactionSummary, failureSummaries, interactionAudio: true }))
          },
        }),
      ]
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'dsh-genshin-lisa-notice: http routes')
  })
}
