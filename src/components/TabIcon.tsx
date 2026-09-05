import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';

export type TabIconName = 'home' | 'archive' | 'add' | 'insights' | 'collection';
export type CollectionIconVariant = 'forkKnife' | 'chopsticks' | 'forkSpoon';

export const COLLECTION_FINAL_ICON_VARIANT: CollectionIconVariant = 'forkKnife';

export const COLLECTION_ICON_VARIANTS: {
  variant: CollectionIconVariant;
  label: string;
  note: string;
}[] = [
  {
    variant: 'forkKnife',
    label: 'Fork + knife',
    note: 'Most direct and readable at tab size.',
  },
  {
    variant: 'chopsticks',
    label: 'Chopsticks',
    note: 'Quiet and elegant, but less instantly readable in the small bar.',
  },
  {
    variant: 'forkSpoon',
    label: 'Fork + spoon',
    note: 'Friendly and soft, slightly less refined than fork + knife.',
  },
];

type TabIconProps = {
  name: TabIconName;
  focused: boolean;
  collectionVariant?: CollectionIconVariant;
};

export function TabIcon({
  name,
  focused,
  collectionVariant = COLLECTION_FINAL_ICON_VARIANT,
}: TabIconProps) {
  const tint = focused ? colors.primary : 'rgba(141, 123, 102, 0.38)';

  if (name === 'home') {
    return (
      <View style={styles.iconBox}>
        <View style={[styles.plateGlyph, { borderColor: tint }]}>
          <View style={[styles.plateGlyphInner, { borderColor: tint }]} />
        </View>
      </View>
    );
  }

  if (name === 'archive') {
    return (
      <View style={styles.iconBox}>
        <View style={[styles.archiveBack, { borderColor: tint }]} />
        <View style={[styles.archivePage, { borderColor: tint }]} />
      </View>
    );
  }

  if (name === 'add') {
    return (
      <View style={styles.iconBox}>
        <View style={[styles.addRing, { borderColor: tint }]}>
          <View style={[styles.addLineHorizontal, { backgroundColor: tint }]} />
          <View style={[styles.addLineVertical, { backgroundColor: tint }]} />
        </View>
      </View>
    );
  }

  if (name === 'insights') {
    return (
      <View style={styles.iconBox}>
        <View style={[styles.sparkLineOne, { backgroundColor: tint }]} />
        <View style={[styles.sparkLineTwo, { backgroundColor: tint }]} />
        <View style={[styles.sparkDot, { backgroundColor: tint }]} />
      </View>
    );
  }

  return (
    <View style={styles.iconBox}>
      <CollectionUtensilIcon variant={collectionVariant} tint={tint} />
    </View>
  );
}

function CollectionUtensilIcon({
  variant,
  tint,
}: {
  variant: CollectionIconVariant;
  tint: string;
}) {
  if (variant === 'chopsticks') {
    return (
      <View style={styles.chopstickBox}>
        <View
          style={[
            styles.chopstick,
            styles.chopstickBack,
            { backgroundColor: tint },
          ]}
        />
        <View
          style={[
            styles.chopstick,
            styles.chopstickFront,
            { backgroundColor: tint },
          ]}
        />
        <View style={[styles.chopstickRest, { borderColor: tint }]} />
      </View>
    );
  }

  if (variant === 'forkSpoon') {
    return (
      <View style={styles.utensilSet}>
        <ForkGlyph tint={tint} />
        <SpoonGlyph tint={tint} />
      </View>
    );
  }

  return (
    <View style={styles.utensilSet}>
      <ForkGlyph tint={tint} />
      <KnifeGlyph tint={tint} />
    </View>
  );
}

function ForkGlyph({ tint }: { tint: string }) {
  return (
    <View style={styles.forkGlyph}>
      <View style={styles.forkTines}>
        <View style={[styles.forkTine, { backgroundColor: tint }]} />
        <View style={[styles.forkTine, { backgroundColor: tint }]} />
        <View style={[styles.forkTine, { backgroundColor: tint }]} />
      </View>
      <View style={[styles.forkShoulder, { backgroundColor: tint }]} />
      <View style={[styles.forkStem, { backgroundColor: tint }]} />
    </View>
  );
}

function KnifeGlyph({ tint }: { tint: string }) {
  return (
    <View style={styles.knifeGlyph}>
      <View style={[styles.knifeBlade, { borderColor: tint }]} />
      <View style={[styles.knifeHandle, { backgroundColor: tint }]} />
    </View>
  );
}

function SpoonGlyph({ tint }: { tint: string }) {
  return (
    <View style={styles.spoonGlyph}>
      <View style={[styles.spoonBowl, { borderColor: tint }]} />
      <View style={[styles.spoonStem, { backgroundColor: tint }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  iconBox: {
    width: 28,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plateGlyph: {
    width: 22,
    height: 16,
    borderRadius: 16,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plateGlyphInner: {
    width: 12,
    height: 7,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  archiveBack: {
    position: 'absolute',
    width: 17,
    height: 19,
    borderRadius: 4,
    borderWidth: 1,
    transform: [{ rotate: '-6deg' }],
    opacity: 0.42,
  },
  archivePage: {
    width: 17,
    height: 19,
    borderRadius: 4,
    borderWidth: 1.15,
    backgroundColor: colors.background,
  },
  addRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLineHorizontal: {
    width: 10,
    height: 1.2,
    borderRadius: 2,
  },
  addLineVertical: {
    position: 'absolute',
    width: 1.2,
    height: 10,
    borderRadius: 2,
  },
  sparkLineOne: {
    width: 1.2,
    height: 22,
    borderRadius: 2,
  },
  sparkLineTwo: {
    position: 'absolute',
    width: 18,
    height: 1.2,
    borderRadius: 2,
    transform: [{ rotate: '-24deg' }],
  },
  sparkDot: {
    position: 'absolute',
    right: 4,
    top: 2,
    width: 3,
    height: 3,
    borderRadius: 2,
    opacity: 0.68,
  },
  utensilSet: {
    width: 24,
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  forkGlyph: {
    width: 7,
    height: 23,
    alignItems: 'center',
  },
  forkTines: {
    height: 6,
    flexDirection: 'row',
    gap: 1.15,
    alignItems: 'flex-start',
  },
  forkTine: {
    width: 1.15,
    height: 6,
    borderRadius: 2,
  },
  forkShoulder: {
    width: 6.2,
    height: 1.15,
    borderRadius: 2,
    marginTop: 0.8,
  },
  forkStem: {
    width: 1.25,
    height: 14.4,
    borderRadius: 2,
    marginTop: -0.2,
  },
  knifeGlyph: {
    width: 7,
    height: 23,
    alignItems: 'center',
  },
  knifeBlade: {
    width: 5.8,
    height: 13.6,
    borderRadius: 6,
    borderWidth: 1.15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  knifeHandle: {
    width: 1.35,
    height: 8,
    borderRadius: 2,
    marginTop: -0.4,
  },
  spoonGlyph: {
    width: 8,
    height: 23,
    alignItems: 'center',
  },
  spoonBowl: {
    width: 7.4,
    height: 9,
    borderRadius: 7,
    borderWidth: 1.15,
  },
  spoonStem: {
    width: 1.25,
    height: 13.4,
    borderRadius: 2,
    marginTop: -0.2,
  },
  chopstickBox: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chopstick: {
    position: 'absolute',
    top: 1,
    width: 1.45,
    height: 22,
    borderRadius: 2,
  },
  chopstickBack: {
    left: 9,
    transform: [{ rotate: '-15deg' }],
  },
  chopstickFront: {
    right: 9,
    transform: [{ rotate: '-15deg' }],
  },
  chopstickRest: {
    position: 'absolute',
    bottom: 4,
    width: 10,
    height: 4,
    borderTopWidth: 1.1,
    borderRadius: 6,
    opacity: 0.72,
  },
});
