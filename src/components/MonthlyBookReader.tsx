import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { MealEntry } from '../types';
import { BOOK_MONTHS } from '../utils/monthlyBooks';
import { getHeroAssetForMonth } from '../utils/heroAssets';

export interface MonthlyBookReaderProps {
  month: string;
  scope?: 'personal' | 'sample';
  meals: MealEntry[];
  companions: Record<string, { personId?: string; name: string }[]>;
  locale: 'zh' | 'en';
  onMealPress: (id: string) => void;
  onPersonPress: (id: string) => void;
  onArchive: () => void;
  onClose: () => void;
}

function BookPhoto({ uri, fallback, title, missing }: { uri?: string; fallback?: string; title: string; missing: string }) {
  const [source, setSource] = useState(uri);
  useEffect(() => setSource(uri), [uri]);
  return source ? <Image source={{ uri: source }} resizeMode="contain" accessibilityLabel={title}
    onError={() => setSource(source !== fallback ? fallback : undefined)} style={styles.photo} />
    : <View style={[styles.photo, styles.placeholder]}><Text style={styles.muted}>{missing}</Text></View>;
}

/** Native keeps the same book sequence; the animated HTML edition is provided on web. */
export default function MonthlyBookReader({ month, meals, companions, locale, onMealPress, onPersonPress, onArchive, onClose }: MonthlyBookReaderProps) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [month]);
  const zh = locale === 'zh';
  const theme = BOOK_MONTHS[Number(month.slice(5, 7)) - 1] ?? BOOK_MONTHS[0];
  const title = `${zh ? theme.zh : theme.en} ${month.slice(0, 4)}`;
  const archivePage = meals.length + 2;
  const lastPage = archivePage + 1;
  const currentPage = Math.min(page, lastPage);
  const meal = meals[currentPage - 2];
  const missing = zh ? '这一餐，还没有照片' : 'A meal without a photograph';
  const action = (label: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;

  return <View style={styles.reader}>
    <View style={styles.header}>
      {action(zh ? '← 书架' : '← Bookshelf', onClose)}
      <Text style={styles.headerTitle}>{title}</Text>
      {action(zh ? '食物索引' : 'Food index', () => setPage(archivePage))}
    </View>
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={[styles.paper, currentPage === 0 && styles.cover, currentPage === lastPage && { backgroundColor: theme.color }]}>
        {currentPage === 0 ? <>
          <Image source={getHeroAssetForMonth(Number(month.slice(5, 7)) - 1)} resizeMode="contain" accessibilityLabel={zh ? `${theme.zh}的餐桌` : `${theme.en} table illustration`} style={styles.coverIllustration} />
          <View style={styles.coverSpine} /><Text style={styles.coverLabel}>{theme.en} / {month.slice(0, 4)}</Text>
        </> : currentPage === 1 ? <View style={styles.titlePage}>
          <Text style={styles.coverTitle}>{zh ? theme.zh : theme.en}</Text><Text style={styles.subtitle}>{month.slice(0, 4)}</Text>
          <View style={styles.rule} /><Text style={styles.body}>{zh ? '这个月，吃过的日常。' : 'A month at the table.'}</Text>
          <Text style={styles.muted}>{meals.length} {zh ? '餐记忆' : 'meal memories'}</Text>
        </View> : currentPage === archivePage ? <>
          <Text style={styles.edition}>THE FOOD INDEX</Text><Text style={styles.archiveTitle}>{zh ? '食物档案' : 'Food archive'}</Text>
          <Text style={styles.muted}>{zh ? '点一份食物，回到那一餐。' : 'A little index of everything tasted.'}</Text>
          <View style={styles.grid}>{meals.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.title} · ${item.date}`}
            onPress={() => onMealPress(item.id)} style={styles.foodItem}>
            <View style={styles.foodImage}><BookPhoto uri={item.stickerUri || item.photoUri || item.photoThumbnailUri} fallback={item.photoUri || item.photoThumbnailUri} title={item.title} missing={missing} /></View>
            <Text numberOfLines={2} style={styles.foodTitle}>{item.title}</Text>
            <Text style={styles.foodDate}>{item.date.slice(5).replace('-', '.')}</Text>
          </Pressable>)}</View>
          {!meals.length && <Text style={styles.empty}>{zh ? '这个月的餐桌，等你留下第一段回忆。' : 'This month is waiting for its first memory.'}</Text>}
          {action(zh ? '打开食物档案 ↗' : 'Open food archive ↗', onArchive)}
        </> : currentPage === lastPage ? <View style={styles.titlePage}>
          <Text style={[styles.coverTitle, { color: theme.ink }]}>mealog</Text><Text style={[styles.subtitle, { color: theme.ink }]}>{month} · {meals.length} {zh ? '餐记忆' : 'meal memories'}</Text>
        </View> : meal ? <>
          <View style={styles.mealPhoto}><BookPhoto uri={meal.photoUri || meal.photoThumbnailUri} title={meal.title} missing={missing} /></View>
          <Text style={styles.date}>{meal.date.replaceAll('-', '.')} / {meal.time}</Text><Text style={styles.mealTitle}>{meal.title}</Text>
          {!!companions[meal.id]?.length && <View style={styles.company}>
            <Text style={styles.muted}>{zh ? '同桌' : 'With'}</Text>
            {companions[meal.id].map((person, index) => person.personId
              ? <Pressable key={person.personId} accessibilityRole="button" accessibilityLabel={zh ? `我和${person.name}的餐桌` : `Our table with ${person.name}`}
                onPress={() => onPersonPress(person.personId!)} style={styles.button}><Text style={styles.personName}>{person.name} ↗</Text></Pressable>
              : <Text key={`snapshot-${index}`} style={styles.muted}>{person.name}</Text>)}
          </View>}
          {meal.note ? <Text style={styles.note}>{meal.note}</Text> : null}
          {action(zh ? '查看这餐 ↗' : 'View memory ↗', () => onMealPress(meal.id))}
        </> : null}
      </View>
    </ScrollView>
    <View style={styles.controls}>
      {action(zh ? '← 上一页' : '← Previous', () => setPage(currentPage - 1), currentPage === 0)}
      <Text accessibilityLiveRegion="polite" style={styles.muted}>{currentPage === 0 ? (zh ? '封面' : 'Front cover') : currentPage === lastPage ? (zh ? '封底' : 'Back cover') : `${currentPage} / ${lastPage - 1}`}</Text>
      {action(zh ? '下一页 →' : 'Next →', () => setPage(currentPage + 1), currentPage === lastPage)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  reader: { flex: 1, backgroundColor: '#f4f1e9' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8, gap: 4 },
  headerTitle: { flex: 1, textAlign: 'center', color: '#414a36', fontSize: 13 },
  button: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#4f5942', fontSize: 12 },
  disabled: { opacity: .35 },
  scroll: { padding: 20, flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  paper: { width: '100%', maxWidth: 460, minHeight: 440, padding: 26, backgroundColor: '#f8f5ed', shadowColor: '#3f3a2c', shadowOpacity: .18, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  edition: { color: '#606853', fontSize: 10, letterSpacing: 1.2 },
  coverTitle: { color: '#414a36', fontFamily: 'Georgia', fontSize: 30, marginTop: 24 },
  subtitle: { color: '#414a36', fontFamily: 'Georgia', fontSize: 15, marginTop: 8 },
  cover: { padding: 0, aspectRatio: .75, minHeight: 0, overflow: 'hidden' },
  coverIllustration: { width: '100%', height: '100%' },
  coverSpine: { position: 'absolute', left: '2.8%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(0,0,0,.12)' },
  coverLabel: { position: 'absolute', left: '10%', bottom: '5.2%', paddingHorizontal: 10, paddingVertical: 7, color: '#424936', backgroundColor: '#f8f5ed', fontFamily: 'Georgia', fontSize: 12 },
  photo: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(114,124,95,.06)', padding: 16 },
  titlePage: { minHeight: 385, justifyContent: 'center', gap: 8 },
  rule: { height: 1, width: 28, backgroundColor: '#9da38e', marginVertical: 20 },
  body: { color: '#434b39', fontSize: 17, lineHeight: 28 },
  muted: { color: '#606953', fontSize: 12, lineHeight: 19 },
  mealPhoto: { height: 270, marginBottom: 24 },
  date: { color: '#606953', fontSize: 12, marginBottom: 8 },
  mealTitle: { color: '#353e2c', fontSize: 18, lineHeight: 24 },
  company: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 4 },
  personName: { color: '#4f5942', fontSize: 13, textDecorationLine: 'underline' },
  note: { color: '#525e44', fontSize: 14, lineHeight: 23, marginTop: 12 },
  archiveTitle: { color: '#414a36', fontFamily: 'Georgia', fontSize: 26, marginVertical: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginVertical: 28 },
  foodItem: { width: '45%', minHeight: 130, alignItems: 'center' },
  foodImage: { width: '100%', height: 100 },
  foodTitle: { color: '#434b39', fontSize: 12, lineHeight: 18, marginTop: 7, textAlign: 'center' },
  foodDate: { color: '#616a55', fontSize: 11, lineHeight: 16, marginTop: 3 },
  empty: { color: '#606953', fontSize: 15, lineHeight: 26, marginVertical: 50 },
  controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
});
