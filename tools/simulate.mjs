#!/usr/bin/env node
/**
 * End-to-end simulation of the Feishu assistant channel — no real Feishu, no
 * DSH: a local HTTP server impersonates open.feishu.cn and a minimal fake
 * context/agent stands in for the Harness.
 *
 * Proves, in one run:
 *   1. a completion sends an interactive card via the bot (correct URL + body),
 *   2. the sent message_id is remembered as the route for that session,
 *   3. a quote-reply is polled, deduped and delivered through `agent.followup`,
 *   4. a reply to a QUESTION card answers the pending question through
 *      `userQuestions.answer` (not a queued turn),
 *   5. delivery is acknowledged back in Feishu.
 *
 * Run: node tools/simulate.mjs   (needs `npm install` once, for schemastery)
 */
import { createServer } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Isolate plugin state: a real shell exports DSH_HOME (the Harness home), and
// the plugin persists its route file there — a simulation must never write to it.
process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'dsh-feishu-sim-'))

const { apply } = await import('../lib/index.js')

const SESSION = 'session-eade6582-8234-4f9d-b631-0085bab1eac4'
const CHAT = 'oc_sim_chat'
const APP = { id: 'cli_sim', secret: 'sim-secret' }

const calls = []      // every request the plugin made to "Feishu"
const sent = []       // cards the bot sent
const delivered = []  // messages handed to agent.followup
const answered = []   // answers handed to userQuestions.answer
const queuedReplies = [] // replies the fake chat will serve, oldest first
let nextId = 1

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ── fake Feishu ───────────────────────────────────────────────────────────────
const server = createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => {
    const url = new URL(req.url, 'http://localhost')
    calls.push({ method: req.method, path: url.pathname, query: url.search, body })
    const send = (json) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(json))
    }
    if (url.pathname.endsWith('/tenant_access_token/internal')) {
      return send({ code: 0, tenant_access_token: 'sim-token' })
    }
    if (req.method === 'POST' && url.pathname.endsWith('/im/v1/messages')) {
      const parsed = JSON.parse(body)
      const messageId = 'om_bot_' + nextId++
      sent.push({ ...parsed, messageId })
      return send({ code: 0, data: { message_id: messageId } })
    }
    if (req.method === 'GET' && url.pathname.endsWith('/im/v1/messages')) {
      if (queuedReplies.length === 0) return send({ code: 0, data: { items: [] } })
      const reply = queuedReplies.shift()
      return send({
        code: 0,
        data: {
          items: [{
            message_id: 'om_human_' + nextId++,
            parent_id: reply.parentId,
            create_time: String(Date.now()),
            msg_type: 'text',
            deleted: false,
            sender: { sender_type: 'user', id: 'ou_someone' },
            body: { content: JSON.stringify({ text: reply.text }) },
          }],
        },
      })
    }
    if (req.method === 'POST' && url.pathname.includes('/reply')) {
      return send({ code: 0, data: { message_id: 'om_ack_' + nextId++ } })
    }
    return send({ code: 0, data: {} })
  })
})

const port = await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(server.address().port))
})

const realFetch = globalThis.fetch
globalThis.fetch = (url, init) => realFetch(String(url).replace('https://open.feishu.cn', `http://127.0.0.1:${port}`), init)

// ── fake Harness context ──────────────────────────────────────────────────────
const listeners = new Map()
const services = {}
const ctx = {
  fiber: {},
  on(name, fn) {
    const list = listeners.get(name) ?? []
    list.push(fn)
    listeners.set(name, list)
    return () => {}
  },
  effect(fn) {
    const dispose = fn()
    return () => { if (typeof dispose === 'function') dispose() }
  },
  get(name) { return services[name] },
  inject(names, cb) {
    const child = { fiber: {}, effect: ctx.effect, get: ctx.get, on: ctx.on, inject: ctx.inject }
    for (const name of names) child[name] = services[name]
    cb(child)
    return () => {}
  },
}
const emit = (name, ...args) => {
  for (const fn of listeners.get(name) ?? []) fn(...args)
}

services.settings = { configure: () => () => {} }
services.webServer = { register: () => () => {} }
services.sessionQuery = {
  readTitleSnapshot: async (id) => ({
    session: { id, cwd: 'D:\\Code\\SSE' },
    title: id === SESSION ? { title: '飞书助手配置' } : undefined,
  }),
}
services.userQuestions = {
  answer: (agent, callId, answer) => {
    answered.push({ callId, answer })
    return true
  },
}
services.agents = {
  get: (id) => (id === SESSION ? { id, followup: (message) => delivered.push(message) } : undefined),
}

const config = {
  completionAudio: '',
  interactionAudio: '',
  soundEnabled: false,
  notificationEnabled: false,
  feishuEnabled: false,
  feishuWebhook: '',
  feishuBotEnabled: true,
  feishuAppId: APP.id,
  feishuAppSecret: APP.secret,
  feishuChatId: CHAT,
  feishuPollSeconds: 2,
}

apply(ctx, config)
const session = { id: SESSION }

// Give the plugin a task + result to summarise.
emit('session/event', session, { type: 'user/message', data: { content: [{ type: 'text', text: '帮我把单元测试补上' }] } })
// The skill catalogue arrives the same way; it must not become the task either.
emit('session/event', session, {
  type: 'user/message',
  data: {
    content: [{
      type: 'text',
      text: [
        '<system-reminder>',
        'A skill is a reusable set of task-specific instructions. The following skills are available in this session:',
        '',
        '<available_skills>',
        '- `agent-browser`: Browser automation CLI for AI agents. Use when the user needs to interact with websites.',
        '- `office`: Create, edit, inspect, or convert Office documents, spreadsheets, presentations, and PDFs.',
        '</available_skills>',
        '</system-reminder>',
      ].join('\n'),
    }],
  },
})
emit('session/event', session, {
  type: 'user/message',
  data: {
    content: [{
      type: 'text',
      text: [
        'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.',
        '',
        'Current working directory: "D:\\Code\\SSE".',
        'Current DSH file policy: danger-full-access. The DSH file sandbox does not restrict file modifications by available operations.',
        'Approval prompts are disabled in this session: actions that require approval are rejected automatically — do not request sandbox escalation (do not set `sandbox_permissions`).',
        '',
        'Current DeepSeek Harness implementation checkout: "D:\\Program Files\\DSH Desktop\\resources\\app.asar\\".',
        'Current DSH Harness Web GUI URL: "http://127.0.0.1:54078".',
      ].join('\n'),
    }],
  },
})
emit('session/event', session, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '已补 12 个用例，全部通过。' }] } } })
// The model the turn ran on, in the real payload shape:
// `{ header: EpochHeader, reason }` with the call config under `header.config`.
emit('session/event', session, { type: 'request/header', data: { header: { config: { provider: 'newapi', model: 'deepseek-flash' } }, reason: 'initial' } })

// ── phase 1: completion → card → quote reply → followup ──────────────────────
emit('agent/turn-stopping', { agent: { id: SESSION } })
emit('agent/status', { agent: { id: SESSION }, status: 'idle' })
await wait(400)

console.log('=== 1. 完成任务卡片 ===')
const cardCall = calls.find((c) => c.method === 'POST' && c.path.endsWith('/im/v1/messages'))
let hasModel = false
let hasTitle = false
let hasBadge = false
let hasCleanTask = false
console.log('  已发送:', cardCall !== undefined)
if (cardCall !== undefined) {
  const body = JSON.parse(cardCall.body)
  const flat = body.content
  console.log('  receive_id:', body.receive_id, '| msg_type:', body.msg_type, '| schema 2.0:', flat.includes('"schema":"2.0"'))
  console.log('  含任务/结果:', flat.includes('帮我把单元测试补上') && flat.includes('已补 12 个用例'))
  hasCleanTask = flat.includes('帮我把单元测试补上')
    && !flat.includes('Current runtime context')
    && !flat.includes('system-reminder')
    && !flat.includes('available_skills')
  console.log('  任务未混入注入内容:', hasCleanTask)
  console.log('  会话标签:', /会话 ([^·"]+·[^·"]+)/.exec(flat) ? RegExp.$1 : '(未找到)')
  hasTitle = flat.includes('"content":"飞书助手配置"')
  console.log('  标题=会话名:', hasTitle)
  hasBadge = flat.includes('🟢 **任务完成**') && flat.includes('SSE · #eade6582')
  console.log('  首行状态+工作区+短号:', hasBadge)
  hasModel = flat.includes('模型 newapi/deepseek-flash')
  console.log('  模型信息:', hasModel)
  console.log('  回复提示:', flat.includes('引用回复本条消息'))
}

queuedReplies.push({ parentId: sent[0].messageId, text: '#eade 继续跑剩下的测试' })
await wait(4500)

console.log('=== 2. 引用回复 → 送入会话 ===')
console.log('  投递条数:', delivered.length)
if (delivered.length > 0) {
  console.log('  role/source:', delivered[0].role, JSON.stringify(delivered[0].source))
  console.log('  内容:', JSON.stringify(delivered[0].content[0].text), '（#号已剥离）')
}
console.log('  回执请求:', calls.some((c) => c.method === 'POST' && c.path.includes('/reply')))

// ── phase 2: question card → quote reply → userQuestions.answer ──────────────
const beforeDelivered = delivered.length
emit('tools/pre-execute', {
  name: 'ask_user_question',
  callId: 'call_q1',
  agent: { id: SESSION },
  arguments: { questions: [{ id: 'q1', question: '要选哪个方案？', options: [{ label: '方案 A' }, { label: '方案 B' }] }] },
}, () => {})
await wait(400)

console.log('=== 3. 提问卡片 ===')
const questionCard = sent[sent.length - 1]
const questionBody = questionCard ? questionCard.content : ''
console.log('  已发送:', questionCard !== undefined, '| 含「直接回答这个问题」:', questionBody.includes('直接回答这个问题'))

queuedReplies.push({ parentId: questionCard.messageId, text: '方案 B' })
await wait(4500)

console.log('=== 4. 回复提问卡片 → 回答而非排队 ===')
console.log('  userQuestions.answer 调用:', answered.length)
if (answered.length > 0) {
  console.log('  callId:', answered[0].callId)
  console.log('  answers:', JSON.stringify(answered[0].answer))
}
console.log('  未误投为普通消息:', delivered.length === beforeDelivered)

// ── phase 5: open question in the waterfall → Feishu reply settles it ────────
console.log('=== 5. 瀑布回答者（open 状态提问）===')
const request = {
  questions: [{ id: 'q2', question: '再选一个？', options: [{ label: '方案 A' }, { label: '方案 B' }] }],
  agent: { id: SESSION },
  wait: { callId: 'call_q2' },
}
// The DSH UI never answers in this simulation, so only the Feishu reply can win.
const uiNeverAnswers = new Promise(() => {})
const handlers = listeners.get('user-questions/request') ?? []
console.log('  注册了回答者:', handlers.length > 0)
const raced = handlers[handlers.length - 1](request, () => uiNeverAnswers)

queuedReplies.push({ parentId: sent[sent.length - 1].messageId, text: '方案 B' })
await wait(4500)

const racedResult = await Promise.race([raced, wait(1500).then(() => null)])
console.log('  赛跑结果:', JSON.stringify(racedResult))
console.log('  飞书答案获胜:', racedResult !== null && racedResult.answers[0].selected[0] === '方案 B')

// ── dedupe: nothing is delivered twice ───────────────────────────────────────
const beforeDedupe = delivered.length
await wait(2500)
console.log('=== 6. 去重 ===')
console.log('  重复投递:', delivered.length > beforeDedupe ? '有 ❌' : '无 ✅')

globalThis.fetch = realFetch
server.close()

const pass = cardCall !== undefined
  && hasModel
  && hasTitle
  && hasBadge
  && hasCleanTask
  && delivered.length === beforeDelivered
  && beforeDelivered >= 1
  && answered.length === 1
  && answered[0].callId === 'call_q1'
  && answered[0].answer.answers[0].selected[0] === '方案 B'
  && racedResult !== null
  && racedResult.answers[0].selected[0] === '方案 B'
  && delivered.length === beforeDedupe
console.log('')
console.log('  状态目录（临时，已隔离）:', process.env.DSH_HOME)
console.log(pass ? 'SIMULATION PASSED' : 'SIMULATION FAILED')
process.exit(pass ? 0 : 1)
