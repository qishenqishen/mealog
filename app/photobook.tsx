import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import MonthlyBookReader from '../src/components/MonthlyBookReader';
import LoadState from '../src/components/LoadState';
import { useI18n } from '../src/i18n';
import { getMealCompanions, getMeals, getPeopleProfiles } from '../src/storage';
import type { MealEntry } from '../src/types';
import { isBookMonth, monthMeals, scopeMeals } from '../src/utils/monthlyBooks';
import { getPersonDisplayName } from '../src/utils/people';

export default function PhotobookScreen() {
  const params = useLocalSearchParams<{ month?: string; scope?: string }>();
  const router = useRouter();
  const { locale } = useI18n();
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [companions, setCompanions] = useState<Record<string, { personId?: string; name: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const month = isBookMonth(params.month) ? params.month : undefined;
  const scope = params.scope === 'sample' ? 'sample' : 'personal';
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    Promise.all([getMeals(), getMealCompanions(), getPeopleProfiles()]).then(([all, links, people]) => {
      if (!active) return;
      const selectedMeals = monthMeals(scopeMeals(all, scope), month ?? '');
      const peopleById = new Map(people.map(person => [person.id, person]));
      setMeals(selectedMeals);
      setCompanions(Object.fromEntries(selectedMeals.map(meal => [meal.id, links.filter(link => link.mealId === meal.id).map(link => {
        const person = peopleById.get(link.personId);
        return { personId: person?.id, name: person || link.personNameSnapshot ? getPersonDisplayName(person, link) : (locale === 'zh' ? '已删除的同桌人' : 'Deleted person') };
      })])));
    })
      .catch(() => { if (active) setError('Could not load your meals.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, scope, attempt, locale]));
  const close = () => router.canGoBack() ? router.back() : router.replace('/archive');
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    {!month || loading || error ? <View style={styles.notice}>
      <Pressable accessibilityRole="button" style={styles.back} onPress={close}><Text style={styles.text}>← {locale === 'zh' ? '返回书架' : 'Back to books'}</Text></Pressable>
      {!month ? <Text style={styles.text}>{locale === 'zh' ? '这个月份无法打开。' : 'This month is not available.'}</Text>
        : <LoadState loading={loading} error={error} onRetry={() => setAttempt(value => value + 1)} />}
    </View> : <MonthlyBookReader month={month} scope={scope} meals={meals} companions={companions} locale={locale}
      onMealPress={id => router.push(`/meal/${id}`)}
      onPersonPress={id => router.push(`/people/${encodeURIComponent(id)}`)}
      onArchive={() => router.push(`/food-album?month=${month}&scope=${scope}`)} onClose={close} />}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8f6ef' }, notice: { padding: 24, gap: 24 },
  back: { minHeight: 44, justifyContent: 'center' }, text: { color: '#515744', fontSize: 15, lineHeight: 24 },
});
