import { useI18n } from '../i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../theme';

// ── Helpers ─────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ITEM_WIDTH = 44;
const ITEM_MARGIN = 2;
const TOTAL_ITEM_WIDTH = ITEM_WIDTH + ITEM_MARGIN * 2;
const LIST_PADDING = 20;

/** Produce YYYY-MM-DD from a Date. */
function toDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Build a range of date items centred around today. */
function buildDateRange(today: Date, radius = 30) {
  const items: { key: string; day: number; weekday: string; date: Date }[] = [];
  for (let offset = -radius; offset <= radius; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    items.push({
      key: toDateKey(d),
      day: d.getDate(),
      weekday: WEEKDAYS[d.getDay()],
      date: d,
    });
  }
  return items;
}

// ── Types ───────────────────────────────────────────────────

interface Props {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onTodayPress: () => void;
}

// ── Component ───────────────────────────────────────────────

export default function DateStrip({ selectedDate, onSelectDate, onTodayPress }: Props) {
  const { t, locale } = useI18n();
  const items = useMemo(() => buildDateRange(selectedDate), [selectedDate]);
  const todayKey = toDateKey(new Date());
  const selectedKey = toDateKey(selectedDate);
  const listRef = useRef<ScrollView>(null);
  const [listWidth, setListWidth] = useState(0);

  const centerSelected = useCallback(() => {
    const index = items.findIndex((item) => item.key === selectedKey);
    if (index < 0 || listWidth <= 0) return;
    listRef.current?.scrollTo({
      x: Math.max(0, LIST_PADDING + TOTAL_ITEM_WIDTH * (index + 0.5) - listWidth / 2),
      animated: false,
    });
  }, [items, listWidth, selectedKey]);

  useEffect(() => {
    const frame = requestAnimationFrame(centerSelected);
    return () => cancelAnimationFrame(frame);
  }, [centerSelected]);

  const renderItem = useCallback(
    ({ item }: { item: (typeof items)[number] }) => {
      const isSelected = item.key === selectedKey;
      const isToday = item.key === todayKey;
      return (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={item.date.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          accessibilityState={{ selected: isSelected }}
          style={styles.item}
          onPress={() => onSelectDate(item.date)}
        >
          <Text
            style={[
              styles.day,
              isSelected && styles.daySelected,
              isToday && !isSelected && styles.dayToday,
            ]}
          >
            {item.day}
          </Text>
          <Text
            style={[
              styles.weekday,
              isSelected && styles.weekdaySelected,
              isToday && !isSelected && styles.weekdayToday,
            ]}
          >
            {t(item.weekday)}
          </Text>
          {isSelected && <View style={styles.dot} />}
        </Pressable>
      );
    },
    [selectedKey, todayKey, onSelectDate, t, locale],
  );

  const isToday = selectedKey === todayKey;

  return (
    <View style={styles.container}>
      <ScrollView
        ref={listRef}
        style={styles.list}
        horizontal
        onLayout={(event) => setListWidth(event.nativeEvent.layout.width)}
        onContentSizeChange={centerSelected}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      >
        {items.map((item) => renderItem({ item }))}
      </ScrollView>

      {/* TOD pill — jumps back to today */}
      <Pressable
        style={[styles.todPill, isToday && styles.todPillMuted]}
        onPress={onTodayPress}
        accessibilityRole="button"
        accessibilityLabel={t('Today')}
        hitSlop={8}
      >
        <Text style={[styles.todText, isToday && styles.todTextMuted]}>{t("TOD")}</Text>
      </Pressable>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minWidth: 0,
  },
  list: {
    flex: 1,
    minWidth: 0,
    height: 46,
  },
  listContent: {
    paddingLeft: LIST_PADDING,
    paddingRight: 8,
  },
  item: {
    width: ITEM_WIDTH,
    flexShrink: 0,
    marginHorizontal: ITEM_MARGIN,
    alignItems: 'center',
    paddingVertical: 4,
  },
  day: {
    fontSize: 15,
    fontWeight: '400',
    color: colors.muted,
    marginBottom: 2,
  },
  daySelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  dayToday: {
    color: colors.secondary,
  },
  weekday: {
    fontSize: 9,
    color: colors.border,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  weekdaySelected: {
    color: colors.secondary,
  },
  weekdayToday: {
    color: colors.muted,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginTop: 3,
  },
  todPill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    marginRight: 20,
    marginLeft: 4,
  },
  todPillMuted: {
    opacity: 0.4,
  },
  todText: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: 0.3,
  },
  todTextMuted: {
    color: colors.border,
  },
});
