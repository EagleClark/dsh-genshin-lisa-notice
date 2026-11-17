#!/usr/bin/env node
/**
 * End-to-end simulation of the Feishu assistant channel — no real Feishu, no
 * DSH: a local HTTP server impersonates open.feishu.cn and a minimal fake
 * context/agent stands in for the Harness.
 *
 * What it proves:
 *   1. a completion sends an interactive card via the bot (correct URL + body),
 *   2. the sent message_id is remembered as the route for that session,
 *   3. a quote-reply in the chat is polled, deduped and delivered through
 *      `agent.followup`, with the `#session` token stripped,
 *   4. the delivery is acknowledged back in Feishu.
 *
 * Run: node tools/simulate.mjs   (needs `npm install` once, for schemastery)
 */
import { createServer } from 'node:http'
import { apply } from '../lib/index.js'

const SESSION = 'eade6582-8234-4f9d-b631-0085bab1eac4'
const CHAT = 'oc_sim_chat'
const APP = { id: 'cli_sim', secret: 'sim-secret' }

const calls = []          // every request the plugin made to "Feishu"
const sent = []           // cards the bot sent
const delivered = []      // messages handed to agent.followup
let replyServed = false

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
      sent.push(parsed)
      return send({ code: 0, data: { message_id: 'om_bot_1' } })
    }
    if (req.method === 'GET' && url.pathname.endsWith('/im/v1/messages')) {
      if (sent.length === 0 || replyServed) return send({ code: 0, data: { items: [] } })
      replyServed = true
      // A human quote-replies to the card, with an explicit #session token too.
      return send({
        code: 0,
        data: {
          items: [
            {
              message_id: 'om_human_1',
              parent_id: 'om_bot_1',
              create_time: String(Date.now()),
              msg_type: 'text',
              deleted: false,
              sender: { sender_type: 'user', id: 'ou_someone' },
              body: { content: JSON.stringify({ text: '#eade 继续跑剩下的测试' }) },
            },
          ],
        },
      })
    }
    if (req.method === 'POST' && url.pathname.includes('/reply')) {
      return send({ code: 0, data: { message_id: 'om_ack_1' } })
    }
    return send({ code: 0, data: {} })
  })
})

const port = await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(server.address().port))
})

// Redirect every Feishu call the plugin makes to the local server.
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
    const child = {
      fiber: {},
      effect: ctx.effect,
      get: ctx.get,
      on: ctx.on,
      inject: ctx.inject,
    }
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
services.agents = {
  get: (id) => (id === SESSION ? { id, followup: (message) => delivered.push(message) } : undefined),
}

// ── drive the plugin ──────────────────────────────────────────────────────────
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Give the plugin a task + result to summarise.
emit('session/event', { id: SESSION }, {
  type: 'user/message', data: { content: [{ type: 'text', text: '帮我把单元测试补上' }] },
})
emit('session/event', { id: SESSION }, {
  type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '已补 12 个用例，全部通过。' }] } },
})

// A completed turn → the bot should send a card.
emit('agent/turn-stopping', { agent: { id: SESSION } })
emit('agent/status', { agent: { id: SESSION }, status: 'idle' })

await wait(300)
console.log('=== 1. 机器人发卡片 ===')
const sendCall = calls.find((c) => c.method === 'POST' && c.path.endsWith('/im/v1/messages'))
console.log('  发送请求存在:', sendCall !== undefined)
if (sendCall !== undefined) {
  const body = JSON.parse(sendCall.body)
  console.log('  receive_id:', body.receive_id, '| msg_type:', body.msg_type)
  const card = JSON.parse(body.content)
  console.log('  card schema:', card.schema, '| header:', card.header.title.content)
  const flat = body.content
  console.log('  含任务摘要:', flat.includes('帮我把单元测试补上'), '| 含结果:', flat.includes('已补 12 个用例'))
  console.log('  含回复提示:', flat.includes('引用回复本条消息'))
}

// Wait for two poll cycles: the first only sets the cursor, the second delivers.
await wait(4500)

console.log('=== 2. 拉取与投递 ===')
const listCalls = calls.filter((c) => c.method === 'GET' && c.path.endsWith('/im/v1/messages'))
console.log('  轮询次数:', listCalls.length)
console.log('  收到的回复被投递:', delivered.length === 1)
if (delivered.length > 0) {
  const message = delivered[0]
  console.log('  投递消息 role:', message.role, '| source:', JSON.stringify(message.source))
  console.log('  内容:', JSON.stringify(message.content[0].text))
  console.log('  #会话号已剥离:', message.content[0].text === '继续跑剩下的测试')
}
const ack = calls.find((c) => c.method === 'POST' && c.path.includes('/om_human_1/reply'))
console.log('  飞书回执已发送:', ack !== undefined)

// A second poll must not deliver the same message twice.
const before = delivered.length
await wait(2500)
console.log('=== 3. 去重 ===')
console.log('  重复投递:', delivered.length > before ? '有 ❌' : '无 ✅')

globalThis.fetch = realFetch
server.close()
console.log('')
const pass = sendCall !== undefined && delivered.length === 1 && ack !== undefined && delivered.length === before && delivered[0].content[0].text === '继续跑剩下的测试'
console.log(pass ? 'SIMULATION PASSED' : 'SIMULATION FAILED')
process.exit(pass ? 0 : 1)
