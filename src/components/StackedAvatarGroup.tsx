import { StyleSheet, Text, View } from 'react-native';

import type { PersonProfile } from '../types';
import { colors } from '../theme';
import PersonAvatar from './PersonAvatar';

export default function StackedAvatarGroup({
  people,
  size = 34,
  max = 3,
}: {
  people: PersonProfile[];
  size?: number;
  max?: number;
}) {
  const visible = people.slice(0, max);
  const overflow = Math.max(people.length - visible.length, 0);

  return (
    <View style={styles.row}>
      {visible.map((person, index) => (
        <View
          key={person.id}
          style={[
            styles.avatarWrap,
            {
              marginLeft: index === 0 ? 0 : -size * 0.28,
              borderRadius: size / 2 + 2,
            },
          ]}
        >
          <PersonAvatar person={person} size={size} />
        </View>
      ))}
      {overflow > 0 ? (
        <View
          style={[
            styles.more,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: -size * 0.28,
            },
          ]}
        >
          <Text style={styles.moreText}>+{overflow}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    borderWidth: 2,
    borderColor: colors.surface,
  },
  more: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(92, 64, 51, 0.72)',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  moreText: {
    color: colors.background,
    fontSize: 11,
    fontStyle: 'italic',
  },
});
