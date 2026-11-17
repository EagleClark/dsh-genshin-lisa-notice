#!/usr/bin/env node
/**
 * Read the assistant chat and print recent messages, including the text of
 * interactive cards (so a plugin-built card can be inspected end to end).
 *
 * Usage (PowerShell):
 *   $env:FEISHU_APP_ID="cli_xxx"; $env:FEISHU_APP_SECRET="xxx"; $env:FEISHU_CHAT_ID="oc_xxx"
 *   node tools/feishu-read.mjs [count]
 */
import { createFeishuBot, messageText } from '../lib/feishu-bot.js'

const appId = String(process.env.FEISHU_APP_ID || '').trim()
const appSecret = String(process.env.FEISHU_APP_SECRET || '').trim()
const chatId = String(process.env.FEISHU_CHAT_ID || '').trim()
const count = Math.min(20, Math.max(1, Number(process.argv[2]) || 5))

if (appId === '' || appSecret === '' || chatId === '') {
  console.log('用法: 先设置 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_CHAT_ID')
  process.exit(2)
}

const bot = createFeishuBot({ appId, appSecret, chatId })
const token = await bot.accessToken()

// `card_msg_content_type=user_card_content` returns the card JSON as sent,
// which is the only way to read a card's own text back.
const url = new URL('https://open.feishu.cn/open-apis/im/v1/messages')
url.searchParams.set('container_id_type', 'chat')
url.searchParams.set('container_id', chatId)
url.searchParams.set('sort_type', 'ByCreateTimeDesc')
url.searchParams.set('page_size', String(count))
url.searchParams.set('card_msg_content_type', 'user_card_content')

const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
const json = await response.json()
if (json.code !== 0) {
  console.log(`读取失败 [${json.code}] ${json.msg}`)
  process.exit(1)
}

const items = json.data && Array.isArray(json.data.items) ? json.data.items : []
console.log(`最近 ${items.length} 条（新→旧）:`)
for (const item of items) {
  const who = item.sender && item.sender.sender_type === 'user' ? '👤 用户' : (item.sender && item.sender.sender_type === 'app' ? '🤖 机器人' : '?')
  const time = new Date(Number(item.create_time)).toISOString().replace('T', ' ').slice(0, 19)
  console.log(`\n── ${time}  ${who}  ${item.msg_type}  ${item.message_id}`)
  if (item.parent_id) console.log(`   引用: ${item.parent_id}`)
  const text = messageText(item)
  if (text !== '') console.log(`   文本: ${text}`)
  if (item.msg_type === 'interactive') {
    let card
    try {
      card = JSON.parse(item.body.content)
    } catch {
      card = null
    }
    if (card === null) {
      console.log('   卡片: (无法解析)')
      continue
    }
    if (card.header && card.header.title) console.log(`   标题: ${card.header.title.content}`)
    const walk = (elements) => {
      for (const element of elements || []) {
        if (!element) continue
        if (element.tag === 'markdown' && typeof element.content === 'string') {
          console.log(`   正文: ${element.content.replace(/\n/g, ' / ')}`)
        } else if (element.tag === 'table') {
          console.log(`   表格: ${(element.columns || []).length} 列 × ${(element.rows || []).length} 行`)
        } else if (Array.isArray(element.elements)) {
          walk(element.elements)
        }
      }
    }
    walk(card.body && card.body.elements)
  }
}
