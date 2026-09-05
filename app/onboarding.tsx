import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ensureGuestIdentity } from '../src/auth';
import { completeOnboarding } from '../src/storage';
import {
  PermissionKind,
  PermissionResult,
  requestPermission,
} from '../src/services/permissions';
import { colors, shadow } from '../src/theme';

type OnboardingKind = 'story' | 'permissions' | 'identity';
type SceneKey = 'welcome' | 'photos' | 'company' | 'permissions' | 'guest';

type OnboardingPage = {
  eyebrow: string;
  title: string;
  body: string;
  scene: SceneKey;
  kind: OnboardingKind;
  chips?: string[];
};

const SCENE_IMAGES = {
  welcome: require('../assets/onboarding/welcome-table-memory.png'),
  photos: require('../assets/onboarding/photos-stay-scene.png'),
  company: require('../assets/onboarding/company-table-scene.png'),
  permissions: require('../assets/onboarding/permissions-scene.png'),
  guest: require('../assets/onboarding/enter-mealog-scene.png'),
} as const;

const PAGES: OnboardingPage[] = [
  {
    eyebrow: 'Welcome to Mealog',
    title: 'Keep meals as memories.',
    body: 'A plate, a cup, a note from the room. Mealog keeps ordinary meals with the softness they deserve.',
    scene: 'welcome',
    kind: 'story',
    chips: ['meal', 'mood', 'note'],
  },
  {
    eyebrow: 'Photos saved here',
    title: 'Pictures stay with the memory.',
    body: 'When you add a photo, Mealog keeps its own copy inside the app, so a saved meal does not depend on the original file staying in your library.',
    scene: 'photos',
    kind: 'story',
    chips: ['photo copy', 'local-first'],
  },
  {
    eyebrow: 'Seats around the table',
    title: 'Remember who was there.',
    body: 'A meal can be just yours, shared with someone familiar, or held by a whole table. The chair remembers the company.',
    scene: 'company',
    kind: 'story',
    chips: ['companions', 'shared photos'],
  },
  {
    eyebrow: 'Optional permissions',
    title: 'Choose what Mealog may use.',
    body: 'Photos, camera, and location are only requested when you choose them. You can skip now and turn them on later.',
    scene: 'permissions',
    kind: 'permissions',
  },
  {
    eyebrow: 'Local for now',
    title: 'Enter quietly as guest.',
    body: 'For this product demo, your table starts as a private guest space on this device. Add meals, remember people, save photos, and collect keepsakes.',
    scene: 'guest',
    kind: 'identity',
    chips: ['guest mode', 'no account required'],
  },
];

const PERMISSION_LABELS: Record<PermissionKind, { title: string; body: string }> = {
  photos: {
    title: 'Photos',
    body: 'Choose images for meals and shared table photos.',
  },
  camera: {
    title: 'Camera',
    body: 'Take a meal photo directly when the moment is fresh.',
  },
  location: {
    title: 'Location',
    body: 'Optionally remember where a meal happened.',
  },
};

function notify(title: string, message: string) {
  Alert.alert(title, message);
}

function permissionStatusText(result?: PermissionResult) {
  if (!result) return 'Not asked';
  if (result.granted) return result.status === 'limited' ? 'Limited' : 'Enabled';
  if (result.status === 'denied') return 'Denied';
  return 'Not asked';
}

function PageChips({ chips }: { chips?: string[] }) {
  if (!chips?.length) return null;

  return (
    <View style={styles.chipRow}>
      {chips.map((chip) => (
        <View key={chip} style={styles.chip}>
          <Text style={styles.chipText}>{chip}</Text>
        </View>
      ))}
    </View>
  );
}

function OnboardingScene({ scene }: { scene: SceneKey }) {
  const motion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(motion, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(motion, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [motion]);

  const sceneMotion = {
    opacity: motion.interpolate({
      inputRange: [0, 1],
      outputRange: [0.96, 1],
    }),
    transform: [
      {
        translateY: motion.interpolate({
          inputRange: [0, 1],
          outputRange: [2, -3],
        }),
      },
      {
        scale: motion.interpolate({
          inputRange: [0, 1],
          outputRange: [0.996, 1.012],
        }),
      },
    ],
  };

  return (
    <View style={styles.sceneStage}>
      <Animated.Image
        source={SCENE_IMAGES[scene]}
        style={[styles.sceneArtwork, sceneMotion]}
        resizeMode="contain"
      />
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [entering, setEntering] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState<PermissionKind | null>(null);
  const [permissionResults, setPermissionResults] = useState<
    Partial<Record<PermissionKind, PermissionResult>>
  >({});

  const page = PAGES[pageIndex];
  const lastPage = pageIndex === PAGES.length - 1;
  const minPageHeight = Math.max(560, height - 154);

  const scrollToPage = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(PAGES.length - 1, nextIndex));
    scrollRef.current?.scrollTo({ x: width * clamped, animated: true });
    setPageIndex(clamped);
  };

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    setPageIndex(Math.max(0, Math.min(PAGES.length - 1, nextIndex)));
  };

  const handlePermission = async (kind: PermissionKind) => {
    if (permissionBusy) return;
    setPermissionBusy(kind);
    try {
      const result = await requestPermission(kind);
      setPermissionResults((current) => ({ ...current, [kind]: result }));
      if (!result.granted && result.message) {
        notify('Permission not enabled', result.message);
      }
    } catch {
      notify('Permission unavailable', 'Mealog could not open this permission request right now.');
    } finally {
      setPermissionBusy(null);
    }
  };
  const handleComplete = async () => {
    if (entering) return;
    setEntering(true);
    try {
      await ensureGuestIdentity();
      await completeOnboarding();
      router.replace('/');
    } catch {
      setEntering(false);
      notify('Could not enter Mealog', 'Please try again in a moment.');
    }
  };

  const handlePrimary = () => {
    if (lastPage) {
      void handleComplete();
      return;
    }
    scrollToPage(pageIndex + 1);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          scrollEventThrottle={16}
          style={styles.pager}
        >
          {PAGES.map((item) => (
            <View key={item.title} style={[styles.page, { width }]}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                  styles.pageScrollContent,
                  { minHeight: minPageHeight },
                ]}
              >
                <OnboardingScene scene={item.scene} />

                <View style={styles.copyBlock}>
                  <Text style={styles.eyebrow}>{item.eyebrow}</Text>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.body}>{item.body}</Text>
                  <PageChips chips={item.chips} />
                </View>

                {item.kind === 'permissions' ? (
                  <View style={styles.permissionPanel}>
                    {(Object.keys(PERMISSION_LABELS) as PermissionKind[]).map((kind) => {
                      const details = PERMISSION_LABELS[kind];
                      const result = permissionResults[kind];
                      const busy = permissionBusy === kind;
                      return (
                        <Pressable
                          key={kind}
                          accessibilityRole="button"
                          accessibilityLabel={`Enable ${details.title} permission`}
                          style={({ pressed }) => [
                            styles.permissionButton,
                            result?.granted && styles.permissionButtonGranted,
                            pressed && styles.buttonPressed,
                          ]}
                          onPress={() => handlePermission(kind)}
                          disabled={Boolean(permissionBusy)}
                        >
                          <View style={styles.permissionCopy}>
                            <Text style={styles.permissionTitle}>{details.title}</Text>
                            <Text style={styles.permissionBody}>{details.body}</Text>
                          </View>
                          <Text
                            style={[
                              styles.permissionStatus,
                              result?.granted && styles.permissionStatusGranted,
                            ]}
                          >
                            {busy ? 'Opening' : permissionStatusText(result)}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.skipPermissionButton,
                        pressed && styles.buttonPressed,
                      ]}
                      onPress={() => scrollToPage(pageIndex + 1)}
                    >
                      <Text style={styles.skipPermissionText}>Skip for now</Text>
                    </Pressable>
                  </View>
                ) : null}
              </ScrollView>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {PAGES.map((item, index) => (
              <View
                key={item.title}
                style={[styles.dot, index === pageIndex && styles.dotActive]}
              />
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back to previous onboarding page"
              style={({ pressed }) => [
                styles.backButton,
                pageIndex === 0 && styles.backButtonHidden,
                pressed && pageIndex > 0 && styles.buttonPressed,
              ]}
              onPress={() => scrollToPage(pageIndex - 1)}
              disabled={pageIndex === 0}
            >
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={lastPage ? 'Enter Mealog as guest' : `Continue from ${page.title}`}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                entering && styles.primaryButtonDisabled,
              ]}
              onPress={handlePrimary}
              disabled={entering}
            >
              <Text style={styles.primaryButtonText}>
                {lastPage ? 'Enter Mealog' : 'Continue'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingTop: 8,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    paddingHorizontal: 22,
  },
  pageScrollContent: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 24,
  },
  sceneStage: {
    height: 316,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  sceneArtwork: {
    width: 336,
    height: 296,
  },
  copyBlock: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 2,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.mutedText,
    marginBottom: 9,
  },
  title: {
    maxWidth: 360,
    fontSize: 34,
    lineHeight: 39,
    fontStyle: 'italic',
    color: colors.primary,
  },
  body: {
    marginTop: 14,
    maxWidth: 362,
    fontSize: 15,
    lineHeight: 23,
    color: colors.mutedText,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 18,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: 'rgba(255, 253, 248, 0.76)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.34)',
  },
  chipText: {
    fontSize: 12,
    color: colors.secondary,
    fontStyle: 'italic',
  },
  permissionPanel: {
    marginTop: 22,
    gap: 10,
  },
  permissionButton: {
    minHeight: 72,
    borderRadius: 22,
    paddingHorizontal: 15,
    paddingVertical: 13,
    backgroundColor: 'rgba(255, 253, 248, 0.84)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.34)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  permissionButtonGranted: {
    backgroundColor: 'rgba(243, 245, 232, 0.88)',
    borderColor: 'rgba(169, 185, 133, 0.58)',
  },
  permissionCopy: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '600',
  },
  permissionBody: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: colors.mutedText,
  },
  permissionStatus: {
    minWidth: 76,
    textAlign: 'right',
    fontSize: 12,
    color: colors.muted,
    fontStyle: 'italic',
  },
  permissionStatusGranted: {
    color: colors.spring,
  },
  skipPermissionButton: {
    alignSelf: 'center',
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipPermissionText: {
    fontSize: 13,
    color: colors.mutedText,
    fontStyle: 'italic',
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: Platform.select({ ios: 18, default: 16 }),
    backgroundColor: 'rgba(255, 248, 240, 0.94)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(234, 223, 204, 0.58)',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(185, 165, 138, 0.34)',
  },
  dotActive: {
    width: 24,
    backgroundColor: 'rgba(92, 64, 51, 0.72)',
  },
  actions: {
    maxWidth: 430,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  backButton: {
    minWidth: 84,
    minHeight: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonHidden: {
    opacity: 0,
  },
  backButtonText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: colors.mutedText,
  },
  primaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    ...shadow.card,
  },
  primaryButtonDisabled: {
    opacity: 0.62,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.surface,
  },
  buttonPressed: {
    opacity: 0.72,
  },
});
