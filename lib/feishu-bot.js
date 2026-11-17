/**
 * Feishu (Lark) app-bot channel for dsh-genshin-lisa-notice.
 *
 * Two halves, both plain HTTPS — no SDK:
 *  - send:    tenant_access_token → im/v1/messages (chat_id) → message_id
 *  - receive: poll im/v1/messages for that chat and pick up human replies
 *
 * The routing key is the `message_id` of the notification we sent: a
 * quote-reply carries it as `parent_id` (or `root_id`), so the poller can tell
 * which session a human answered.
 *
 * Kept out of index.js so the payload shapes can be exercised without booting
 * a plugin.
 */

const BASE = 'https://open.feishu.cn/open-apis'

/** tenant_access_token is valid ~2h; refresh with margin. */
const TOKEN_TTL_MS = 90 * 60 * 1000

/** Strip the `@_user_1` placeholders Feishu leaves for mentions. */
export const stripMentions = (text) => String(text ?? '').replace(/@_user_\d+/g, '').replace(/[ \t]{2,}/g, ' ').trim()

/**
 * Best-effort plain text of one chat message.
 * `text` messages carry `{ text }`; rich-text `post` messages carry a block list.
 */
export const messageText = (item) => {
  const raw = item && item.body && typeof item.body.content === 'string' ? item.body.content : ''
  if (raw === '') return ''
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return ''
  }
  if (body && typeof body.text === 'string') return stripMentions(body.text)
  // Rich text: { title, content: [[{ tag, text }]] }
  if (body && Array.isArray(body.content)) {
    const lines = []
    for (const paragraph of body.content) {
      if (!Array.isArray(paragraph)) continue
      const line = paragraph.map((node) => (node && typeof node.text === 'string' ? node.text : '')).join('')
      if (line.trim() !== '') lines.push(line.trim())
    }
    return stripMentions(lines.join('\n'))
  }
  return ''
}

/**
 * Decide which session a chat message belongs to.
 *
 * Order of precedence:
 *  1. an explicit `#<session-id-prefix>` written in the message,
 *  2. the notification the message quotes (`parentId`/`rootId`),
 *  3. the chat's most recently notified session.
 *
 * Returns `{ sessionId, reason }`, or `null` when nothing matches.
 */
export const pickRoute = ({ text = '', parentId = '', rootId = '', routes, lastRoute } = {}) => {
  const candidates = new Set()
  if (routes && typeof routes.values === 'function') {
    for (const entry of routes.values()) if (entry && typeof entry.sessionId === 'string') candidates.add(entry.sessionId)
  }
  if (lastRoute && typeof lastRoute.sessionId === 'string') candidates.add(lastRoute.sessionId)

  const explicit = /#([0-9a-f]{4,36})/i.exec(String(text))
  if (explicit !== null) {
    const prefix = explicit[1].toLowerCase()
    for (const id of candidates) {
      if (id.toLowerCase().startsWith(prefix)) return { sessionId: id, reason: 'explicit' }
    }
  }

  const quoted = typeof parentId === 'string' && parentId !== '' ? parentId : (typeof rootId === 'string' ? rootId : '')
  if (quoted !== '' && routes && typeof routes.get === 'function') {
    const hit = routes.get(quoted)
    if (hit && typeof hit.sessionId === 'string' && hit.sessionId !== '') {
      return { sessionId: hit.sessionId, reason: 'quote' }
    }
  }

  if (lastRoute && typeof lastRoute.sessionId === 'string' && lastRoute.sessionId !== '') {
    return { sessionId: lastRoute.sessionId, reason: 'recent' }
  }
  return null
}

/** Remove a `#<session-prefix>` targeting token before handing text to the model. */
export const stripTargetToken = (text) => String(text ?? '').replace(/#[0-9a-f]{4,36}\s*/gi, '').trim() || String(text ?? '').trim()

export const createFeishuBot = ({ appId, appSecret, chatId, fetchImpl = fetch, now = () => Date.now() }) => {  let token = ''
  let tokenAt = 0

  const request = async (path, { method = 'GET', body, auth = true, query } = {}) => {
    const url = new URL(BASE + path)
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
      }
    }
    const headers = { 'content-type': 'application/json; charset=utf-8' }
    if (auth) headers.authorization = `Bearer ${await accessToken()}`
    const response = await fetchImpl(url.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    let json
    try {
      json = text === '' ? {} : JSON.parse(text)
    } catch {
      json = { code: -1, msg: text.slice(0, 300) }
    }
    if (!response.ok || (typeof json.code === 'number' && json.code !== 0)) {
      const error = new Error(`feishu ${path} failed: ${json.msg || response.status}`)
      error.feishuCode = json.code
      error.status = response.status
      throw error
    }
    return json.data === undefined ? json : json.data
  }

  const accessToken = async () => {
    if (token !== '' && now() - tokenAt < TOKEN_TTL_MS) return token
    const data = await request('/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      auth: false,
      body: { app_id: appId, app_secret: appSecret },
    })
    token = typeof data.tenant_access_token === 'string' ? data.tenant_access_token : ''
    tokenAt = now()
    if (token === '') throw new Error('feishu: empty tenant_access_token')
    return token
  }

  return {
    accessToken,
    /** Send one message to the configured chat; returns its message_id. */
    async send({ msgType, content }) {
      const data = await request('/im/v1/messages', {
        method: 'POST',
        query: { receive_id_type: 'chat_id' },
        body: {
          receive_id: chatId,
          msg_type: msgType,
          content: typeof content === 'string' ? content : JSON.stringify(content),
        },
      })
      return {
        messageId: data && typeof data.message_id === 'string' ? data.message_id : '',
        raw: data,
      }
    },
    /** One page of chat history, newest first. */
    async list({ startTimeSec, pageSize = 20 } = {}) {
      const data = await request('/im/v1/messages', {
        query: {
          container_id_type: 'chat',
          container_id: chatId,
          start_time: startTimeSec,
          sort_type: 'ByCreateTimeDesc',
          page_size: pageSize,
        },
      })
      return data && Array.isArray(data.items) ? data.items : []
    },
    /** Reply under one message, keeping the thread context inside Feishu. */
    async reply(parentId, { msgType = 'text', content }) {
      return request(`/im/v1/messages/${parentId}/reply`, {
        method: 'POST',
        body: {
          msg_type: msgType,
          content: typeof content === 'string' ? content : JSON.stringify(content),
        },
      })
    },
  }
}
