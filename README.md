# dsh-genshin-lisa-notice

DeepSeek Harness 插件：**每次执行完成播放音频提醒**，默认音频为**原神·丽莎**的语音；agent 向你提问、等待输入时也会提醒。  
A DeepSeek Harness plugin that **plays an audio alert when an execution completes — or when the agent asks for your input**; the default asset is a Genshin Impact Lisa voice line.

## 功能 / Features

- 任意会话的执行完成（回合即将关闭）时，在浏览器中播放一次音频提醒
- agent 调用提问工具（`ask_user_question`）向你请求输入时，同样播放提醒
- 两种提醒可分别配置音频：完成用 `assets/lisa-notice.mp3`，交互用 `assets/interaction.mp3`（未提供时交互复用完成音频）
- 多次完成会合并为一次播放，避免刷屏
- 音频素材随包分发，无需外部路径依赖
- Plays an alert per completed execution (any session) and when the agent asks for your input; bursts coalesce into a single playback. Completion and interaction sounds are configurable separately (`lisa-notice.mp3` / `interaction.mp3`); the audio assets ship inside the package.

## 安装 / Install

插件已发布在 [EagleClark/dsh-genshin-lisa-notice](https://github.com/EagleClark/dsh-genshin-lisa-notice)，通过 GitHub 安装：

```sh
dsh plugin --profile web add github:EagleClark/dsh-genshin-lisa-notice
```

（若已发布到 npm，也可 `dsh plugin --profile web add dsh-genshin-lisa-notice`。）

装完**重启 `dsh web`**，刷新页面生效（客户端 bundle 随启动图注入）。

## 工作原理 / How it works

| 端 | 职责 |
| --- | --- |
| Host (`lib/index.js`) | 监听 `agent/turn-stopping`（执行完成）与 `tools/pre-execute` 中的 `ask_user_question`（提问**分发时**触发，早于提问 UI 出现）；事件沿作用域链向上流动，根级插件可收到所有会话的事件。通过 `webServer` 提供 `/dsh-genshin-lisa-notice/alert.mp3`、`/interaction.mp3`（可选）与 `/dsh-genshin-lisa-notice/poll`（返回两类计数并清零） |
| Client (`client/client.js`) | 每 700ms 轮询 poll 端点，分别对完成/交互计数 `new Audio(...).play()`；首个用户手势解锁自动播放，被拦截的提醒在点击/按键时补播 |

## 更换音频 / Swap the audio

- 完成提醒：替换 `assets/lisa-notice.mp3`（保持文件名）
- 交互提醒（可选）：新增 `assets/interaction.mp3`；不提供时交互提醒复用完成音频

改完后重新提交/发布即可。

## 发布 / Publish

1. ✅ 源码仓库：https://github.com/EagleClark/dsh-genshin-lisa-notice
2. （可选）`npm publish` 发布到 npm（需先 `npm adduser` 登录）
3. 上架社区市场：向 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 提 PR，在列表加一条，收录后 dshmarket 即可一键安装

## 注意 / Notes

- 默认音频为原神·丽莎语音，版权归原版权方所有；仅供个人使用，公开分发前请确认素材使用许可（本仓库不保证素材可再分发）。
- 浏览器自动播放策略要求页面有过用户交互，首次执行完成后即可听到声音。
