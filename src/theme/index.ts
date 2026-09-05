import { StyleSheet } from 'react-native';

// ── Mealogue design tokens ──────────────────────────────────
// Warm, quiet neutrals with restrained seasonal accents.

export const colors = {
  background: '#FFF8F0',
  surface: '#FFFDF8',
  surfaceWarm: '#FFF4E6',
  primary: '#5C4033',
  primaryBrown: '#5C4033',
  secondary: '#8F735C',
  text: '#4E382E',
  muted: '#B9A58A',
  mutedText: '#8D7B66',
  border: '#EADFCC',
  accent: '#F8E8D4',
  accentSoft: '#FFF1E1',
  destructive: '#C97862',
  destructiveSoft: '#F8E4DD',
  shadow: '#3E2B21',
  spring: '#A9B985',
  summer: '#D7B46A',
  autumn: '#B97A56',
  winter: '#9EA8B4',
} as const;

export const seasonalColors = {
  spring: {
    accent: colors.spring,
    wash: '#F3F5E8',
  },
  summer: {
    accent: colors.summer,
    wash: '#FFF2CF',
  },
  autumn: {
    accent: colors.autumn,
    wash: '#F8E7DB',
  },
  winter: {
    accent: colors.winter,
    wash: '#EDF1F3',
  },
} as const;

// ── Spacing ─────────────────────────────────────────────────

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
} as const;

// ── Border Radius ───────────────────────────────────────────

export const radii = {
  sm: 8,
  md: 10,
  lg: 12,
  card: 14,
} as const;

// ── Typography ──────────────────────────────────────────────

export const type = {
  display: { fontSize: 34, fontWeight: '700' as const, letterSpacing: 0 },
  title: { fontSize: 28, fontWeight: '700' as const, letterSpacing: 0 },
  heading: { fontSize: 24, fontWeight: '700' as const, letterSpacing: 0 },
  body: { fontSize: 16 },
  bodySmall: { fontSize: 15 },
  caption: { fontSize: 14 },
  small: { fontSize: 13 },
  tiny: { fontSize: 12 },
  label: { fontSize: 14, fontWeight: '600' as const },
  stat: { fontSize: 32, fontWeight: '700' as const },
  tab: { fontSize: 11, fontWeight: '600' as const },
  button: { fontSize: 17, fontWeight: '700' as const },
  buttonSmall: { fontSize: 16, fontWeight: '600' as const },
  eyebrow: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 1 },
} as const;

// ── Shadows ─────────────────────────────────────────────────

export const shadow = {
  card: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  soft: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
} as const;

// ── Shared style fragments ──────────────────────────────────

export const shared = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    ...shadow.card,
  },
});
