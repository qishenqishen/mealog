import { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { getUserIdentity, updateLocalProfile } from '../src/auth';
import { useI18n } from '../src/i18n';
import { removeSampleData } from '../src/storage';
import { colors } from '../src/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const copy = (en: string, zh: string) => locale === 'zh' ? zh : en;
  const [displayName, setDisplayName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    getUserIdentity().then((current) => {
      if (!active) return;
      setDisplayName(current?.displayName === 'Guest at the table' ? '' : current?.displayName ?? '');
      setNote(current?.note ?? '');
    }).catch(() => {
      if (active) setMessage(locale === 'zh' ? '暂时无法读取个人资料，请重新打开此页。' : 'Your profile could not be loaded. Please reopen this page.');
    });
    return () => { active = false; };
  }, [locale]));

  const saveProfile = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await updateLocalProfile({ displayName, note });
      setMessage(copy('Your profile is saved.', '个人资料已保存。'));
    } catch {
      setMessage(copy('Your profile could not be saved. Please try again.', '暂时无法保存，请重试。'));
    } finally { setBusy(false); }
  };

  const clearSamples = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await removeSampleData();
      setMessage(copy('Sample memories removed. Your own memories are still here.', '示例已清除，你自己添加或修改过的记忆仍然保留。'));
    } catch {
      setMessage(copy('Samples could not all be removed. You can try again.', '示例尚未全部清除，可以重试。'));
    } finally { setBusy(false); }
  };

  const confirmClear = () => {
    const message = copy('Remove the original sample memories? Memories you added or edited will be kept.', '清除原有示例记忆？你自己添加或修改过的记录会保留。');
    if (Platform.OS === 'web') {
      if (window.confirm(message)) void clearSamples();
    } else {
      Alert.alert(copy('Clear sample memories', '清除示例记忆'), message, [
        { text: copy('Cancel', '取消'), style: 'cancel' },
        { text: copy('Remove samples', '清除示例'), style: 'destructive', onPress: () => { void clearSamples(); } },
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.nav}>
        <Pressable accessibilityRole="button" accessibilityLabel={copy('Back to Home', '返回首页')} style={styles.back}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.navTitle}>{copy('Your table', '你的餐桌')}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{copy('A seat for you', '为你留一个座位')}</Text>
        <Text style={styles.body}>{copy('Meals, people, and the little things worth keeping.', '餐食、相伴的人，还有值得记住的小事。')}</Text>

        <View style={styles.section}>
          <Text style={styles.label}>{copy('Language', '语言')}</Text>
          <View style={styles.languages}>
            {(['en', 'zh'] as const).map((value) => (
              <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: locale === value }}
                onPress={() => { void setLocale(value); }} style={[styles.language, locale === value && styles.selected]}>
                <Text style={[styles.languageText, locale === value && styles.selectedText]}>{value === 'en' ? 'English' : '中文'}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{copy('Your name', '你的名字')}</Text>
          <TextInput accessibilityLabel={copy('Your name', '你的名字')} value={displayName} onChangeText={setDisplayName}
            placeholder={copy('Guest at the table', '餐桌边的客人')} placeholderTextColor={colors.muted} style={styles.input} maxLength={80} />
          <Text style={styles.label}>{copy('A small note', '一句小记')}</Text>
          <TextInput accessibilityLabel={copy('A small note', '一句小记')} value={note} onChangeText={setNote}
            placeholder={copy('Something about you...', '写一点关于自己的事…')} placeholderTextColor={colors.muted}
            style={[styles.input, styles.note]} multiline maxLength={500} />
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void saveProfile(); }} style={styles.primary}>
            <Text style={styles.primaryText}>{busy ? copy('Saving...', '处理中…') : copy('Save profile', '保存资料')}</Text>
          </Pressable>
        </View>

        {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{copy('Make this table yours', '留下你自己的记忆')}</Text>
          <Text style={styles.body}>{copy('The first meals are samples. Clear them whenever you like; anything you have added or edited stays.', '初次打开时的餐食是示例。你可以随时清除它们，自己添加或修改过的内容会保留。')}</Text>
          <Pressable accessibilityRole="button" disabled={busy} onPress={confirmClear} style={styles.secondary}>
            <Text style={styles.languageText}>{copy('Clear sample memories', '清除示例记忆')}</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{copy('Kept on this device', '保存在这台设备')}</Text>
          <Text style={styles.body}>{copy('Your photos are saved as independent copies. Returning in this browser keeps your memories. Clearing site data removes them; cloud backup is not available yet.', '照片会保存为独立副本。在同一浏览器再次打开时，记忆仍然保留。清除本站数据会删除它们；目前尚无云端备份。')}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/onboarding')} style={styles.secondary}>
            <Text style={styles.languageText}>{copy('Welcome & permissions', '欢迎页与权限')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 52, gap: 10 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 32, color: colors.primary },
  navTitle: { fontSize: 15, color: colors.primary },
  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
  title: { fontSize: 30, lineHeight: 40, color: colors.primary, fontStyle: 'italic', marginBottom: 6 },
  body: { fontSize: 14, lineHeight: 23, color: colors.mutedText },
  section: { paddingVertical: 22, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.muted + '55' },
  label: { fontSize: 13, color: colors.mutedText, marginBottom: 9 },
  languages: { flexDirection: 'row', gap: 8 },
  language: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.muted },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  languageText: { fontSize: 14, color: colors.primary },
  selectedText: { color: colors.background },
  input: { minHeight: 46, padding: 12, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.muted, borderRadius: 8, fontSize: 16, color: colors.primary, marginBottom: 16 },
  note: { minHeight: 86, textAlignVertical: 'top' },
  primary: { minHeight: 46, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 14, fontWeight: '600', color: colors.background },
  secondary: { minHeight: 46, justifyContent: 'center', alignItems: 'center', marginTop: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.muted, borderRadius: 8 },
  sectionTitle: { fontSize: 20, lineHeight: 28, color: colors.primary, marginBottom: 8 },
  message: { fontSize: 14, lineHeight: 22, color: colors.secondary, paddingVertical: 16 },
});
