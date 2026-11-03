# 儿童英语平台：GitHub 开源项目研究

核查日期：2026-11-03。通过 GitHub 插件搜索仓库，并读取 GitHub REST API、项目 README 和 LICENSE。Star 是查询时快照，会继续变化；最近推送只表明代码活动时间，不代表质量、教学效果或持续维护承诺。

## 选择原则

目标用户是已经学过一年英语、觉得朗读和记用法吃力的小学二年级孩子。优先评估能支持听懂情境、获得小成功、自愿开口和少量复习的机制。Star 用于发现成熟项目，不作为儿童适用性或学习效果的证据。

## 高 Star 候选项目

| 项目 | Star 快照 | 授权 | 最近推送（UTC 日期） | 可借鉴内容 | 对当前孩子的局限与采用建议 |
| --- | ---: | --- | --- | --- | --- |
| [Anki](https://github.com/ankitects/anki) | 32,501 | AGPL-3.0-or-later；部分文件另有许可 | 2026-11-03 | 间隔复习、主动回忆、图片和音频卡片 | 全年龄记忆工具，默认使用方式需要较强自律。借鉴复习机制，不直接搬背卡界面。 |
| [Qwerty Learner](https://github.com/RealKai42/qwerty-learner) | 23,674 | GPL-3.0 | 2026-09-08 | React 实现、发音、词库组织、默写和即时反馈 | README 明确面向键盘工作者。打字速度、输错重打、成人考试词库不适合作为二年级首要任务；只借鉴清晰反馈与练习颗粒度。 |
| [Earthworm](https://github.com/cuixueshe/earthworm) | 11,190 | AGPL-3.0 | 2024-11-14 | 从短语逐步构造句子，练习放进句子里的表达 | 整套依赖 Postgres、Redis、Docker 等服务；查询时最新推送距今较久。借鉴循序搭句，不作为家庭首版底座。 |
| [LibreLingo](https://github.com/kantord/LibreLingo) | 2,629 | AGPL-3.0；课程及美术另核查 | 2026-06-19 | 互动练习、结构化课程、间隔复习和进度记录 | API 显示已归档，README 明确作者不再维护。适合研究数据结构和交互，不建议作为新项目直接依赖。 |
| [Lute v3](https://github.com/luteorg/lute-v3) | 1,603 | MIT | 2026-09-05 | 在阅读中遇词、标记熟悉程度；Python / Flask 技术实现 | 对独立阅读能力要求较高。可以借鉴故事中复现词汇的设计；当前阶段以听音和图片为主。 |
| [HiKid](https://github.com/xiaochong/hi-kid) | 1,172 | LICENSE 和 API 写 MIT；README 有额外限制，见下文 | 2026-04-24 | 面向非英语母语儿童的语音伙伴、故事、词游戏；本地 ASR → LLM → TTS | 当前 README 明确仅支持 macOS，Windows / Linux 尚在计划中；需要本地语音和模型服务。授权表述存在冲突，先参考交互，不直接复制代码、美术或模型资源。 |
| [Kolibri](https://github.com/learningequality/kolibri) | 1,167 | MIT | 2026-11-02 | 离线优先、课程组织和学习记录 | 是通用教育平台，不是现成儿童英语课程。对一个孩子的首版偏重；可借鉴离线与记录可靠性。 |

## Star 较少、复用价值较高的补充

| 项目 | Star 快照 | 授权 / 最近推送 | 适用场景与限制 |
| --- | ---: | --- | --- |
| [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | 850 | MIT / 2026-10-29 | TypeScript 间隔复习工具包，适合后续需要自适应调度时评估。当前主线 README 为 v6 / FSRS-7，要求 Node.js ≥24，API 使用 `await DefaultScheduler()`。版本和 API 需按实际安装版本验证。 |
| [H5P Interactive Video](https://github.com/h5p/h5p-interactive-video) | 266 | MIT / 2026-10-28 | 在视频上加入任务、文字和媒体。有适龄且授权明确的视频资源后，再评估集成成本。不能把所有 H5P 组件统称为 MIT。 |
| [H5P PHP Library](https://github.com/h5p/h5p-php-library) | 154 | GPL-3.0 / 2026-11-02 | 属于 H5P 核心集成层，并非直接可用的儿童学习应用。与 MIT 的 Interactive Video 组件授权不同。 |

## 授权核查中的重要发现

- **Anki**：GitHub API 自动识别结果是 `Other / NOASSERTION`；实际 [LICENSE](https://github.com/ankitects/anki/blob/main/LICENSE) 写明主体为 AGPL 第 3 版或以后版本，另列有其他许可文件。不能仅依据自动字段判断。
- **HiKid**：[LICENSE](https://github.com/xiaochong/hi-kid/blob/main/LICENSE) 是 MIT，但 [README](https://github.com/xiaochong/hi-kid/blob/main/README.md) 同时写了仅供个人学习、研究和非商业演示，以及禁止商用。这是需要作者澄清的授权表述冲突，本项目暂不复制其代码和美术。
- **LibreLingo**：[README](https://github.com/kantord/LibreLingo/blob/main/README.md) 明确软件为 AGPLv3，但课程作者须自行选择内容许可；吉祥物采用 CC BY-SA 4.0。源码许可不自动覆盖课程、音频、图片或商标。
- **H5P**：[Interactive Video README](https://github.com/h5p/h5p-interactive-video/blob/master/README.md) 载明 MIT；PHP 核心库的 API 元数据识别为 GPL-3.0。应按所用组件和内容分别保留许可与署名。

以上是仓库公开声明的核查记录。真正复用时，还需对所选版本及其依赖、内容资源逐项确认；不将参考产品思路表述为已经集成其代码。

## 对首版平台的采用决策

1. **先实现轻量网页和原创结构化课程**：围绕一个短故事，用少量词汇贯穿听音选图、理解情境和可选跟说，降低操作、阅读和记忆负担。
2. **参考 Anki 的回忆与间隔机制**：把复习做成短任务。首版若采用固定时间间隔，应如实称为“简化间隔复习”；只有实际接入并验证 `ts-fsrs` 后才标为 FSRS。
3. **参考 LibreLingo 的课程结构，避免直接依赖已归档底座**：把词、句子、场景、题目和复习记录分开组织，方便后续校正内容和调整难度。
4. **参考 HiKid 的低压力语音交互**：先提供示范音频、允许重听和自愿跟说。首版不需要自由 AI 对话，也不应把普通语音识别结果当作发音质量评分。
5. **保留后续演进空间**：若孩子真正喜欢故事和听说，再评估本地语音服务；若内容量增长且需要课程管理，再评估 Kolibri 或 H5P。当前优先把一次学习体验做完整。

## 可复核的一手来源

每个项目表格中的名称链接指向仓库。Star、最近推送和归档状态取自对应 `https://api.github.com/repos/<owner>/<repo>` 返回的 `stargazers_count`、`pushed_at`、`archived` 字段。

- [Anki 仓库元数据](https://api.github.com/repos/ankitects/anki)、[主体与例外许可](https://github.com/ankitects/anki/blob/main/LICENSE)
- [Qwerty Learner README](https://github.com/RealKai42/qwerty-learner/blob/master/README.md)
- [Earthworm README](https://github.com/cuixueshe/earthworm/blob/main/README.md)
- [LibreLingo README：归档说明、功能与内容署名](https://github.com/kantord/LibreLingo/blob/main/README.md)
- [Lute README](https://github.com/luteorg/lute-v3/blob/develop/README.md)
- [HiKid README：平台要求和声明](https://github.com/xiaochong/hi-kid/blob/main/README.md)、[LICENSE](https://github.com/xiaochong/hi-kid/blob/main/LICENSE)
- [Kolibri README](https://github.com/learningequality/kolibri/blob/develop/README.md)
- [ts-fsrs README：版本与使用方式](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/README.md)
- [H5P Interactive Video README](https://github.com/h5p/h5p-interactive-video/blob/master/README.md)、[H5P PHP 核心库元数据](https://api.github.com/repos/h5p/h5p-php-library)
