# Mealog 独立 MVP 验收报告

体验入口：[https://mealog.qs2077.workers.dev/](https://mealog.qs2077.workers.dev/)

验收日期：2026-09-07（洛杉矶）/ 2026-09-08（UTC）。

发布版本：`ac168cc7-e95d-4f91-b315-634c272c2e73`。

范围：可直接分享的浏览器产品 MVP，不是作品集内嵌模拟，也不是 App Store 安装包。测试使用独立浏览器上下文和虚构记录，没有读取、覆盖或删除实际访客的数据。

## 已完成

- 根网址直接进入 Home，免登录；首次自动准备示例，失败可重试。
- 上月完整示例、本月至今示例；本次新访客得到 5 位人物、13 餐，没有未来餐食。日期和 ID 不随刷新改变。
- 上传自己的照片或使用示例食物照片，添加餐名、心情、笔记和同伴，保存后进入详情。
- 编辑、换图、删除、Calendar、Month Memories、人物共同记忆、Collection 进度相互衔接。
- 清除示例时保留个人新增、修改过的示例、被引用的人物和图片；刷新不重新灌入示例。
- 英文/简体中文界面、浏览器语言默认值、持久化切换；不自动翻译用户输入。
- 手机全宽，电脑最大宽度 460px，内部滚动和固定底部导航。
- 真实 Cloudflare Workers AI、显式生成、来源说明、餐食引用、缓存、过期提示、失败和限流提示。
- 公开 GitHub 的 README 已改为直接体验说明，解释源码 ZIP 与可安装 App 的区别。

## 验收结果

| 检查 | 结果与证据 |
| --- | --- |
| App / Worker TypeScript | `npm run check` 通过 |
| Web 生产构建 | `npm run build` 通过；Expo 54，860 modules，主 JS 约 1.42 MB（未压缩） |
| 存储自动化 | 20/20：并发写入、回滚、稳定 ID、换图、引用保护、迁移重试、native 文件适配器 |
| 语言自动化 | 4/4：默认语言、保存选择、加载竞争、全部 Collection 静态文案 |
| Worker 自动化 | 请求/输出校验、隐私字段白名单、请求和 prompt 上限、SQLite 并发/重开/日期重置、50/51 次限制、超时和失败路径通过 |
| 线上完整产品流程 | 15 项通过，见 [完整结果](qa-evidence/main-flow.json) |
| 人物与共同照片 | 4 项通过，见 [图片入口结果](qa-evidence/people-media.json) |
| 响应式与语言 | 15 个页面/尺寸组合及 1 个缩小高度表单检查通过，见 [结果](qa-evidence/responsive.json) |
| Collection 按需加载 | 入页不加载整套图标，滚动后逐一核验 50 张图，见 [结果](qa-evidence/collection-loading.json) |
| 真实线上 AI | 英文生成、新增餐食后重新生成、中文生成、缓存、429、完整 Chrome 重启均通过，见 [真实报告与结果](qa-evidence/live-ai.json) |
| 直接打开与刷新 | `/`、`/add`、`/archive`、`/insights`、`/collection` 和详情路径均可用 |
| API 路由 | 未知 API 为 JSON 404；错误方法为 405；非法 JSON 为 400，不误返回 App HTML |

浏览器：macOS 上实际运行的 Google Chrome，由 Playwright 驱动。尺寸包括 320×568、390×844、1440×900 和 1440×1000。不是物理 iPhone/Android 测试。

## 媒体持久化

使用真实文件选择器上传测试 JPG，成功保存后删除测试创建的源文件，再刷新和重新打开详情，图片仍可解码显示。餐食图片、人物头像、共同照片及共同照片作为封面分别验证。只删除测试目录里的副本，不删除素材原件。

数据库保存 `mediaId` 与 `indexeddb://mealog-media/...` 内部引用；图片 Blob 和缩略图在 IndexedDB。浏览器显示时临时解析的 `blob:` URL 不作为最终持久化来源。Calendar / Archive / Month Memories 使用已管理的缩略图。换图后 mediaId 改变，餐食 ID 不变。

在真实浏览器中注入 IndexedDB 写入失败后：显示明确错误、表单内容保留、不生成损坏餐食；恢复写入后重试只产生一条记录。关闭整个 Chrome 进程并使用同一测试 profile 重新启动后，记录、照片、语言和 AI 缓存仍可读取。

旧数据场景：准备餐食、头像、共同照片共 3 个可访问旧 `blob:` 来源和 1 个故意失效来源。3 个有效来源迁移成 managed media，撤销旧 object URL 后刷新仍显示；失效来源标为缺失而不使 App 崩溃。后续启动报告为 4 条检查、3 条 already managed、1 条 missing、0 条 migration failed；这是幂等复查结果，不是“初次迁移了零条”。

存储类型：**local managed only**。没有云端照片备份或账号同步。旧 localhost / portfolio 域名和新独立域名属于不同浏览器存储空间，不会自动跨域搬移已有记录。既有内部 storage keys、native App 身份和媒体数据库名称未改动。

## 真实 AI 的边界

线上真实模型为 `@cf/meta/llama-3.1-8b-instruct-fast`，provider 为 `cloudflare_workers_ai`，不是规则总结。验收时先生成 3 餐的报告，新增“Dumplings folded with Amy”后重新生成，统计变为 4 餐，英文叙述引用了 Amy 做星形饺子的新记录。中文请求也返回真实中文内容。切换页面、切换语言及刷新不会自动调用 AI。

生成只发送必要文字、标签和是否有照片的布尔值；不发送图片、原文件地址、GPS 或人物档案。用户笔记本身可能含有私人信息，生成按钮前已说明会交由 Cloudflare 处理。应用服务端不存储或记录餐食正文。

真实第 4 次同网络请求返回 `429 ip_limit`，先前报告仍保留。全站每日最多 50 次生成尝试通过持久化 SQLite 的并发、重开及跨 UTC 日测试验证；没有为了测试而实际耗掉 50 次 AI 调用。服务端超时、无效结构和上游失败采用自动化注入；没有假称现场制造了 Cloudflare 服务故障。

语言质量经过检查：旧示例含抽象英文比喻，中文偶有生硬直译；已收紧双语 prompt，并把新访客示例改为具体餐桌事件，不覆盖既有记录。小模型仍可能表达重复、措辞不自然或解读有误，证据链接与免责声明保留。完整 AI 流程证据的上一组截图早于最后一次示例笔记调整；代码逻辑和模型一致。

最终发布版本另做了一次真实中文生成（2026-09-08 02:16 UTC）：返回“你和Kai互换了一口饭菜，讨论了周末计划”等与新示例一致的内容。见 [最终中文响应](qa-evidence/ai-chinese-release.json) 和下方截图。没有继续占满这一网络的所有测试额度。

没有进行付费升级或购买域名。OAuth 的账单订阅查询返回 403，因此未独立确认账户当前 Free/Paid 状态，不能把“没有升级”说成“已验证不会收费”。全站生成次数有硬上限；还需维持 Cloudflare Free 方案以获得平台级无超额计费行为，其他项目也可能消耗账户共享免费额度。

## 截图

以下均为实际运行截图，不是设计稿：

- [手机 Home](screenshots/01-home-mobile.png) · [桌面 Home](screenshots/10-desktop-home.png)
- [删除测试原图后刷新](screenshots/04-source-deleted-reloaded.png) · [真实存储失败提示](screenshots/07-save-failure.png)
- [Month Memories](screenshots/06-month-memories.png) · [中文 Archive](screenshots/09-zh-archive.png)
- [人物共同记忆](screenshots/03-person-shared-memories.png)
- [320px 小屏](screenshots/320-archive.png) · [缩小视窗中的保存按钮](screenshots/reduced-viewport-form.png)
- [真实英文 AI 回顾](screenshots/ai-english.png) · [最终版本的真实中文回顾](screenshots/ai-chinese.png)

## 尚未验证与限制

- **国内访问未验证**：只有当前海外网络成功访问的证据，不能保证中国大陆到 workers.dev 的连通性。
- **iOS/Android 真机未验证**：系统相册删除、拍照、Recently Deleted、真机键盘、EXIF 方向和 Safari 均需设备测试；文件适配器测试不能代替真机验收。
- **浏览器存储不是永久云备份**：清除站点数据、隐私模式结束、浏览器存储回收或设备丢失可能导致本地数据丢失。不同设备/浏览器不自动同步。
- **并发边界**：同一运行实例的写入已串行化；同时在多个标签页编辑同一条记录未做跨标签事务保证。
- **性能边界**：一次冷启动复测中，Collection 同时请求整套图标导致 30 秒图片等待超时。已改为接近可视区域时按需加载，保留固定尺寸和原图，离屏动画也不启动；逐一滚动核验全部图标。没有做 Lighthouse、低速移动网络或低端手机性能认证，原有大图仍有后续压缩空间。
- **依赖安全**：兼容性修复已移除初始 critical 项；`npm audit --omit=dev` 仍报告 27 个依赖告警（17 moderate、10 high、0 critical），涉及 Expo 工具链及导航等传递依赖。未强制跨版本升级 Expo，也不宣称本版已完成全面安全审计。公开部署的是静态构建和小型 Worker，不是 Metro 开发服务器。

## 复现

运行要求和部署方式见 [README](../README.md) 和 [发布说明](BUILD_AND_RELEASE.md)。

```bash
npm test
npm run check
npm run build
npm run preview
CHROME_CHANNEL=chrome MEALOG_URL=http://127.0.0.1:8793 npm run test:browser
CHROME_CHANNEL=chrome MEALOG_URL=http://127.0.0.1:8793 node tests/people-media-browser.mjs
CHROME_CHANNEL=chrome MEALOG_URL=http://127.0.0.1:8793 node tests/responsive-browser.mjs
CHROME_CHANNEL=chrome MEALOG_URL=http://127.0.0.1:8793 node tests/collection-loading-browser.mjs
```

真实 AI 测试需显式运行 `tests/live-ai-browser.mjs`，会消耗 3 次调用额度并验证第 4 次被限流。不要在同一网络的 10 分钟窗口里重复运行，也不要在本地 AI 测试期间重建文件触发预览服务重载。

架构与源文件职责见 [独立 MVP 架构](STANDALONE_MVP_ARCHITECTURE.md)。
