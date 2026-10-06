import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useI18n } from '../src/i18n';
import { colors } from '../src/theme';
import { Linking } from 'react-native';
export default function Privacy() {
  const { locale } = useI18n(); const zh = locale === 'zh';
  const paragraphs = zh ? [
    '原图、端侧贴纸、人物资料、自由记忆、AI 卡片与行为计数保存在当前设备。浏览器清理或设备丢失仍可能导致数据丢失，请导出 ZIP 并自行保存。',
    'AI 仅在你勾选本次授权并点击生成时调用 Cloudflare Workers AI，模型为 Llama 3.1 8B Instruct Fast。发送选中记录的日期、标题、标签及照片存在标记，不发送照片文件、GPS 坐标或人物资料。小记默认不参与；开启后每条最多 240 字符。',
    '默认遮盖文字中已记录的姓名与完整地点名称。这是精确文本替换，不是完整隐私识别，未知姓名、地址或其他敏感内容仍可能存在。请检查允许参与 AI 的文字。自由记忆和月度个人感想不发送给 AI。',
    '应用关闭请求正文与调用日志，不在应用服务器保存你的餐食文字；Cloudflare 官方说明未经明确同意不会将客户内容用于训练或改善服务，其他处理遵循官方条款。我们不把未经核实的“请求后零留存”当作保证。',
    '可在设置中关闭 AI，仅保留本地统计；匿名行为计数默认关闭，开启后仅保存在本机，不含照片、小记、姓名、地点或联系方式，不向分析平台上报。你可以自行导出数据用于试用验证。',
    '卡片默认私密。只有明确点击分享才打开系统分享面板；导出和分享仅包含卡片的文字、时间范围与 AI 标识，不包含其他记录和原图。接收者可以继续保存或转发该图片。',
    'AI 只根据已记录的内容整理回顾，不推断健康、情绪原因或关系变化。引用 ID 校验不等于每个语义事实都正确，你可以逐句查看依据并标记有误。',
    '当前版本无云端照片备份、账号同步、通讯录读取或公开社区。备份为未加密 ZIP，恢复保留本机已有同 ID 记录。删除餐食移入恢复区，不自动清空。',
  ] : [
    'Original images, local stickers, people, free memories, AI cards and event counts stay on this device. Browser clearing or device loss may remove them. Export and safely keep your ZIP backup.',
    'AI runs only after explicit consent and Generate. Cloudflare Workers AI uses Llama 3.1 8B Instruct Fast. Selected dates, titles, tags and photo-presence flags are sent, never image files, GPS or person profiles. Notes are off by default, capped at 240 characters each when enabled.',
    'Known names and exact place labels are masked by default. Exact text replacement is not comprehensive privacy detection. Unknown sensitive text may remain. Free memories and your own monthly words are never sent to AI.',
    'Application request-body and invocation logging are disabled. The application server does not retain meal text. Cloudflare states it does not use customer content for training or service improvement without explicit consent; no unverified zero-retention promise is made.',
    'Disable AI to use local facts only. Anonymous behavior measurement is off by default and remains local, without photos, notes, names, locations or contact data. No analytics platform receives it.',
    'Cards are private by default. Share opens the system share sheet only when selected. Only card text, dates and AI attribution are exported; other records and original photos are excluded. Recipients can retain or forward that image.',
    'AI organizes recorded evidence, without inferring health, causes of feelings or relationship changes. Valid IDs do not guarantee semantic truth. Check sources and mark inaccurate observations.',
    'No cloud photo backup, account sync, contacts access or public feed. ZIP backups are unencrypted. Restore keeps existing matching records. Deleted meals stay in the recovery area until restored.',
  ];
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}><Pressable accessibilityRole="button" style={styles.button} onPress={() => router.back()}><Text style={styles.body}>{zh ? '‹ 返回' : '‹ Back'}</Text></Pressable><Text style={styles.title}>{zh ? '你的记忆与 AI' : 'Your memories & AI'}</Text><Text style={styles.body}>2026-10-01</Text>{paragraphs.map((text, index) => <Text key={index} style={styles.body}>{text}</Text>)}<Pressable accessibilityRole="link" style={styles.button} onPress={() => Linking.openURL('https://developers.cloudflare.com/workers-ai/platform/data-usage/')}><Text style={styles.body}>{zh ? 'Cloudflare 官方数据使用说明 ↗' : 'Cloudflare data usage ↗'}</Text></Pressable></ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, page: { padding: 24, gap: 20 }, title: { fontSize: 26, color: colors.primary }, body: { fontSize: 15, lineHeight: 25, color: colors.mutedText }, button: { minHeight: 44, justifyContent: 'center' } });
