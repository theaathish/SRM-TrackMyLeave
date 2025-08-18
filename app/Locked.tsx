import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, Animated, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrentUser } from '@/lib/auth';
import { appStateManager } from '@/lib/appStateManager';
import { Lock, Fingerprint, Unlock, Shield } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getBiometricDescription } from '@/lib/biometric';
import { router, useLocalSearchParams } from 'expo-router';

export default function LockedScreen() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [biometricInfo, setBiometricInfo] = useState('');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));
  const [pulseAnim] = useState(new Animated.Value(1));
  const [loadingPulse] = useState(new Animated.Value(1));
  const [isReady, setIsReady] = useState(false);
  const [shouldAutoAuth, setShouldAutoAuth] = useState(true);
  
  // Get query parameters
  const params = useLocalSearchParams();
  const notificationType = params.notificationType as string;

  // Helper function to build redirect URL with query params
  const buildRedirectUrl = (basePath: string) => {
    if (notificationType) {
      // Use URL encoding to ensure special characters are handled
      const encodedType = encodeURIComponent(notificationType);
      return `${basePath}?notificationType=${encodedType}`;
    }
    return basePath;
  };

  // Initialize screen
  useEffect(() => {
    const initializeScreen = async () => {
      try {
        startLoadingAnimation();

        const currentUser = await getCurrentUser();
        if (!currentUser) {
          router.replace('/auth');
          return;
        }
        setUser(currentUser);

        if (!appStateManager.getIsLocked()) {
          // Forward query params when redirecting to main app
          console.log('Redirecting to tabs with notificationType:', notificationType);
          const redirectUrl = buildRedirectUrl('/(tabs)');
          console.log('Redirect URL:', redirectUrl);
          router.replace(redirectUrl);
          return;
        }

        const description = await getBiometricDescription();
        setBiometricInfo(description);

        setIsReady(true);
        startAnimations();
        startPulseAnimation();
      } catch (error) {
        console.error('Initialization error:', error);
        Alert.alert('Error', 'Failed to initialize. Please try again.');
        setShouldAutoAuth(false);
      }
    };

    initializeScreen();

    const lockListener = (isLocked: boolean) => {
      if (!isLocked) {
        // Forward query params when app is unlocked
        console.log('Auth unlocked, redirecting with notificationType:', notificationType);
        const redirectUrl = buildRedirectUrl('/(tabs)');
        console.log('Redirect URL:', redirectUrl);
        router.replace(redirectUrl);
      }
    };

    appStateManager.addListener(lockListener);
    return () => {
      appStateManager.removeListener(lockListener);
    };
  }, [notificationType]); // Add notificationType as dependency

  // Trigger biometric auth automatically when ready
  useEffect(() => {
    if (isReady && shouldAutoAuth) {
      tryBiometricAuth();
      setShouldAutoAuth(false);
    }
  }, [isReady, shouldAutoAuth]);

  const startLoadingAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(loadingPulse, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(loadingPulse, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const startAnimations = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const tryBiometricAuth = useCallback(async () => {
    if (loading) return;
    
    setLoading(true);
    try {
      const result = await appStateManager.authenticate();
      if (!result.success) {
        Alert.alert(
          'Authentication Failed',
          result.message || 'Unable to authenticate with biometrics. Please try again.',
          [
            {
              text: 'Try Again',
              onPress: () => setTimeout(() => tryBiometricAuth(), 500),
            },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      }
      // Note: Successful auth will trigger the lockListener which handles redirect
    } catch (error) {
      Alert.alert(
        'Error',
        'An unexpected error occurred during authentication. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  }, [loading]);

  if (!isReady) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LinearGradient colors={['#4c669f', '#3b5998', '#192f6a']} style={styles.container}>
          <View style={styles.loadingContent}>
            <Animated.View 
              style={[
                styles.loadingIconContainer,
                { transform: [{ scale: loadingPulse }] }
              ]}
            >
              <Shield color="white" size={48} />
            </Animated.View>
            
            <View style={styles.loadingIndicatorContainer}>
              <ActivityIndicator size="large" color="rgba(255, 255, 255, 0.8)" />
            </View>
            
            <Text style={styles.loadingTitle}>Initializing Security</Text>
            <Text style={styles.loadingSubtitle}>Setting up biometric authentication...</Text>
            
            <View style={styles.loadingDotsContainer}>
              {[0, 1, 2].map((index) => (
                <Animated.View
                  key={index}
                  style={[
                    styles.loadingDot,
                    {
                      opacity: fadeAnim,
                      transform: [{
                        scale: Animated.add(
                          loadingPulse,
                          new Animated.Value(-0.3 * index)
                        ).interpolate({
                          inputRange: [0.7, 1.2],
                          outputRange: [0.5, 1],
                          extrapolate: 'clamp',
                        })
                      }]
                    }
                  ]}
                />
              ))}
            </View>

            {/* Show notification type if present */}
            {notificationType && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationText}>
                  Notification: {notificationType}
                </Text>
              </View>
            )}
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient colors={['#4c669f', '#3b5998', '#192f6a']} style={styles.container}>
        <View style={styles.content}>
          <Animated.View 
            style={[
              styles.iconContainer, 
              { 
                opacity: fadeAnim, 
                transform: [
                  { scale: scaleAnim },
                  { scale: pulseAnim }
                ] 
              }
            ]}
          >
            <Lock color="white" size={64} />
          </Animated.View>

          <Text style={styles.title}>App Locked</Text>
          <Text style={styles.subtitle}>
            {user?.name ? `Welcome back, ${user.name}` : 'Welcome back'}
          </Text>

          {/* Show notification type if present */}
          {notificationType && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationText}>
                Pending notification: {notificationType}
              </Text>
            </View>
          )}

          <View style={styles.biometricContainer}>
            <Animated.View style={[styles.biometricIcon, { transform: [{ scale: pulseAnim }] }]}>
              <Fingerprint color="white" size={48} />
            </Animated.View>
            <Text style={styles.biometricTitle}>{biometricInfo}</Text>
            <Text style={styles.biometricSubtitle}>Use your biometric to unlock the app</Text>
          </View>

          <TouchableOpacity 
            style={[styles.biometricButton, loading && styles.biometricButtonDisabled]} 
            onPress={tryBiometricAuth} 
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Unlock color="white" size={24} />
            )}
            <Text style={styles.biometricText}>
              {loading ? 'Authenticating...' : 'Unlock with Biometric'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.helpText}>
            The app was locked for security. Use your fingerprint, face recognition, or other biometric authentication to continue.
          </Text>

          <View style={styles.fallbackContainer}>
            <Text style={styles.fallbackText}>
              If biometric authentication is not working, please restart the app or check your device biometric settings.
            </Text>
          </View>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 48,
    textAlign: 'center',
  },
  biometricContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  biometricIcon: {
    marginBottom: 16,
  },
  biometricTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  biometricSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    marginBottom: 32,
    minWidth: 250,
  },
  biometricButtonDisabled: {
    opacity: 0.6,
  },
  biometricText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  helpText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  fallbackContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  fallbackText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  // Enhanced loading screen styles
  loadingContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  loadingIndicatorContainer: {
    marginBottom: 24,
  },
  loadingTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  loadingSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginBottom: 32,
  },
  loadingDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    marginHorizontal: 4,
  },
  // New styles for notification badge
  notificationBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  notificationText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});