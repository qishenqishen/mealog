import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { colors } from '../theme';

export default function LoadState({ loading, error, onRetry }: {
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  if (!loading && !error) return null;
  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <Text style={styles.message}>{t(loading ? 'Loading...' : error!)}</Text>
      {!loading && onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
          <Text style={styles.message}>{t('Retry')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 16, gap: 8 },
  message: { color: colors.secondary, fontSize: 14, lineHeight: 21 },
  retry: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 8 },
});
