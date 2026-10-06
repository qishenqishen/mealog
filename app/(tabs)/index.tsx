import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { getMeals, getPeopleProfiles, getMealCompanions } from '../../src/storage';
import { getFreeMemories, trackEvent, type FreeMemory } from '../../src/product/store';
import { filterPeriod, localDate } from '../../src/product/memory';
import { peopleForScope } from '../../src/utils/people';
import type { MealEntry, PersonProfile } from '../../src/types';
import { useI18n } from '../../src/i18n';
import PersonAvatar from '../../src/components/PersonAvatar';
import CreatePersonModal from '../../src/components/CreatePersonModal';
import { getHeroAssetForDate } from '../../src/utils/heroAssets';
import { colors, fonts } from '../../src/theme';

export default function HomeScreen() {
  const { locale } = useI18n(); const zh = locale === 'zh';
  const [meals, setMeals] = useState<MealEntry[]>([]), [people, setPeople] = useState<PersonProfile[]>([]);
  const [notes, setNotes] = useState<FreeMemory[]>([]), [error, setError] = useState(''), [loaded, setLoaded] = useState(false);
  const [createPerson, setCreatePerson] = useState(false), [section, setSection] = useState<'moments' | 'people' | 'notes'>('moments');
  const [menu, setMenu] = useState(false);
  const load = useCallback(async () => {
    try {
      const [all, profiles, companions, memories] = await Promise.all([getMeals(), getPeopleProfiles(), getMealCompanions(), getFreeMemories()]);
      setMeals(all.filter(item => item.origin !== 'sample'));
      setPeople(peopleForScope(profiles, all, companions, 'personal')); setNotes(memories); setError(''); setLoaded(true);
    } catch { setError(zh ? '餐桌暂时未能打开。轻触重试。' : 'Your table could not open. Tap to retry.'); }
  }, [zh]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const week = filterPeriod(meals, localDate(), 'week');
  const openMoment = (id: string) => { void trackEvent('revisit'); router.push(`/meal/${id}`); };
  const links = [{ label: zh ? '每月餐桌' : 'Monthly tables', route: '/table' }, { label: zh ? '从相册带回来' : 'Import photographs', route: '/memory-tools?tab=import' }, { label: zh ? '整理与搜索' : 'Organize & search', route: '/memory-tools' }, { label: zh ? '私密记忆卡片' : 'Memory cards', route: '/memory-tools?tab=cards' }, { label: zh ? '设置与备份' : 'Settings & backup', route: '/profile' }];
  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><Image source={require('../../assets/brand/mealog-wordmark-v2.png')} accessibilityLabel="Mealog" accessibilityRole="image" style={styles.brand} resizeMode="contain" /><Pressable accessibilityRole="button" accessibilityLabel={zh ? '打开餐桌菜单' : 'Open table menu'} accessibilityState={{ expanded: menu }} onPress={() => setMenu(!menu)} style={styles.menuButton}><Text style={styles.small}>{menu ? (zh ? '收起 −' : 'Close −') : (zh ? '我的餐桌 ＋' : 'My table +')}</Text></Pressable></View>
    {menu && <View style={styles.menu}>{links.map(item => <Pressable key={item.route} accessibilityRole="button" onPress={() => { setMenu(false); router.push(item.route as '/table'); }} style={styles.menuItem}><Text style={styles.body}>{item.label}</Text><Text style={styles.small}>↗</Text></Pressable>)}</View>}
    <View style={styles.hero}>
      <Image source={getHeroAssetForDate(new Date())} style={styles.heroPhoto} accessibilityLabel={zh ? '本月咖啡餐桌插画，非个人记录' : 'This month’s illustrated table, not a personal memory'}/>
      <View nativeID="mealog-hero-shade" pointerEvents="none" style={styles.heroShade}/>
      <View style={styles.heroWords}><Text style={styles.caption}>{zh ? `${new Date().getMonth() + 1} 月 / 餐桌之间` : `MONTH ${new Date().getMonth() + 1} / AT THE TABLE`}</Text><Text style={styles.title}>{zh ? '一杯咖啡，\n一页日常。' : 'Coffee, and\na little time.'}</Text></View>
    </View>
    <Text style={styles.intro}>{zh ? '有些日子，记得是因为一起吃过饭。' : 'Some days stay with us because we shared a table.'}</Text>
    <View style={styles.actions}><Pressable accessibilityRole="button" style={styles.primary} onPress={() => router.push('/add')}><Text style={styles.primaryText}>{zh ? '记下这一餐' : 'Keep this moment'}</Text><Text style={styles.primaryText}>＋</Text></Pressable><Pressable accessibilityRole="button" style={styles.importButton} onPress={() => router.push('/memory-tools?tab=import')}><Text style={styles.small}>{zh ? '带回旧照片 ↗' : 'Bring photos back ↗'}</Text></Pressable></View>
    {error ? <Pressable accessibilityRole="button" onPress={load}><Text style={styles.body}>{error}</Text></Pressable> : !loaded ? <Text style={styles.body}>{zh ? '正在打开餐桌…' : 'Opening your table…'}</Text> : <>
      <View style={styles.tableCard}><View style={styles.tableHeading}><Text style={styles.tableTitle}>{zh ? '今天的餐桌' : 'today’s table'}</Text><Text style={styles.edition}>JOURNAL / 01</Text></View><View style={styles.sections} accessibilityRole="tablist">{([{ key: 'moments', label: zh ? '时刻' : 'Moments' }, { key: 'people', label: zh ? '同桌的人' : 'People' }, { key: 'notes', label: zh ? '随手小记' : 'Notes' }] as const).map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: section === item.key }} onPress={() => setSection(item.key)} style={[styles.sectionTab, section === item.key && styles.activeTab]}><Text style={[styles.small, section !== item.key && { color: colors.mutedText }]}>{item.label}</Text></Pressable>)}</View>
      {section === 'moments' && <View style={styles.preview}>
        {meals.length ? <Pressable accessibilityRole="button" style={styles.memoryRow} onPress={() => openMoment(meals[0].id)}><View style={{ flex: 1 }}><Text style={styles.heading} numberOfLines={1}>{meals[0].title}</Text><Text style={styles.body} numberOfLines={1}>{meals[0].note || meals[0].date}</Text></View><View style={styles.momentThumb}>{meals[0].photoUri ? <Image source={{ uri: meals[0].photoThumbnailUri || meals[0].photoUri }} style={styles.thumbPhoto}/> : <Text style={styles.small}>↗</Text>}</View></Pressable> : <View style={styles.empty}><Text style={styles.heading}>{zh ? '这一刻，慢慢记。' : 'A first page, for today.'}</Text><Text style={styles.body}>{zh ? '下个月的你，会想起今天的什么？' : 'Breakfast, coffee, or a moment cooking together.'}</Text></View>}
        <View style={styles.footerRow}><Pressable accessibilityRole="button" style={styles.textButton} onPress={() => router.push(meals.length ? '/archive' : '/table')}><Text style={styles.small}>{zh ? (meals.length ? '翻阅全部时刻 →' : '翻阅示例餐桌 →') : (meals.length ? 'All moments →' : 'Explore a sample table →')}</Text></Pressable><Pressable accessibilityRole="button" style={styles.textButton} onPress={() => router.push('/insights')}><Text style={styles.small}>{zh ? (week.length >= 3 ? '本周小记 ↗' : '回顾 ↗') : 'Reflect ↗'}</Text></Pressable></View>
      </View>}
      {section === 'people' && <View style={styles.preview}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.peopleRow}>{people.map(person => <Pressable key={person.id} accessibilityRole="button" style={styles.person} onPress={() => { void trackEvent('revisit'); router.push(`/people/${person.id}`); }}><PersonAvatar person={person} size={44}/><Text style={styles.small} numberOfLines={1}>{person.nickname || person.name}</Text><Text style={styles.caption}>{meals.filter(meal => meal.personIds?.includes(person.id)).length}{zh ? " 个时刻" : " moments"}</Text></Pressable>)}<Pressable accessibilityRole="button" style={styles.person} onPress={() => setCreatePerson(true)}><View style={styles.addChair}><Text style={styles.heading}>＋</Text></View><Text style={styles.small}>{zh ? '留一个座位' : 'Save a seat'}</Text></Pressable></ScrollView><Text style={styles.body}>{zh ? '有些味道，会让人想起同桌的那个人。' : 'Some flavours bring a familiar face to mind.'}</Text></View>}
      {section === 'notes' && <View style={styles.preview}>{notes.length ? <View><Text style={styles.heading} numberOfLines={1}>{notes[0].title}</Text><Text style={styles.body} numberOfLines={2}>{notes[0].text}</Text></View> : <View><Text style={styles.heading}>{zh ? '不止于餐桌。' : 'Beyond the table.'}</Text><Text style={styles.body}>{zh ? '一句话，也可以留住一个下午。' : 'A sentence can hold an afternoon.'}</Text></View>}<Pressable accessibilityRole="button" style={styles.textButton} onPress={() => router.push('/memory-tools?tab=notes')}><Text style={styles.small}>{zh ? '写下或翻阅小记 →' : 'Write or revisit a note →'}</Text></Pressable></View>}
    </View></>}
    <CreatePersonModal visible={createPerson} onClose={() => setCreatePerson(false)} onSaved={load}/>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, page: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 22 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 60 }, brand: { width: 156, height: 52 }, menuButton: { minHeight: 44, justifyContent: 'center' },
  menu: { borderTopWidth: 1, borderColor: colors.border, marginBottom: 16 }, menuItem: { minHeight: 46, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  hero: { marginTop: 8, height: 250, borderRadius: 22, overflow: 'hidden', borderWidth: 1.5, borderColor: colors.primary }, heroPhoto: { width: '100%', height: '100%', resizeMode: 'cover', backgroundColor: colors.surfaceWarm }, heroShade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 143, backgroundColor: 'rgba(24,21,15,0.58)' }, heroWords: { position: 'absolute', bottom: 19, left: 22, right: 16 }, caption: { fontFamily: fonts.body, fontSize: 10, letterSpacing: 1, color: '#fff9e9', marginBottom: 7 },
  title: { fontFamily: fonts.editorial, fontSize: 30, lineHeight: 36, color: '#fff9e9' }, intro: { fontFamily: fonts.body, fontSize: 13, lineHeight: 22, color: colors.mutedText, marginTop: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 15, marginBottom: 20 }, primary: { minHeight: 47, flex: 1, backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 10, paddingHorizontal: 17, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, primaryText: { fontFamily: fonts.body, color: colors.primary, fontWeight: '600', fontSize: 15 }, importButton: { minHeight: 46, justifyContent: 'center' },
  tableCard: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 14, backgroundColor: colors.surface, paddingHorizontal: 16, paddingTop: 13, paddingBottom: 4 }, tableHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, tableTitle: { fontFamily: fonts.body, fontWeight: '600', fontSize: 17, color: colors.primary }, edition: { fontFamily: fonts.body, fontSize: 9, letterSpacing: 0.7, color: colors.mutedText }, sections: { flexDirection: 'row', marginTop: 10, gap: 8 }, sectionTab: { minHeight: 36, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, borderRadius: 18 }, activeTab: { borderColor: colors.primary, backgroundColor: colors.accentSoft },
  preview: { paddingTop: 13, minHeight: 109, gap: 8 }, memoryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, momentThumb: { width: 46, height: 46, overflow: 'hidden', borderRadius: 8 }, thumbPhoto: { width: '100%', height: '100%', resizeMode: 'cover' }, heading: { fontFamily: fonts.editorial, fontSize: 17, lineHeight: 24, color: colors.primary }, body: { fontFamily: fonts.body, fontSize: 12, lineHeight: 20, color: colors.mutedText }, small: { fontFamily: fonts.body, fontSize: 12, color: colors.primary }, textButton: { minHeight: 44, justifyContent: 'center' }, footerRow: { flexDirection: 'row', justifyContent: 'space-between' }, empty: { gap: 4 }, peopleRow: { gap: 18 }, person: { width: 70, alignItems: 'center', gap: 6, minHeight: 82 }, addChair: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 22 },
});
