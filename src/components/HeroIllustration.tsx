import { Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { MonthKey, Season } from '../utils/season';
import {
  getMonthKey,
  getMonthKeyForDate,
  getRepresentativeMonthForSeason,
} from '../utils/season';
import { getHeroAsset, getHeroAspectRatio } from '../utils/heroAssets';
import { getHeroHotspots, type HeroHotspot } from '../utils/heroHotspots';
import { colors } from '../theme';

interface Props {
  month?: MonthKey;
  monthIndex?: number;
  date?: Date;
  /** Backward-compatible fallback for old season-only callers. */
  season?: Season;
  onMealPress?: () => void;
  onPeoplePress?: () => void;
  onPlatePress?: () => void;
  onChairPress?: () => void;
}

/**
 * Hero scene illustration with soft circular affordances overlaid on the
 * plate and chair positions. The markers are positioned using
 * percentages of the rendered image rect (after contain scaling).
 */
export default function HeroIllustration({
  month,
  monthIndex,
  date,
  season,
  onMealPress,
  onPeoplePress,
  onPlatePress,
  onChairPress,
}: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();

  const resolvedMonth = month
    ?? (monthIndex !== undefined
      ? getMonthKey(monthIndex)
      : date
        ? getMonthKeyForDate(date)
        : season
          ? getRepresentativeMonthForSeason(season)
          : getMonthKeyForDate(new Date()));
  const source = getHeroAsset(resolvedMonth);
  const imageAspectRatio = getHeroAspectRatio(resolvedMonth);
  const hotspots = getHeroHotspots(resolvedMonth);
  const mealPress = onMealPress ?? onPlatePress;
  const peoplePress = onPeoplePress ?? onChairPress;

  const containerH = screenH * 0.76;
  const containerW = screenW;

  // Compute the actual rendered rect after contain scaling.
  const containerAspect = containerW / containerH;
  let imgW: number, imgH: number;
  if (containerAspect > imageAspectRatio) {
    imgH = containerH;
    imgW = containerH * imageAspectRatio;
  } else {
    imgW = containerW;
    imgH = containerW / imageAspectRatio;
  }
  const imgLeft = (containerW - imgW) / 2;
  const imgTop = (containerH - imgH) / 2;

  const getMarkerStyle = (hotspot: HeroHotspot) => {
    const cx = imgLeft + imgW * hotspot.x;
    const cy = imgTop + imgH * hotspot.y;
    const size = Math.max(44, hotspot.radius * 4);
    return {
      left: cx - size / 2,
      top: cy - size / 2,
      width: size,
      height: size,
      borderRadius: size / 2,
    };
  };

  return (
    <View style={{ width: containerW, height: containerH }}>
      <Image
        source={source}
        style={{ width: containerW, height: containerH }}
        resizeMode="contain"
        accessibilityLabel={`Illustrated ${resolvedMonth} dining table memory scene`}
      />

      {/* Meal marker */}
      {mealPress && (
        <Pressable
          onPress={mealPress}
          hitSlop={10}
          accessibilityLabel={hotspots.meal.accessibilityLabel}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.marker,
            getMarkerStyle(hotspots.meal),
            pressed && styles.markerPressed,
          ]}
        >
          <View style={styles.markerGlow} />
          <View style={styles.markerCenter}>
            <View style={styles.markerCrossHorizontal} />
            <View style={styles.markerCrossVertical} />
          </View>
        </Pressable>
      )}

      {/* People marker */}
      {peoplePress && (
        <Pressable
          onPress={peoplePress}
          hitSlop={10}
          accessibilityLabel={hotspots.people.accessibilityLabel}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.marker,
            getMarkerStyle(hotspots.people),
            pressed && styles.markerPressed,
          ]}
        >
          <View style={styles.markerGlow} />
          <View style={styles.markerCenter}>
            <View style={styles.markerCrossHorizontal} />
            <View style={styles.markerCrossVertical} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  marker: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 253, 248, 0.44)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.28)',
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  markerPressed: {
    opacity: 0.86,
    transform: [{ scale: 1.08 }],
  },
  markerGlow: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 248, 238, 0.58)',
  },
  markerCenter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
  },
  markerCrossHorizontal: {
    position: 'absolute',
    width: 11,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(92, 64, 51, 0.42)',
  },
  markerCrossVertical: {
    position: 'absolute',
    width: StyleSheet.hairlineWidth,
    height: 11,
    backgroundColor: 'rgba(92, 64, 51, 0.42)',
  },
});
