import { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import {
  ensureGuestIdentity,
  getUserIdentity,
  updateLocalProfile,
  type UserIdentity,
} from '../src/auth';
import { seedDemoData } from '../src/demo/seedData';
import { colors, shadow } from '../src/theme';

function notify(message: string) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    alert(message);
    return;
  }
  Alert.alert('Mealog', message);
}

export default function ProfileScreen() {
  const router = useRouter();
  const [identity, setIdentity] = useState<UserIdentity | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [preparingDemo, setPreparingDemo] = useState(false);

  const loadIdentity = useCallback(async () => {
    const current = await getUserIdentity();
    setIdentity(current);
    setDisplayName(current?.displayName ?? '');
    setNote(current?.note ?? '');
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadIdentity();
    }, [loadIdentity]),
  );

  const handleContinueGuest = async () => {
    const next = await ensureGuestIdentity();
    setIdentity(next);
    setDisplayName(next.displayName);
    setNote(next.note ?? '');
    notify('Guest mode is ready. Your meals stay on this device.');
  };

  const handlePrepareDemo = async () => {
    if (preparingDemo) return;
    setPreparingDemo(true);
    try {
      const result = await seedDemoData();
      notify(`Showcase table ready: ${result.mealsPrepared} meals, ${result.peoplePrepared} people, ${result.sharedPhotosPrepared} shared photos, ${result.keepsakesFound} keepsakes. Open ${result.anchorMonth} in Archive to show the full chain.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Mealog could not prepare the showcase table.');
    } finally {
      setPreparingDemo(false);
    }
  };

  const handleSaveProfile = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const next = await updateLocalProfile({ displayName, note });
      setIdentity(next);
      notify('Your local table profile was saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Mealog profile</Text>
          <Text style={styles.title}>A seat for you</Text>
          <Text style={styles.subtitle}>
            A local-first profile for this phone demo. Meals, people, photos, and keepsakes stay together on this device.
          </Text>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Current mode</Text>
          <Text style={styles.statusTitle}>
            {identity ? 'Local guest profile' : 'No local profile yet'}
          </Text>
          <Text style={styles.statusBody}>
            {identity
              ? `${identity.displayName} · data id ${identity.id.slice(0, 8)}`
              : 'Continue as guest to create a local identity for new meals.'}
          </Text>
        </View>

        <View style={styles.demoCard}>
          <Text style={styles.demoKicker}>Showcase mode</Text>
          <Text style={styles.demoTitle}>Prepare a table with memories</Text>
          <Text style={styles.demoBody}>
            Add a small set of sample meals, companions, photos, notes, moods, and keepsakes so the full Mealog journey can be shown on a phone immediately.
          </Text>
          <Pressable style={styles.demoButton} onPress={handlePrepareDemo}>
            <Text style={styles.demoButtonText}>{preparingDemo ? 'Preparing...' : 'Prepare showcase table'}</Text>
          </Pressable>
        </View>

        <View style={styles.paper}>
          <Text style={styles.sectionTitle}>Local profile</Text>
          <Text style={styles.fieldLabel}>Name shown in Mealog</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Guest at the table"
            placeholderTextColor="rgba(141, 123, 102, 0.52)"
            style={styles.input}
          />
          <Text style={styles.fieldLabel}>Small note</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="A line for this device profile..."
            placeholderTextColor="rgba(141, 123, 102, 0.52)"
            style={[styles.input, styles.noteInput]}
            multiline
          />
          <Pressable style={styles.primaryButton} onPress={handleSaveProfile}>
            <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save local profile'}</Text>
          </Pressable>
        </View>


        <Pressable style={styles.guestButton} onPress={handleContinueGuest}>
          <Text style={styles.guestButtonText}>Continue as guest</Text>
        </Pressable>

        <Pressable style={styles.reviewButton} onPress={() => router.push('/onboarding')}>
          <Text style={styles.reviewButtonText}>Review onboarding and permissions</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 118 },
  header: { marginBottom: 24 },
  kicker: { fontSize: 12, color: colors.muted, marginBottom: 7 },
  title: { fontSize: 34, lineHeight: 40, fontStyle: 'italic', color: colors.primary },
  subtitle: { marginTop: 8, maxWidth: 330, fontSize: 14, lineHeight: 21, color: colors.mutedText },
  statusCard: { borderRadius: 26, padding: 18, marginBottom: 18, backgroundColor: 'rgba(255, 253, 248, 0.68)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(185, 165, 138, 0.24)', ...shadow.soft },
  statusLabel: { fontSize: 11, color: colors.muted, marginBottom: 6 },
  statusTitle: { fontSize: 21, lineHeight: 27, color: colors.primary, fontStyle: 'italic' },
  statusBody: { marginTop: 7, fontSize: 13, lineHeight: 19, color: colors.mutedText },
  demoCard: { borderRadius: 26, padding: 18, marginBottom: 18, backgroundColor: 'rgba(248, 232, 212, 0.4)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(185, 165, 138, 0.28)' },
  demoKicker: { fontSize: 11, color: colors.muted, marginBottom: 7 },
  demoTitle: { fontSize: 22, lineHeight: 28, color: colors.primary, fontStyle: 'italic', marginBottom: 8 },
  demoBody: { fontSize: 13, lineHeight: 20, color: colors.mutedText, marginBottom: 14 },
  demoButton: { borderRadius: 18, minHeight: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 253, 248, 0.74)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(92, 64, 51, 0.24)' },
  demoButtonText: { color: colors.primary, fontSize: 14, fontStyle: 'italic', fontWeight: '600' },
  paper: { borderRadius: 22, padding: 18, marginBottom: 18, backgroundColor: 'rgba(255, 253, 248, 0.5)', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(185, 165, 138, 0.3)' },
  sectionTitle: { fontSize: 22, lineHeight: 28, fontStyle: 'italic', color: colors.primary, marginBottom: 16 },
  fieldLabel: { fontSize: 12, color: colors.mutedText, marginBottom: 7 },
  input: { minHeight: 44, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 15, backgroundColor: 'rgba(255, 255, 255, 0.5)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(185, 165, 138, 0.24)', color: colors.primary, fontSize: 15 },
  noteInput: { minHeight: 82, textAlignVertical: 'top' },
  primaryButton: { borderRadius: 18, minHeight: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  primaryButtonText: { color: colors.background, fontSize: 14, fontWeight: '600' },
  guestButton: { borderRadius: 18, minHeight: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 253, 248, 0.62)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(185, 165, 138, 0.28)', marginBottom: 12 },
  guestButtonText: { color: colors.primary, fontSize: 14, fontStyle: 'italic' },
  reviewButton: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 10 },
  reviewButtonText: { color: colors.mutedText, fontSize: 12, fontStyle: 'italic' },
});
