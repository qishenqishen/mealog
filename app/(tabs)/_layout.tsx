import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { TabIcon } from '../../src/components/TabIcon';
import { colors } from '../../src/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: 'rgba(240, 230, 214, 0.6)',
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.select({ ios: 84, android: 78, web: 82, default: 80 }),
          paddingBottom: Platform.select({ ios: 22, android: 12, web: 12, default: 14 }),
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          fontStyle: 'italic',
          letterSpacing: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="archive"
        options={{
          title: 'Archive',
          tabBarIcon: ({ focused }) => <TabIcon name="archive" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          tabBarIcon: ({ focused }) => <TabIcon name="add" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ focused }) => <TabIcon name="insights" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: 'Collection',
          tabBarIcon: ({ focused }) => <TabIcon name="collection" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
