# Mealog

**A quiet place to remember meals, people, and the little things around the table.**

## Try It Now / 直接体验

[Open Mealog / 打开 Mealog](https://mealog.qs2077.workers.dev/)

Open that link on your phone or computer. No account, download, or installation is required. The first visit prepares a small set of sample memories so you can explore immediately.

手机或电脑打开链接即可使用，不用登录，也不用下载。首次打开会准备一些示例记录，你可以直接浏览，也可以记下自己的第一餐。

## A Small Journey

1. Explore the table on Home.
2. On Home, use Add a chair to save someone with just a name, even before your first meal. Their table opens shared meals and a Record a meal together action.
3. Open Add. Take a photo, choose from your library, or expand sample photos. Choose or add companions beside the optional name and note; More details contains meal type, date, mood and location. An unfilled companion field stays unknown; choose Dining alone explicitly to mark a solo meal. Moving from a person’s table back to an existing draft preserves photos and text.
4. Save and open the meal detail. You can edit the photo or details later.
5. Revisit it in Archive: small monthly photobooks use that month’s original table illustration as their covers. Open a book to turn through the photos and your own notes, ending in a food index that links to each meal. Tap a companion’s name to revisit their table; returning keeps your page. The sticker calendar, photo view, and separate Food album remain available. Personal and sample books stay separate.
6. In Insights, choose **My table** or **Sample table** and a month. You can generate an optional AI reflection, open the meals it refers to, and save a monthly thought **in your own words**.
7. Collection shows earned keepsakes and their dates first. Open one to revisit its meal, or expand other keepsakes.

Use the profile button on Home to switch English/中文 or clear the untouched sample memories. Your additions and edited samples are kept. User-written titles, notes, and names are never automatically translated.

## What Stays On Your Device

Meals, people, photos, and saved reports belong to this browser on this device. Uploaded photos are copied into IndexedDB, with separate thumbnails; deleting the original computer/phone photo does not delete the saved copy.

This is **local managed storage, not cloud photo backup**. Clearing this site's browser data, browser storage eviction, losing the device, or using another browser can make records unavailable. There is no account sync or cross-device recovery in this MVP. Private browsing may discard records when you close it. Records made on localhost or the portfolio's old demo do not automatically move to this new independent domain.

记录和照片保存在当前设备、当前浏览器。Mealog 会保存照片副本，不依赖你之后是否保留相册原图。但清除网站数据会丢失本地记录；本版没有账号同步或云端照片备份。

## About AI

**Food stickers:** the browser can cut out the main food subject locally, saving a separate transparent PNG with a white edge. Photos are not uploaded for this feature. First use downloads the on-device tools (about 16 MB); subsequent work reuses browser caching. The album can process existing photos, stop after the current one, and retry unfinished photos. You can also import a transparent PNG from a meal's details. Complex backgrounds or multiple dishes may need manual preparation. Making stickers requires a recent browser with Web Workers, OffscreenCanvas and WebAssembly; native Expo builds can display saved stickers but do not run this browser tool.

餐食贴纸：保存照片后可自动制作，或在“回忆 → 饮食图册”中批量制作已有照片。贴纸与原图分别保存；编辑小记保留贴纸，更换原图会使旧贴纸失效。复杂照片可以在餐食详情中导入已抠好的透明 PNG。抠图在设备上进行，不发送餐食照片。

The small [U²-Net model](https://github.com/xuebinqin/U-2-Net) (Apache 2.0) uses the [rembg ONNX release](https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx), MD5 `8e83ca70e441ab06c318d82300c84806`; [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/deploy.html) 1.22.0 is MIT licensed. Licenses are included in `public/stickers`; pinned runtime files are copied from npm during web startup/export. No cloud segmentation API is used.

Insights uses Cloudflare Workers AI, not a scripted imitation. Generation happens only when you press the button. Sample memories and your personal meals are kept separate. Selected meal titles, dates, tags and photo-presence flags are sent for processing; image files, GPS coordinates, and person profiles are not sent. Meal notes are excluded by default. Turn on **Include meal notes** to also send up to 240 characters from each note, including any personal details you have written there.

The **In your own words** monthly reflection is saved only on your device and is never sent to AI. It is optional: the app does not need to decide what a meal meant for you. AI is prompted to remember concrete details, not diagnose feelings, assume a relationship is growing closer, or prescribe a happier outlook.

The app does not store meal text on its server or log request bodies. Reports are cached on your device. AI can make mistakes; check the linked meal evidence. Meal counts and other statistics are calculated from the records, not invented by the model.

This public demo allows **50 generation attempts per UTC day across all visitors**, and **3 per network/IP in 10 minutes**. Failed attempts also count. Existing reports and normal recording remain usable when AI is unavailable. No paid-plan upgrade is performed.

## Want The Source Code?

GitHub's **Code → Download ZIP** downloads the source project. It is not an installable phone app. For ordinary use, just open the live link above.

Developers need Node.js 22.13+ (Node 24 recommended):

```bash
git clone https://github.com/qishenqishen/mealog.git
cd mealog
npm ci
npm run web
```

The Expo development server supports the recording UI. To run the real AI endpoint locally, use your own Cloudflare account, update `account_id` in `wrangler.jsonc`, then:

```bash
npx wrangler login
npm run build
npm run preview
```

Open [the local preview](http://127.0.0.1:8793/). AI requests during preview use the real Cloudflare service and its quota.

```bash
npm test                  # Storage, transactions, media, AI validation and quota tests
npm run check             # App and Worker TypeScript checks
npx playwright install chromium
npm run test:browser      # Run against the local preview; uses isolated test data
npm run deploy            # Build and deploy the Worker, App, and AI route together
```

Set `MEALOG_URL` to test a deployed build. To use installed Chrome instead of Playwright's Chromium, set `CHROME_CHANNEL=chrome`.

## MVP Boundaries

- Browser-first interactive product, not an App Store release.
- English and Simplified Chinese interface; sample stories are stored examples and remain in their original language.
- AI describes recorded meals; it is not health, nutrition, or relationship advice.
- No advertising, contact-book access, calorie tracking, or account signup.
- Mainland China connectivity and physical iOS/Android testing are not yet verified.

Built with Expo / React Native Web, TypeScript, IndexedDB, and Cloudflare Workers AI.

See [release and setup notes](docs/BUILD_AND_RELEASE.md), [AI implementation notes](docs/INSIGHTS_AI_REPORT_NOTES.md), [original vision / MVP review](docs/PROPOSAL_MVP_REVIEW.md), and [MVP acceptance results](docs/STANDALONE_MVP_QA.md).

## Monthly photobooks / 月度相册

回忆页以每月一本的书架为入口，手机两列、宽屏多列；封面复用每个月原有的餐桌插画。当前年份显示已经到来的月份，无记录月份明确标记，打开后不填充示例。书内完整呈现该月原照片、日期及小记，末尾食物索引优先使用已有贴纸，无贴纸时显示原图。点击索引回到对应餐食，返回时继续上次阅读位置。

Web uses the local PageFlip runtime and fonts bundled with `create-photo-flipbook-ui`; licenses are included in `public/photobook-runtime`. Photos are not sent to a new service. Mouse/touch, visible page buttons, keyboard arrows, and reduced-motion navigation are supported. Native retains a button-paged reader; animated turning is currently a web feature.

本轮本地实现及验收：2026-09-12；尚未发布到线上链接。

## Pastel keepsakes / 淡彩收藏

收藏使用 57 张透明底、细颗粒淡彩插画，每张只有一个水果、饮品或餐桌小物件。浅粉、杏桃、奶油黄、鼠尾草绿、雾蓝与淡紫统一在清淡的色调中。所有收藏展示共用 `AchievementStamp`，原有图标 key、成就规则和隐藏条件保持稳定。

项目素材与内置 image_gen 的完整提示词／原图来源见 [pastel-v1](assets/keepsakes/pastel-v1/README.md)。部署使用保留透明通道的 384px PNG，页面继续按需加载图片；原素材留存以便比较。本轮为本地视觉更新，未部署。
