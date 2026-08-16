# dsh-genshin-lisa-notice

DeepSeek Harness 插件：**每次执行完成播放音频提醒**（默认素材为刻晴——不，是丽莎——语音）。  
A DeepSeek Harness plugin that **plays an audio alert whenever an execution completes** (default asset: a Genshin Lisa voice line).

## 功能 / Features

- 任意会话的执行完成（回合即将关闭）时，在浏览器中播放一次音频提醒
- 多次完成会合并为一次播放，避免刷屏
- 音频素材随包分发，无需外部路径依赖
- Plays one alert per completed execution (any session); bursts coalesce into a single playback. The audio asset ships inside the package — no external path dependency.

## 安装 / Install

本地开发安装（当前 profile 为 `web`）：

```sh
dsh plugin --profile web add "file:D:\Code\SSE\dsh-genshin-lisa-notice"
```

或发布到 npm / GitHub 后：

```sh
dsh plugin --profile web add dsh-genshin-lisa-notice
```

装完**重启 `dsh web`**，刷新页面生效（客户端 bundle 随启动图注入）。

## 工作原理 / How it works

| 端 | 职责 |
| --- | --- |
| Host (`lib/index.js`) | 监听 `agent/turn-stopping`（事件沿作用域链向上流动，根级插件可收到所有会话的事件）；通过 `webServer` 提供 `/dsh-genshin-lisa-notice/alert.mp3`（读包内 `assets/lisa-notice.mp3`）与 `/dsh-genshin-lisa-notice/poll`（返回待播放计数并清零） |
| Client (`client/client.js`) | 每 700ms 轮询 poll 端点，拿到计数后 `new Audio(...).play()` |

## 更换音频 / Swap the audio

直接替换 `assets/lisa-notice.mp3`（保持文件名）后重新安装/发布即可。

## 发布 / Publish

1. 修改 `package.json` 的 `repository` 指向你的真实仓库（市场会校验 repository 指向同一仓库，防冒名）
2. `npm publish`（或推 GitHub 后用 `github:you/repo#path:/` 形式安装）
3. 上架社区市场：向 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 提 PR，在列表加一条，收录后 dshmarket 即可一键安装

## 注意 / Notes

- 音频素材版权归原版权方所有；若公开分发请确认素材的使用许可（本仓库不保证素材可再分发）。
- 浏览器自动播放策略要求页面有过用户交互，首次执行完成后即可听到声音。
