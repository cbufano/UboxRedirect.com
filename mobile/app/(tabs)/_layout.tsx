import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import type { ComponentProps } from 'react'
import type { ColorValue } from 'react-native'

type IoniconName = ComponentProps<typeof Ionicons>['name']

function TabIcon({ name, color, size }: { name: IoniconName; color: ColorValue; size: number }) {
  return <Ionicons name={name} color={color as string} size={size} />
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#1E88E5', tabBarInactiveTintColor: '#64748B' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Overview',
          tabBarIcon: ({ color, size }) => <TabIcon name="home-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="notify-purchase"
        options={{
          title: 'Pre-alert',
          tabBarIcon: ({ color, size }) => <TabIcon name="notifications-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color, size }) => <TabIcon name="cube-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="shipments"
        options={{
          title: 'Shipments',
          tabBarIcon: ({ color, size }) => <TabIcon name="boat-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="privacy"
        options={{
          title: 'Privacy',
          tabBarIcon: ({ color, size }) => <TabIcon name="shield-checkmark-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
