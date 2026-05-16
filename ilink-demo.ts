// ilink-demo.ts — 用 bun ilink-demo.ts 直接跑
const BASE = 'https://ilinkai.weixin.qq.com'

// 第一步：拿二维码
console.log('正在获取二维码...')
const qr = await fetch(`${BASE}/ilink/bot/get_bot_qrcode?bot_type=3`).then(
  (r) => r.json()
)
console.log(`请用 iOS 微信扫描这个链接生成的二维码：\n${qr.qrcode_img_content}`)

// 第二步：等扫码确认
console.log('等待扫码...')
let token = ''
while (true) {
  const status = await fetch(
    `${BASE}/ilink/bot/get_qrcode_status?qrcode=${qr.qrcode}`,
    {
      headers: { 'iLink-App-ClientVersion': '1' },
    }
  ).then((r) => r.json())

  if (status.status === 'confirmed') {
    token = status.bot_token
    console.log(`登录成功! bot_id: ${status.ilink_bot_id}`)
    break
  } else if (status.status === 'expired') {
    console.log('二维码过期了，重新运行吧')
    process.exit(1)
  } else if (status.status === 'scaned') {
    console.log('已扫码，请在微信上确认...')
  }
  await Bun.sleep(1000)
}

// 第三步：长轮询收消息 + 自动回复
console.log('开始监听消息...')
let syncBuf = ''
const headers = {
  Authorization: `Bearer ${token}`,
  AuthorizationType: 'ilink_bot_token',
  'Content-Type': 'application/json',
}

while (true) {
  try {
    const resp = await fetch(`${BASE}/ilink/bot/getupdates`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        get_updates_buf: syncBuf,
        base_info: { channel_version: '0.1.0' },
      }),
      signal: AbortSignal.timeout(40_000),
    }).then((r) => r.json())

    if (resp.get_updates_buf) syncBuf = resp.get_updates_buf

    for (const msg of resp.msgs ?? []) {
      if (msg.message_type !== 1) continue // 只处理用户消息
      const text = msg.item_list?.find((i: any) => i.type === 1)?.text_item
        ?.text
      if (!text) continue

      const sender = msg.from_user_id
      const ctx = msg.context_token ?? ''
      console.log(`收到消息: ${text} (from: ${sender})`)

      // 回复
      const reply = `收到你的消息：${text}`
      await fetch(`${BASE}/ilink/bot/sendmessage`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          msg: {
            to_user_id: sender,
            message_type: 2,
            message_state: 2,
            item_list: [{ type: 1, text_item: { text: reply } }],
            context_token: ctx,
          },
          base_info: { channel_version: '0.1.0' },
        }),
      })
      console.log(`已回复: ${reply}`)
    }
  } catch (e: any) {
    if (e.name === 'TimeoutError') continue
    console.log(`出错了: ${e.message}`)
    await Bun.sleep(2000)
  }
}
