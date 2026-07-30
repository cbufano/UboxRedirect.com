import { Tabs } from 'expo-router'

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Overview' }} />
      <Tabs.Screen name="notify-purchase" options={{ title: 'Pre-alert' }} />
      <Tabs.Screen name="inbox" options={{ title: 'Inbox' }} />
    </Tabs>
  )
}
