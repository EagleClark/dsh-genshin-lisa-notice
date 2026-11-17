#!/usr/bin/env node
/**
 * Feishu assistant channel self-check for dsh-genshin-lisa-notice.
 *
 * Verifies the three things that actually break a self-built app, in order:
 *   1. App ID / App Secret → tenant_access_token
 *   2. the bot's chat list → is the bot really in that chat_id?
 *   3. send a test message, then read the chat back → send + read permissions
 *
 * Usage (PowerShell):
 *   $env:FEISHU_APP_ID="cli_xxx"; $env:FEISHU_APP_SECRET="xxx"; $env:FEISHU_CHAT_ID="oc_xxx"
 *   node tools/feishu-check.mjs
 *
 * Nothing here writes configuration; it only reports.
 */
import { createFeishuBot } from '../lib/feishu-bot.js'

const REMEDIES = {
  230027: '缺少权限：到「权限管理」开通 im:message:send_as_bot、im:message:readonly、im:message.group_msg，然后重新发布版本',
  230002: '机器人不在该群：把应用机器人拉进这个群',
  230006: '应用未开启机器人能力：「添加应用能力」里开启「机器人」',
  99991663: 'App ID / App Secret 不正确，或应用未发布',
  99991661: 'App Secret 不正确（去「凭证与基础信息」重新复制）',
  230013: '可用范围不包含你：应用发布里把可用范围设为你自己',
  10003: '参数错误：检查 chat_id 是否是 oc_ 开头',
}

const ok = (text) => console.log(`✅ ${text}`)
const bad = (text, code, msg, remedyOverride) => {
  console.log(`❌ ${text}`)
  if (msg) console.log(`   ${code !== undefined ? `[${code}] ` : ''}${msg}`)
  const remedy = remedyOverride !== undefined ? remedyOverride : (code !== undefined ? REMEDIES[code] : undefined)
  if (remedy) console.log(`   → ${remedy}`)
}

const appId = String(process.env.FEISHU_APP_ID || '').trim()
const appSecret = String(process.env.FEISHU_APP_SECRET || '').trim()
const chatId = String(process.env.FEISHU_CHAT_ID || '').trim()

if (appId === '' || appSecret === '' || chatId === '') {
  console.log('用法 / Usage（先设置三个环境变量）:')
  console.log('  $env:FEISHU_APP_ID="cli_xxx"')
  console.log('  $env:FEISHU_APP_SECRET="xxx"')
  console.log('  $env:FEISHU_CHAT_ID="oc_xxx"')
  console.log('  node tools/feishu-check.mjs')
  process.exit(2)
}

console.log('飞书助手连通性自检 / Feishu assistant self-check')
console.log(`  app_id : ${appId.slice(0, 8)}…`)
console.log(`  chat_id: ${chatId}`)
console.log('')

// 1. token
let token = ''
try {
  token = await createFeishuBot({ appId, appSecret, chatId }).accessToken()
  ok(`tenant_access_token 获取成功（${token.slice(0, 6)}…）`)
} catch (error) {
  bad('tenant_access_token 获取失败', error.feishuCode, error.message,
    'App ID / App Secret 不正确，或应用版本未发布：去「凭证与基础信息」重新复制，并在「版本管理与发布」创建并发布版本')
  process.exit(1)
}

// 2. chat membership
try {
  const response = await fetch('https://open.feishu.cn/open-apis/im/v1/chats?page_size=50', {
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' },
  })
  const json = await response.json().catch(() => ({}))
  if (json.code !== 0) {
    bad('读取机器人所在群列表失败', json.code, json.msg)
  } else {
    const items = Array.isArray(json.data && json.data.items) ? json.data.items : []
    const hit = items.find((item) => item && item.chat_id === chatId)
    if (hit !== undefined) {
      ok(`机器人在该群：「${hit.name || '(无名称)'}」（共 ${items.length} 个群）`)
    } else {
      bad(`机器人不在 chat_id=${chatId} 这个群里`, 230002)
      if (items.length > 0) {
        console.log('   机器人目前在这些群里（可以直接复制 chat_id）:')
        for (const item of items.slice(0, 10)) console.log(`     ${item.chat_id}   ${item.name || ''}`)
      }
    }
  }
} catch (error) {
  bad('读取群列表异常', undefined, error.message)
}

// 3. send + read back
const bot = createFeishuBot({ appId, appSecret, chatId })
let sentId = ''
try {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const sent = await bot.send({ msgType: 'text', content: { text: `dsh-genshin-lisa-notice 连通性自检 ${stamp}` } })
  sentId = sent.messageId
  ok(`测试消息发送成功（message_id ${sentId.slice(0, 10)}…）`)
} catch (error) {
  bad('测试消息发送失败', error.feishuCode, error.message)
}

try {
  const items = await bot.list({ pageSize: 10 })
  ok(`读取群消息成功（最近 ${items.length} 条）`)
  if (sentId !== '' && items.some((item) => item && item.message_id === sentId)) {
    ok('刚发的测试消息能被读到 → 读权限正常')
  }
  const humans = items.filter((item) => item && item.sender && item.sender.sender_type === 'user')
  console.log(`   其中真人消息 ${humans.length} 条（插件只会处理这类）`)
} catch (error) {
  bad('读取群消息失败（回复功能依赖它）', error.feishuCode, error.message)
}

console.log('')
console.log('全部通过后，把这三项填进插件卡片并打开「飞书助手（可回复）」即可。')
