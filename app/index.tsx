import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { router } from 'expo-router';
import { getCurrentUser } from '@/lib/auth';
import messaging from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import { appStateManager } from '@/lib/appStateManager';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const setupNotificationChannel = async () => {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('srmnotification-trackmyleave-ID', {
      name: 'srm notification',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'notificationsound',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3B82F6',
    });
  }
};

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log('Background message:', remoteMessage);
  if (remoteMessage.messageId) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: remoteMessage.notification?.title ?? 'Background Message',
        body: remoteMessage.notification?.body ?? 'You got a new notification',
        sound: 'notificationsound',
        data: remoteMessage.data || {},
      },
      trigger: null,
    });
  }
});

export default function IndexScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      await initializeNotifications();
      
      // Check if app was opened by notification click from killed state
      const initialNotification = await Notifications.getLastNotificationResponseAsync();
      
      if (initialNotification) {
        console.log('App opened via notification from killed state - triggering response handler');
        
        // Manually trigger the same response handler logic
        // This ensures EXACT same behavior as background notification clicks
        setTimeout(() => {
          // Create a synthetic response object that matches the structure
          const syntheticResponse = {
            notification: initialNotification.notification,
            userText: initialNotification.userText,
            actionIdentifier: initialNotification.actionIdentifier
          };
          
          // Manually call the same notification response logic
          handleNotificationResponse(syntheticResponse);
        }, 500);
      } else {
        // Normal app launch without notification
        await checkAuthAndRedirect();
      }
    } catch (error) {
      console.error('App initialization error:', error);
      // Fallback to auth screen on error
      router.replace('/auth/');
      setIsLoading(false);
    }
  };

  // Extract notification response handling into separate function
  // This ensures EXACT same behavior for both background and killed-app scenarios
  const handleNotificationResponse = (response: any) => {
    if (isNavigating) {
      console.log('Navigation already in progress, ignoring...');
      return;
    }

    try {
      // Extract notification data
      const notificationData = response.notification.request.content.data;
      const notificationBody = response.notification.request.content.body || '';
      
      let notificationType;

      // Check both the notification body and data for approval/rejection
      const bodyText = notificationBody.toLowerCase();
      const dataBodyText = (notificationData?.body || '').toLowerCase();
      
      if (bodyText.includes("approved") || dataBodyText.includes("approved")) {
        notificationType = "approved";
      } else {
        notificationType = "rejected";
      }

      console.log("Notification clicked with data:", {
        body: notificationBody,
        dataBody: notificationData?.body,
        detectedType: notificationType
      });
      
      // Add delay to ensure app is fully loaded
      setTimeout(() => {
        handleNotificationNavigation(notificationType);
      }, 1000);

    } catch (error) {
      console.error('Error handling notification response:', error);
    }
  };

  const initializeNotifications = async () => {
    try {
      await setupNotificationChannel();
      
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Notification permissions not granted');
      }

      // Handle foreground notifications
      const foregroundSubscription = messaging().onMessage(async (remoteMessage) => {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: remoteMessage.notification?.title ?? 'New Message',
            body: remoteMessage.notification?.body ?? 'You got a new notification',
            sound: 'notificationsound',
            data: remoteMessage.data || {},
          },
          trigger: null,
        });
      });

      // Handle notification clicks - use the extracted function
      const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

      return () => {
        foregroundSubscription();
        responseSubscription.remove();
      };
    } catch (error) {
      console.error('Error initializing notifications:', error);
    }
  };

  const handleNotificationNavigation = async (notificationType?: string) => {
    if (isNavigating) return;
    
    setIsNavigating(true);
    try {
      await checkAuthAndRedirect(notificationType);
    } finally {
      setIsNavigating(false);
    }
  };

  const checkAuthAndRedirect = async (notificationType?: string) => {
    try {
      console.log('Checking auth and redirecting...');
      const user = await getCurrentUser();
      let queryParams = '';
      
      if (notificationType) {
        queryParams = `?notificationType=${notificationType}`;
      }
      
      if (user) {
        await appStateManager.setAuthState(true);
        
        // Ensure state consistency
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const targetRoute = appStateManager.getIsLocked() 
          ? `/Locked${queryParams}` 
          : `/(tabs)${queryParams}`;
        
        console.log('Navigating to:', targetRoute);
        
        // Use replace to avoid navigation stack issues
        router.replace(targetRoute as any);
      } else {
        await appStateManager.setAuthState(false);
        router.replace('/auth/');
      }
    } catch (error) {
      console.error('Auth check error:', error);
      await appStateManager.setAuthState(false);
      router.replace('/auth/');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#3B82F6" />
      <Text style={styles.loadingText}>
        {isNavigating ? 'Processing notification...' : 'Loading TrackMyLeave...'}
      </Text>
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