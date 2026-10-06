import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Platform,
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
  deferLoading?: boolean;
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
  deferLoading = false,
}: AchievementStampProps) {
  const visualState = getVisualState({ locked, state });
  const pulse = useRef(new Animated.Value(0)).current;
  const container = useRef<View>(null);
  const [loadArt, setLoadArt] = useState(!deferLoading || Platform.OS !== 'web');

  useEffect(() => {
    if (loadArt) return;
    if (!deferLoading || typeof IntersectionObserver === 'undefined') {
      setLoadArt(true);
      return;
    }
    // Keep the stamp's dimensions while offscreen artwork waits its turn.
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setLoadArt(true);
        observer.disconnect();
      }
    }, { rootMargin: '240px 0px' });
    if (container.current) observer.observe(container.current as unknown as Element);
    return () => observer.disconnect();
  }, [deferLoading, loadArt]);

  useEffect(() => {
    if (!loadArt || visualState !== 'newly_unlocked') {
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
  }, [pulse, visualState, loadArt]);

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
    <View ref={container} style={[styles.wrap, { width: size + 20, height: size + 20 }]}>
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
        ]}
      >
        {loadArt ? <Image
          source={getKeepsakeArt(iconKey)}
          resizeMode="contain"
          style={[
            styles.art,
            {
              width: size,
              height: size,
            },
            showLocked && styles.artLocked,
            visualState === 'in_progress' && styles.artProgress,
          ]}
        /> : null}
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
    backgroundColor: 'rgba(238, 229, 226, 0.45)',
  },
  tickWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.55,
  },
  progressTick: {
    position: 'absolute',
    width: 2,
    height: 7,
    borderRadius: 2,
    backgroundColor: 'rgba(203, 211, 199, 0.46)',
  },
  progressTickActive: {
    backgroundColor: 'rgba(143, 165, 145, 0.8)',
  },
  paper: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  art: {
    opacity: 1,
  },
  artLocked: {
    opacity: 0.32,
  },
  artProgress: {
    opacity: 0.42,
  },
  lockMark: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#93A18F',
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
