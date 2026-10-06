import React, { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { MealEntry } from '../types';
import { BOOK_MONTHS, monthMeals, shelfMonths } from '../utils/monthlyBooks';
import { getHeroAssetForMonth } from '../utils/heroAssets';

const serif = Platform.OS === 'web' ? '"Source Serif 4", "Songti SC", Georgia, serif' : 'Georgia';

function BookCover({ month, meals, zh, height, compact, onOpen }: {
  month: string; meals: MealEntry[]; zh: boolean; height: number; compact: boolean; onOpen: () => void;
}) {
  const index = Number(month.slice(5)) - 1;
  const theme = BOOK_MONTHS[index];
  const label = zh ? `${month.slice(0, 4)} 年${theme.zh}相册` : `${theme.en} ${month.slice(0, 4)} photobook`;
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityHint={zh ? (meals.length ? '打开并翻阅这个月的餐食回忆' : '这个月尚无餐食记录') : (meals.length ? 'Open this month’s memories' : 'No meals recorded in this month')}
    testID={`monthly-book-${month}`} onPress={onOpen}
    style={({ pressed }) => [styles.bookItem, compact && { paddingBottom: 12 }, pressed && { opacity: .84, transform: [{ translateY: -2 }] }]}>
    <View style={[styles.cover, { width: height * .76, height }]}>
      <View style={styles.pages} />
      <Image source={getHeroAssetForMonth(index)} resizeMode="contain" style={styles.coverImage}
        accessibilityLabel={zh ? `${theme.zh}餐桌封面` : `${theme.en} illustrated table cover`} />
      <View style={styles.spine} />
      <View style={styles.coverLabel}>
        <Text style={styles.coverNumber}>{month.slice(5)}</Text>
        <Text style={styles.coverYear}>{month.slice(0, 4)}</Text>
      </View>
    </View>
    <View style={[styles.caption, compact && { marginTop: 6 }, { width: height * .76 }]}>
      <View style={styles.captionRow}><Text style={styles.bookName}>{zh ? theme.zh : theme.en}</Text><Text style={styles.openMark}>↗</Text></View>
      <Text style={styles.bookCount}>{meals.length ? (zh ? `${meals.length} 餐回忆` : `${meals.length} memories`) : (zh ? '尚无记录' : 'No meals yet')}</Text>
    </View>
  </Pressable>;
}

export default function MonthlyBookshelf({ meals, locale, year, onYearChange, onOpen, onAdd }: {
  meals: MealEntry[]; locale: 'zh' | 'en'; year: number; onYearChange: (year: number) => void;
  onOpen: (month: string) => void; onAdd: () => void;
}) {
  const zh = locale === 'zh';
  const now = new Date();
  const { height: screenHeight } = useWindowDimensions();
  const [width, setWidth] = useState(400);
  const years = [...new Set([now.getFullYear(), ...meals.map(meal => Number(meal.date.slice(0, 4)))])].sort((a, b) => a - b);
  const months = shelfMonths(year, now);
  const columns = width >= 780 ? 4 : width >= 540 ? 3 : 2;
  const coverHeight = Math.min(width >= 540 ? 220 : 156, Math.max(88, (screenHeight - 410) / 2), (width / columns - 26) / .76);
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    {Platform.OS === 'web' ? React.createElement('style', null, '@font-face{font-family:"Source Serif 4";src:url("/photobook-runtime/style/fonts/SourceSerif4-Regular.otf.woff2") format("woff2");font-weight:400;font-display:swap}') : null}
    <View style={styles.yearRow}>
      <Text style={styles.year}>{year}<Text style={styles.yearSuffix}> / {zh ? '每月一册' : 'monthly editions'}</Text></Text>
      <View style={styles.yearControls}>
        <Pressable accessibilityRole="button" accessibilityLabel={zh ? '上一年' : 'Previous year'} disabled={year <= years[0]}
          style={[styles.yearButton, year <= years[0] && styles.disabled]} onPress={() => onYearChange(year - 1)}><Text style={styles.arrow}>←</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={zh ? '下一年' : 'Next year'} disabled={year >= years.at(-1)!}
          style={[styles.yearButton, year >= years.at(-1)! && styles.disabled]} onPress={() => onYearChange(year + 1)}><Text style={styles.arrow}>→</Text></Pressable>
      </View>
    </View>
    <View style={styles.shelf}>
      {months.map(month => <View key={month} style={{ width: `${100 / columns}%` }}>
        <BookCover month={month} meals={monthMeals(meals, month)} zh={zh} height={coverHeight} compact={screenHeight < 700} onOpen={() => onOpen(month)} />
      </View>)}
    </View>
    {!meals.length ? <Pressable accessibilityRole="button" style={styles.addButton} onPress={onAdd}>
      <Text style={styles.addText}>{zh ? '从平常的一餐开始' : 'Begin with an ordinary meal'} ↗</Text>
    </Pressable> : null}
    <View style={styles.colophon}><Text style={styles.colophonMark}>m.</Text><Text style={styles.colophonText}>{zh ? '每个月一本，把日常留在书里。' : 'One book a month. A little life, kept.'}</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 0, borderTopWidth: 1, borderTopColor: '#ddd8cc', marginTop: 4, marginBottom: 8 },
  year: { fontFamily: serif, fontSize: 27, color: '#373b30' },
  yearSuffix: { fontFamily: undefined, fontSize: 11, color: '#716e61' },
  yearControls: { flexDirection: 'row' }, yearButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrow: { color: '#4d5544', fontSize: 20 }, disabled: { opacity: .28 },
  shelf: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  bookItem: { paddingBottom: 21, alignItems: 'center' },
  cover: { backgroundColor: '#eee5d2', borderRadius: 1, shadowColor: '#302a1d', shadowOpacity: .19, shadowRadius: 6, shadowOffset: { width: 4, height: 6 }, elevation: 4 },
  coverImage: { width: '100%', height: '100%' },
  pages: { position: 'absolute', top: 3, bottom: -2, width: 3, right: -3, backgroundColor: '#dfd9c8', borderRightWidth: 1, borderColor: '#f7f3e9', zIndex: -1 },
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, backgroundColor: '#544b3540', borderRightWidth: 1, borderLeftWidth: 1, borderRightColor: '#00000018', borderLeftColor: '#ffffff50' },
  coverLabel: { position: 'absolute', top: 8, left: 11, paddingHorizontal: 6, paddingVertical: 4, backgroundColor: '#faf6ebed', gap: 1 },
  coverNumber: { color: '#484335', fontFamily: serif, fontSize: 17, lineHeight: 19 },
  coverYear: { color: '#665d49', fontSize: 6, letterSpacing: .6 },
  caption: { marginTop: 9 }, captionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bookName: { color: '#373b30', fontSize: 13, flex: 1 }, openMark: { color: '#777665', fontSize: 13 },
  bookCount: { color: '#736e61', fontSize: 11, marginTop: 3 },
  colophon: { borderTopWidth: 1, borderTopColor: '#ddd8cc', paddingVertical: 22, alignItems: 'center', gap: 6 },
  colophonMark: { color: '#59604e', fontSize: 24, fontFamily: serif }, colophonText: { color: '#787265', fontSize: 12 },
  addButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }, addText: { color: '#4d5842', fontSize: 14 },
});
