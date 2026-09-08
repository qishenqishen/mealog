# Mealog

**A quiet place to remember meals, people, and the little things around the table.**

## Try It Now / 直接体验

[Open Mealog / 打开 Mealog](https://mealog.qs2077.workers.dev/)

Open that link on your phone or computer. No account, download, or installation is required. The first visit prepares a small set of sample memories so you can explore immediately.

手机或电脑打开链接即可使用，不用登录，也不用下载。首次打开会准备一些示例记录，你可以直接浏览，也可以记下自己的第一餐。

## A Small Journey

1. Explore the table on Home.
2. Open Add. Take a photo, choose from your library, or use a sample food photo; add a meal name, mood, note, and a companion. Location is optional and read only when you ask.
3. Save and open the meal detail. You can edit the photo or details later.
4. Revisit it in Archive, the calendar, and month memories. Open a person's page to see your shared meals.
5. In Insights, choose **My table** or **Sample table** and a month. You can generate an optional AI reflection, open the meals it refers to, and save a monthly thought **in your own words**.
6. Check Collection as your memories grow, then return to Add.

Use the profile button on Home to switch English/中文 or clear the untouched sample memories. Your additions and edited samples are kept. User-written titles, notes, and names are never automatically translated.

## What Stays On Your Device

Meals, people, photos, and saved reports belong to this browser on this device. Uploaded photos are copied into IndexedDB, with separate thumbnails; deleting the original computer/phone photo does not delete the saved copy.

This is **local managed storage, not cloud photo backup**. Clearing this site's browser data, browser storage eviction, losing the device, or using another browser can make records unavailable. There is no account sync or cross-device recovery in this MVP. Private browsing may discard records when you close it. Records made on localhost or the portfolio's old demo do not automatically move to this new independent domain.

记录和照片保存在当前设备、当前浏览器。Mealog 会保存照片副本，不依赖你之后是否保留相册原图。但清除网站数据会丢失本地记录；本版没有账号同步或云端照片备份。

## About AI

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
