import { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  View,
} from 'react-native';

import { getKeepsakeArt } from '../constants/keepsakeArt';
import { colors } from '../theme';

export type AchievementStampState =
  | 'locked'
  | 'in_progress'
  | 'unlocked'
  | 'newly_unlocked'
  | 'secret';

type AchievementStampProps = {
  iconKey: string;
  size?: number;
  locked?: boolean;
  state?: AchievementStampState;
  progressRatio?: number;
};

function getVisualState({
  locked,
  state,
}: Pick<AchievementStampProps, 'locked' | 'state'>): AchievementStampState {
  if (state) return state;
  return locked ? 'locked' : 'unlocked';
}

function ProgressTicks({
  size,
  progressRatio,
}: {
  size: number;
  progressRatio: number;
}) {
  const tickCount = 18;
  const activeTicks = Math.max(1, Math.ceil(Math.min(progressRatio, 1) * tickCount));
  const radius = size / 2 + 4;

  return (
    <View pointerEvents="none" style={[styles.tickWrap, { width: size + 18, height: size + 18 }]}>
      {Array.from({ length: tickCount }).map((_, index) => {
        const active = index < activeTicks;
        return (
          <View
            key={index}
            style={[
              styles.progressTick,
              {
                top: size / 2 + 7,
                left: size / 2 + 7,
                transform: [
                  { rotate: `${(360 / tickCount) * index}deg` },
                  { translateY: -radius },
                ],
              },
              active && styles.progressTickActive,
            ]}
          />
        );
      })}
    </View>
  );
}

function LockMark({ size }: { size: number }) {
  const markSize = Math.max(18, Math.round(size * 0.26));
  return (
    <View
      pointerEvents="none"
      style={[
        styles.lockMark,
        {
          width: markSize,
          height: markSize,
          borderRadius: markSize / 2,
          right: Math.round(size * 0.02),
          bottom: Math.round(size * 0.04),
        },
      ]}
    >
      <View
        style={[
          styles.lockLoop,
          {
            width: markSize * 0.45,
            height: markSize * 0.32,
            borderTopLeftRadius: markSize * 0.22,
            borderTopRightRadius: markSize * 0.22,
          },
        ]}
      />
      <View
        style={[
          styles.lockBody,
          {
            width: markSize * 0.48,
            height: markSize * 0.38,
            borderRadius: markSize * 0.08,
          },
        ]}
      />
    </View>
  );
}

export default function AchievementStamp({
  iconKey,
  size = 68,
  locked = false,
  state,
  progressRatio = 0,
}: AchievementStampProps) {
  const visualState = getVisualState({ locked, state });
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visualState !== 'newly_unlocked') {
      pulse.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          useNativeDriver: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, visualState]);

  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.08],
  });
  const haloOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.34, 0.72],
  });

  const showProgress = visualState === 'in_progress' && progressRatio > 0;
  const showLocked = visualState === 'locked' || visualState === 'secret';
  const showNew = visualState === 'newly_unlocked';

  return (
    <View style={[styles.wrap, { width: size + 20, height: size + 20 }]}>
      {showNew ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              width: size + 20,
              height: size + 20,
              borderRadius: (size + 20) / 2,
              opacity: haloOpacity,
              transform: [{ scale: haloScale }],
            },
          ]}
        />
      ) : null}
      {showProgress ? (
        <ProgressTicks size={size} progressRatio={progressRatio} />
      ) : null}
      <View
        style={[
          styles.paper,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
          visualState === 'unlocked' && styles.paperUnlocked,
          visualState === 'newly_unlocked' && styles.paperNew,
          showLocked && styles.paperLocked,
          visualState === 'in_progress' && styles.paperProgress,
        ]}
      >
        <Image
          source={getKeepsakeArt(iconKey)}
          resizeMode="contain"
          style={[
            styles.art,
            {
              width: size * 0.88,
              height: size * 0.88,
            },
            showLocked && styles.artLocked,
            visualState === 'in_progress' && styles.artProgress,
          ]}
        />
        {showLocked ? <View pointerEvents="none" style={styles.paperVeil} /> : null}
        {showLocked ? <LockMark size={size} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    backgroundColor: 'rgba(248, 232, 212, 0.82)',
  },
  tickWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTick: {
    position: 'absolute',
    width: 2,
    height: 7,
    borderRadius: 2,
    backgroundColor: 'rgba(214, 196, 169, 0.62)',
  },
  progressTickActive: {
    backgroundColor: 'rgba(180, 145, 88, 0.9)',
  },
  paper: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248, 232, 212, 0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.34)',
    overflow: 'visible',
  },
  paperUnlocked: {
    backgroundColor: 'rgba(255, 253, 248, 0.64)',
    borderColor: 'rgba(180, 145, 88, 0.44)',
  },
  paperNew: {
    backgroundColor: 'rgba(255, 253, 248, 0.82)',
    borderColor: 'rgba(180, 145, 88, 0.7)',
  },
  paperLocked: {
    backgroundColor: 'rgba(239, 230, 218, 0.7)',
    borderStyle: 'dashed',
    borderColor: 'rgba(116, 81, 61, 0.34)',
  },
  paperProgress: {
    backgroundColor: 'rgba(255, 248, 238, 0.7)',
    borderColor: 'rgba(180, 145, 88, 0.48)',
  },
  art: {
    opacity: 1,
  },
  artLocked: {
    opacity: 0.62,
  },
  artProgress: {
    opacity: 0.82,
  },
  paperVeil: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    backgroundColor: 'rgba(247, 239, 228, 0.34)',
  },
  lockMark: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(92, 64, 51, 0.86)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 253, 248, 0.68)',
  },
  lockLoop: {
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.background,
  },
  lockBody: {
    marginTop: -1,
    backgroundColor: colors.background,
  },
});
