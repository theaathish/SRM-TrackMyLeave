// app/_layout.tsx
import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { initializeNotifications } from '@/lib/notifications';
import { appStateManager } from '@/lib/appStateManager';
import LockedScreen from './Locked';
import '../global.css';

export default function RootLayout() {
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    // Initialize notifications
    initializeNotifications();

    // Set up app lock listener
    const handleLockChange = (locked: boolean) => {
      setIsLocked(locked);
    };

    appStateManager.addListener(handleLockChange);
    setIsLocked(appStateManager.getIsLocked());

    return () => {
      appStateManager.removeListener(handleLockChange);
    };
  }, []);

  if (isLocked) {
    return <LockedScreen />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="Locked" />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}
