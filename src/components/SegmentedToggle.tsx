import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, type as T } from '../theme';

interface SegmentedToggleProps {
  segments: string[];
  activeIndex: number;
  onPress: (index: number) => void;
}

export default function SegmentedToggle({
  segments,
  activeIndex,
  onPress,
}: SegmentedToggleProps) {
  return (
    <View style={styles.container}>
      {segments.map((label, i) => {
        const active = i === activeIndex;
        return (
          <Pressable
            key={label}
            onPress={() => onPress(i)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'rgba(240, 230, 214, 0.5)',
    borderRadius: 20,
    padding: 3,
    alignSelf: 'center',
  },
  segment: {
    paddingHorizontal: 24,
    paddingVertical: 7,
    borderRadius: 17,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: {
    ...T.small,
    color: colors.muted,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  labelActive: {
    color: colors.primary,
    fontWeight: '600',
  },
});
