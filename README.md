# dsh-genshin-lisa-notice

DeepSeek Harness 插件：**每次执行完成播放音频提醒**，默认音频为**原神·丽莎**的语音；agent 向你提问、等待输入时也会提醒。  
A DeepSeek Harness plugin that **plays an audio alert when an execution completes — or when the agent asks for your input**; the default asset is a Genshin Impact Lisa voice line.

## 关于名字 / About the name

插件名叫 `dsh-genshin-lisa-notice`（即 lisa-notice）。**最初只是想用原神·丽莎的语音做个单纯的"执行完成提醒"**，所以按角色名（Lisa）起了名。后来一个版本一个版本地迭代，功能越来越多：加了交互提醒、配置文件、下拉选择内置语音库、自定义音频上传……但**懒得改名字了**，就一直沿用至今。名字里的 `lisa` 更多是个"起源彩蛋"，并不代表现在只支持丽莎这一个语音。

The package is named `dsh-genshin-lisa-notice` (i.e. `lisa-notice`). It **started as a plain "execution-complete reminder" using Genshin Impact Lisa's voice**, named after that character. Over many releases the scope grew — interaction alerts, a settings page, a built-in voice library with a dropdown, custom audio upload — but the name stuck because **renaming it was never worth the churn**. The `lisa` in the name is now more of an origin easter egg than a statement that only Lisa's voice is supported.

## 功能 / Features

- 任意会话的执行完成（回合即将关闭）时，在浏览器中播放一次音频提醒
- agent 调用提问工具（`ask_user_question`）向你请求输入时，同样播放提醒
- 两种提醒**可分别配置语音**：内置语音库（完成默认"丽莎姐姐聊聊天"、交互默认"罗莎莉亚不加班"，另有兹白·无须言语 / 罗莎莉亚·还不走吗 / 胡桃·晒太阳月亮歌）在 **设置 → 插件 → 配置** 里**下拉选择**，也可一键恢复默认
- 也支持**上传自定义音频**（显示原文件名），并可随时回退到内置语音
- 多次完成会合并为一次播放，避免刷屏
- 音频素材随包分发，无需外部路径依赖
- Plays an alert per completed execution (any session) and when the agent asks for your input; bursts coalesce into a single playback. Completion and interaction voices are selectable separately from a built-in library (defaults: "丽莎姐姐聊聊天" / "罗莎莉亚不加班") via a dropdown, plus custom upload; the audio assets ship inside the package.

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
| Host (`lib/index.js`) | 监听 `agent/turn-stopping`（执行完成）与 `tools/pre-execute` 中的 `ask_user_question`（提问**分发时**触发，早于提问 UI 出现）；事件沿作用域链向上流动，根级插件可收到所有会话的事件。注册 `dsh-genshin-lisa-notice` 设置命名空间（自定义音频路径，实时生效）。通过 `webServer` 提供 `/dsh-genshin-lisa-notice/alert.mp3`、`/interaction.mp3`（按配置读取音频）与 `/dsh-genshin-lisa-notice/poll`（返回两类计数并清零） |
| Client (`client/client.js`) | 每 700ms 轮询 poll 端点，分别对完成/交互计数 `new Audio(...).play()`；首个用户手势解锁自动播放，被拦截的提醒在点击/按键时补播。注册 **设置 → 插件 → 配置** 卡片（自定义语音 + 恢复默认） |

## 配置 / Configuration

打开 **设置 → 插件 → 配置**，展开 **Genshin通知提醒** 卡片（默认折叠）：

- **完成提醒语音** / **交互提醒语音**：各一个**下拉框**，内置语音可自由选择：
  - 丽莎姐姐聊聊天（完成默认）
  - 罗莎莉亚不加班（交互默认）
  - 兹白·无须言语 / 罗莎莉亚·还不走吗 / 胡桃·晒太阳月亮歌（附加）
- 下拉选「自定义音频…」可上传自己的 mp3（显示原文件名）
- 点「确认」生效并立即播放；「取消」丢弃未确认的选择；「恢复默认」回到包内默认语音
- 自定义上传的文件保存在 `$DSH_HOME/data/dsh-genshin-lisa-notice/`

## 更换音频 / Swap the audio

- 内置语音：把 mp3 放进 `assets/`（文件名即下拉选项的 key，`-` 会显示为 `·`），重新提交/发布即可
- 只改本机：用上面的配置界面**下拉选择内置语音**或**上传自定义音频**，无需改包

## 发布 / Publish

1. ✅ 源码仓库：https://github.com/EagleClark/dsh-genshin-lisa-notice
2. （可选）`npm publish` 发布到 npm（需先 `npm adduser` 登录）
3. 上架社区市场：向 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 提 PR，在列表加一条，收录后 dshmarket 即可一键安装

## 注意 / Notes

- 默认音频为原神·丽莎语音，版权归原版权方所有；仅供个人使用，公开分发前请确认素材使用许可（本仓库不保证素材可再分发）。
- 浏览器自动播放策略要求页面有过用户交互，首次执行完成后即可听到声音。
