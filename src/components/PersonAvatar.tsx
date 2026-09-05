import { Image, StyleSheet, Text, View } from 'react-native';

import type { PersonProfile } from '../types';
import { colors } from '../theme';
import { getPersonDisplayName, getPersonInitials } from '../utils/people';

export default function PersonAvatar({
  person,
  name,
  avatarUrl,
  size = 42,
}: {
  person?: PersonProfile;
  name?: string;
  avatarUrl?: string;
  size?: number;
}) {
  const displayName = getPersonDisplayName(person) === 'Deleted person'
    ? name ?? 'Deleted person'
    : getPersonDisplayName(person) || name;
  const source = person?.avatarUrl ?? avatarUrl;
  const initials = getPersonInitials(displayName);

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      {source ? (
        <Image source={{ uri: source }} style={styles.image} />
      ) : (
        <Text style={[styles.initials, { fontSize: Math.max(11, size * 0.34) }]}>
          {initials}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248, 232, 212, 0.82)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(92, 64, 51, 0.16)',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  initials: {
    color: colors.secondary,
    fontStyle: 'italic',
  },
});
