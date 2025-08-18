import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { router } from 'expo-router';
import { getCurrentUser } from '@/lib/auth';
import messaging from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';

// 🔔 Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// 🔔 Setup notification channel for Android
const setupNotificationChannel = async () => {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('srmnotification-trackmyleave-ID', {
      name: 'srm notification',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'notificationsound.wav', // Make sure this file exists in your assets
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3B82F6',
    });
  }
};

// 🔩 Background FCM handler
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log('🔩 Background message:', remoteMessage);

  if (remoteMessage.messageId) {
    // Schedule notification using expo-notifications
    await Notifications.scheduleNotificationAsync({
      content: {
        title: remoteMessage.notification?.title ?? 'Background Message',
        body: remoteMessage.notification?.body ?? 'You got a new notification',
        sound: 'notificationsound.wav',
        data: remoteMessage.data || {},
      },
      trigger: null, // Show immediately
    });
  }
});

export default function IndexScreen() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeNotifications();
    checkAuthAndRedirect();
  }, []);

  const initializeNotifications = async () => {
    try {
      // Setup notification channel
      await setupNotificationChannel();

      // Request permissions
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Notification permissions not granted');
      }

      // Handle foreground notifications
      const foregroundSubscription = messaging().onMessage(async (remoteMessage) => {
        console.log('🔩 Foreground message:', remoteMessage);

        if (remoteMessage.messageId) {
          // Show notification in foreground
          await Notifications.scheduleNotificationAsync({
            content: {
              title: remoteMessage.notification?.title ?? 'New Message',
              body: remoteMessage.notification?.body ?? 'You got a new notification',
              sound: 'notificationsound.wav',
              data: remoteMessage.data || {},
            },
            trigger: null, // Show immediately
          });
        }
      });

      // Handle notification taps
      const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('Notification tapped:', response);
        // Handle notification tap - navigate to specific screen if needed
        // Example: router.push('/notifications');
      });

      // Cleanup subscriptions when component unmounts
      return () => {
        foregroundSubscription();
        responseSubscription.remove();
      };
    } catch (error) {
      console.error('Error initializing notifications:', error);
    }
  };

  const checkAuthAndRedirect = async () => {
    try {
      console.log('Checking authentication state...');
      const user = await getCurrentUser();
      
      if (user) {
        console.log('User authenticated, redirecting to main app');
        router.replace('/(tabs)/');
      } else {
        console.log('User not authenticated, redirecting to auth');
        router.replace('/auth/');
      }
    } catch (error) {
      console.error('Error checking auth state:', error);
      router.replace('/auth/');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#3B82F6" />
      <Text style={styles.loadingText}>Loading TrackMyLeave...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
});