/**
 * Feishu/Lark interactive-card builder for dsh-genshin-lisa-notice.
 *
 * The card uses **Card JSON 2.0** (`schema: "2.0"`): only that schema renders a
 * markdown table as a real table, thanks to its native `table` element. Text
 * blocks become `markdown` elements, tables become `table` elements, and the
 * payload is kept as complete as the webhook's body limit allows.
 *
 * Documented limits this module honours:
 * - webhook body ≤ 30 KB (budgeted below at 26 KB),
 * - at most 5 table elements per card, at most 50 columns per table,
 * - `page_size` 1–10 rows per page.
 *
 * Kept separate from `index.js` so the exact payload the plugin posts can be
 * produced (and inspected) without booting a plugin.
 */

/** The webhook rejects a body over 30 KB; stay clear of it. */
export const FEISHU_BODY_LIMIT = 26000
/** Character caps before the byte budget starts shrinking anything. */
export const FEISHU_TASK_CHARS = 1200
export const FEISHU_BODY_CHARS = 6000
/** Card 2.0 allows five table elements per card. */
const MAX_TABLES = 5
/** `page_size` accepts 1–10. */
const PAGE_SIZE = 10
const MAX_COLUMNS = 50

/** Terminal display width: CJK and emoji occupy two cells, joiners none. */
export const displayWidth = (s) => {
  let w = 0
  for (const ch of s) {
    const c = ch.codePointAt(0)
    if (c === 0xfe0e || c === 0xfe0f || c === 0x200d) continue
    w += ((c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3)
      || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe6f) || (c >= 0xff00 && c <= 0xff60)
      || (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x2600 && c <= 0x27bf) || (c >= 0x2b00 && c <= 0x2bff)
      || (c >= 0x1f000 && c <= 0x1faff)) ? 2 : 1
  }
  return w
}
const padTo = (s, w) => s + ' '.repeat(Math.max(0, w - displayWidth(s)))
const parseCells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
const isTableSep = (line) => {
  const t = line.trim()
  return t !== '' && /^[|\s:-]+$/.test(t) && t.includes('-')
}
const isTableRow = (line) => line.trim() !== '' && line.includes('|')

/** Split a body into text and table blocks, leaving fenced source untouched. */
export const splitFeishuBlocks = (text) => {
  const lines = String(text ?? '').split('\n')
  const blocks = []
  const buffer = []
  let fenced = false
  const flush = () => {
    const t = buffer.join('\n').trim()
    buffer.length = 0
    if (t !== '') blocks.push({ type: 'text', text: t })
  }
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^\s*```/.test(line)) {
      fenced = !fenced
      buffer.push(line)
      continue
    }
    if (!fenced && isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const rows = []
      let j = i
      while (j < lines.length && isTableRow(lines[j])) {
        rows.push(lines[j])
        j += 1
      }
      // rows[1] is the separator; the rest are header + body cells.
      const cells = rows.filter((_, index) => index !== 1).map(parseCells)
      if (cells.length > 0) {
        flush()
        blocks.push({ type: 'table', rows: cells })
      }
      i = j - 1
      continue
    }
    buffer.push(line)
  }
  flush()
  return blocks
}

/** ATX headings are not part of the markdown subset; bold reads as a heading. */
export const boldHeadings = (text) => String(text ?? '').split('\n').map((line) => {
  const heading = /^\s{0,3}#{1,6}\s+(.*\S)\s*$/.exec(line)
  return heading ? '**' + heading[1] + '**' : line
}).join('\n')

const columnWidths = (rows) => {
  const columns = Math.min(MAX_COLUMNS, rows.reduce((max, row) => Math.max(max, row.length), 0))
  const widths = new Array(columns).fill(1)
  for (const row of rows) {
    for (let c = 0; c < columns; c += 1) widths[c] = Math.max(widths[c], displayWidth(row[c] ?? ''))
  }
  return widths
}

/**
 * A markdown table as a Card 2.0 native `table` element: a real grid with a
 * header band, per-column auto width, and client-side paging.
 */
export const markdownTableToTable = (rows) => {
  const header = (rows[0] ?? []).slice(0, MAX_COLUMNS)
  const columns = header.map((name, index) => ({
    name: 'c' + index,
    display_name: name === '' ? undefined : name,
    data_type: 'text',
    width: 'auto',
    vertical_align: 'top',
    horizontal_align: 'left',
  }))
  const out = rows.slice(1).map((cells) => {
    const row = {}
    for (let c = 0; c < columns.length; c += 1) row['c' + c] = cells[c] ?? ''
    return row
  })
  return {
    tag: 'table',
    page_size: PAGE_SIZE,
    row_height: 'auto',
    header_style: { text_align: 'left', text_size: 'normal', background_style: 'grey', text_color: 'default', bold: true, lines: 1 },
    columns,
    rows: out,
  }
}

/** Compact fallback for a table over the per-card table budget. */
export const tableToCodeBlock = (rows) => {
  const widths = columnWidths(rows)
  const render = (row) => '| ' + widths.map((w, c) => padTo(row[c] ?? '', w)).join(' | ') + ' |'
  const lines = ['```', render(rows[0] ?? []), '| ' + widths.map((w) => '-'.repeat(Math.max(1, w))).join(' | ') + ' |']
  for (let r = 1; r < rows.length; r += 1) lines.push(render(rows[r]))
  lines.push('```')
  return lines.join('\n')
}

const pad2 = (n) => String(n).padStart(2, '0')
const stampOf = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
const take = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s)

const markdownEl = (content) => ({ tag: 'markdown', content })

/** Human-readable cause for one failed model-request code. */
const codeHeadline = (code) => {
  const c = String(code ?? '').toLowerCase()
  if (c === '') return ''
  if (c.includes('network') || c.includes('econn') || c.includes('socket') || c.includes('dns')) return '网络异常，无法连接模型服务'
  if (c.includes('timeout') || c.includes('timed')) return '请求超时'
  if (c.includes('auth') || c.includes('unauthor') || c.includes('forbidden') || c.includes('key')) return '鉴权失败（API Key 无效、过期或无权限）'
  if (c.includes('rate') || c.includes('limit')) return '请求过于频繁，被服务方限流'
  if (c.includes('quota') || c.includes('balance') || c.includes('insufficient') || c.includes('billing') || c.includes('credit')) return '账户余额不足或需要充值'
  if (c.includes('server') || c.includes('overload') || c.includes('unavailable')) return '模型服务端错误（服务暂时不可用）'
  return ''
}

/** Human-readable cause for one HTTP status. */
const statusHeadline = (status) => {
  if (status === 402) return '账户余额不足或需要充值'
  if (status === 401 || status === 403) return '鉴权失败（API Key 无效、过期或无权限）'
  if (status === 429) return '请求过于频繁，被服务方限流'
  if (status === 408) return '请求超时'
  if (status >= 500) return '模型服务端错误（服务暂时不可用）'
  if (status >= 400) return '请求被拒绝'
  return ''
}

/**
 * Turn a failure (an `LlmFailure` captured from `agent/request-error`, or the
 * raw `agent/error` payload) into the few lines a notification can show.
 */
export const describeFailure = ({ failure, error } = {}) => {
  const status = failure && typeof failure.status === 'number' ? failure.status : undefined
  const code = failure && typeof failure.code === 'string' ? failure.code : ''
  const message = failure && typeof failure.message === 'string' ? failure.message : ''
  const lines = []
  const headline = status !== undefined ? statusHeadline(status) : codeHeadline(code)
  if (status !== undefined) lines.push(`HTTP ${status}` + (headline === '' ? '' : ` — ${headline}`))
  else if (headline !== '') lines.push(headline)
  if (code !== '') lines.push(`错误码：${code}`)
  if (message !== '') lines.push(`原始信息：${message}`)
  if (lines.length === 0 && error !== undefined && error !== null) {
    const text = typeof error === 'string'
      ? error
      : (error && typeof error.message === 'string' ? error.message : '')
    if (text !== '') lines.push(text)
    else {
      try {
        lines.push(JSON.stringify(error))
      } catch {
        lines.push(String(error))
      }
    }
  }
  return lines.join('\n')
}

/**
 * Build the exact webhook payload for one notification.
 *
 * @returns `{ payload, fallback, mode, chars }` where `payload` is the Card 2.0
 * JSON (already byte-fitted), `fallback` the plain-text body to use if Feishu
 * refuses the card, `mode` whether tables stayed native (`table`) or fell back
 * to code blocks (`code`).
 */
export const buildFeishuCard = ({
  kind,
  task = '',
  result = '',
  question = '',
  failure = '',
  sessionId = '',
  limit = FEISHU_BODY_LIMIT,
  now = new Date(),
} = {}) => {
  const interaction = kind === 'interaction'
  const failed = kind === 'failure'
  const bodyLabel = failed ? '失败原因' : interaction ? '问题' : '结果'
  const bodySource = (failed ? failure : interaction ? question : result) || ''
  const title = failed ? '⚠️ 任务失败' : interaction ? '💬 需要你的输入' : '✅ 任务完成'
  const headerTemplate = failed ? 'red' : interaction ? 'orange' : 'green'
  const footer = ['dsh-genshin-lisa-notice',
    sessionId !== '' ? `会话 ${sessionId.slice(0, 8)}` : '',
    stampOf(now)].filter(Boolean).join(' · ')

  let taskChars = FEISHU_TASK_CHARS
  let bodyChars = FEISHU_BODY_CHARS
  let mode = 'table'

  const renderBody = (text) => {
    const elements = []
    let tables = 0
    for (const block of splitFeishuBlocks(text)) {
      if (block.type === 'text') {
        const fixed = boldHeadings(block.text)
        if (fixed !== '') elements.push(markdownEl(fixed))
        continue
      }
      // Only the first few tables fit the per-card budget; the rest stay code.
      if (mode === 'code' || tables >= MAX_TABLES) {
        elements.push(markdownEl(tableToCodeBlock(block.rows)))
      } else {
        elements.push(markdownTableToTable(block.rows))
        tables += 1
      }
    }
    return elements
  }

  const build = () => {
    const taskText = take(task.trim(), taskChars)
    const bodyText = take(bodySource.trim(), bodyChars)
    const elements = []
    if (taskText !== '') {
      elements.push(markdownEl('**任务**'))
      elements.push(...renderBody(taskText))
    }
    if (taskText !== '' && bodyText !== '') elements.push({ tag: 'hr' })
    if (bodyText !== '') {
      elements.push(markdownEl(`**${bodyLabel}**`))
      elements.push(...renderBody(bodyText))
    }
    if (elements.length === 0) elements.push(markdownEl(failed ? '未捕获到具体错误信息' : interaction ? '请查看 DeepSeek Harness' : '（无摘要）'))
    elements.push(markdownEl(footer))
    return JSON.stringify({
      msg_type: 'interactive',
      card: {
        schema: '2.0',
        header: { template: headerTemplate, title: { tag: 'plain_text', content: title } },
        body: { elements },
      },
    })
  }

  let payload = build()
  // Native tables cost more JSON than code blocks; if that alone blows the
  // budget, degrade every table before shrinking any content.
  if (Buffer.byteLength(payload) > limit) {
    mode = 'code'
    payload = build()
  }
  for (let guard = 0; guard < 64 && Buffer.byteLength(payload) > limit; guard += 1) {
    if (bodyChars <= 200 && taskChars <= 120) break
    if (bodyChars >= taskChars) bodyChars = Math.max(200, Math.floor(bodyChars * 0.75))
    else taskChars = Math.max(120, Math.floor(taskChars * 0.75))
    payload = build()
  }

  const text = [title,
    task.trim() !== '' ? '任务：' + take(task.trim(), 2000) : '',
    bodySource.trim() !== '' ? bodyLabel + '：' + take(bodySource.trim(), 8000) : '',
    footer].filter(Boolean).join('\n')
  const fallback = JSON.stringify({ msg_type: 'text', content: { text } })

  return { payload, fallback, mode, chars: { taskChars, bodyChars } }
}
