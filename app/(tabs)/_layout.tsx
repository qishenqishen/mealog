import { useI18n } from '../../src/i18n';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { TabIcon } from '../../src/components/TabIcon';
import { colors } from '../../src/theme';

export default function TabLayout() {
  const { t } = useI18n();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.select({ ios: 84, android: 78, web: 68, default: 80 }),
          paddingBottom: Platform.select({ ios: 22, android: 12, web: 8, default: 14 }),
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedText,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          letterSpacing: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('Home'),
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="archive"
        options={{
          title: t('Archive'),
          tabBarIcon: ({ focused }) => <TabIcon name="archive" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: t('Add'),
          tabBarIcon: ({ focused }) => <TabIcon name="add" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: t('Insights'),
          tabBarIcon: ({ focused }) => <TabIcon name="insights" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: t('Collection'),
          tabBarIcon: ({ focused }) => <TabIcon name="collection" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
