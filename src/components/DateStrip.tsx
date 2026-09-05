import { useCallback, useEffect, useRef } from 'react';
import {
  FlatList,
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
  const today = useRef(new Date()).current;
  const items = useRef(buildDateRange(today)).current;
  const todayKey = toDateKey(today);
  const selectedKey = toDateKey(selectedDate);
  const listRef = useRef<FlatList>(null);

  // Centre on selected date on mount.
  const centreIndex = items.findIndex((i) => i.key === selectedKey);
  useEffect(() => {
    if (centreIndex >= 0) {
      // Small delay so FlatList has laid out.
      const t = setTimeout(() => {
        listRef.current?.scrollToIndex({ index: centreIndex, animated: false, viewPosition: 0.5 });
      }, 50);
      return () => clearTimeout(t);
    }
  }, []); // only on mount

  const renderItem = useCallback(
    ({ item }: { item: (typeof items)[number] }) => {
      const isSelected = item.key === selectedKey;
      const isToday = item.key === todayKey;
      return (
        <Pressable
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
            {item.weekday}
          </Text>
          {isSelected && <View style={styles.dot} />}
        </Pressable>
      );
    },
    [selectedKey, todayKey, onSelectDate],
  );

  const isToday = selectedKey === todayKey;

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(i) => i.key}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({
          length: TOTAL_ITEM_WIDTH,
          offset: TOTAL_ITEM_WIDTH * index,
          index,
        })}
        contentContainerStyle={styles.listContent}
      />

      {/* TOD pill — jumps back to today */}
      <Pressable
        style={[styles.todPill, isToday && styles.todPillMuted]}
        onPress={onTodayPress}
        hitSlop={8}
      >
        <Text style={[styles.todText, isToday && styles.todTextMuted]}>TOD</Text>
      </Pressable>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listContent: {
    paddingLeft: 20,
    paddingRight: 8,
  },
  item: {
    width: ITEM_WIDTH,
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
