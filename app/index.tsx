import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { getCurrentUser } from '@/lib/auth';

export default function IndexScreen() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuthAndRedirect();
  }, []);

  const checkAuthAndRedirect = async () => {
    try {
      console.log('Checking authentication state...');
      const user = await getCurrentUser();
      
      if (user) {
        console.log('User authenticated, redirecting to main app');
        router.replace('/(tabs)/');
      } else {
        console.log('User not authenticated, redirecting to auth');
        // FIX: Use consistent route path
        router.replace('/auth/');
      }
    } catch (error) {
      console.error('Error checking auth state:', error);
      // FIX: On error, redirect to auth
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
