import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { getCurrentUser } from '@/lib/auth';
import { appStateManager } from '@/lib/appStateManager';
import { Lock, Fingerprint, Unlock } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getBiometricDescription } from '@/lib/biometric';

export default function LockedScreen() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [biometricInfo, setBiometricInfo] = useState<string>('');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    loadUser();
    loadBiometricInfo();
    startAnimations();
    startPulseAnimation();
    
    // Automatically try biometric authentication when screen loads
    setTimeout(() => {
      tryBiometricAuth();
    }, 1000);
  }, []);

  const loadBiometricInfo = async () => {
    try {
      const description = await getBiometricDescription();
      setBiometricInfo(description);
    } catch (error) {
      console.error('Error loading biometric info:', error);
      setBiometricInfo('Biometric authentication');
    }
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

  const loadUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      console.error('Error loading user:', error);
    }
  };

  const tryBiometricAuth = async () => {
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
              onPress: () => setTimeout(tryBiometricAuth, 500)
            },
            { 
              text: 'Cancel', 
              style: 'cancel' 
            }
          ]
        );
      }
      // If successful, the app will automatically unlock and this screen will disappear
    } catch (error) {
      console.error('Error with biometric auth:', error);
      Alert.alert(
        'Error',
        'An error occurred during authentication. Please try again.',
        [
          { 
            text: 'Try Again', 
            onPress: () => setTimeout(tryBiometricAuth, 500)
          }
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#3B82F6', '#1E40AF', '#1E3A8A']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <Animated.View 
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Lock Icon with Pulse Animation */}
          <Animated.View 
            style={[
              styles.iconContainer,
              {
                transform: [{ scale: pulseAnim }],
              },
            ]}
          >
            <Lock size={64} color="#FFFFFF" />
          </Animated.View>

          {/* Title */}
          <Text style={styles.title}>App Locked</Text>
          <Text style={styles.subtitle}>
            {user?.name ? `Welcome back, ${user.name}` : 'Welcome back'}
          </Text>

          {/* Biometric Info */}
          <View style={styles.biometricContainer}>
            <Fingerprint size={48} color="#FFFFFF" style={styles.biometricIcon} />
            <Text style={styles.biometricTitle}>
              {biometricInfo}
            </Text>
            <Text style={styles.biometricSubtitle}>
              Use your biometric to unlock the app
            </Text>
          </View>

          {/* Unlock Button */}
          <TouchableOpacity
            style={styles.biometricButton}
            onPress={tryBiometricAuth}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Fingerprint size={24} color="#FFFFFF" />
            <Text style={styles.biometricText}>
              {loading ? 'Authenticating...' : 'Unlock with Biometric'}
            </Text>
          </TouchableOpacity>

          {/* Help Text */}
          <Text style={styles.helpText}>
            The app was locked for security. Use your fingerprint, face recognition, or other biometric authentication to continue.
          </Text>

          {/* Fallback message */}
          <View style={styles.fallbackContainer}>
            <Text style={styles.fallbackText}>
              If biometric authentication is not working, please restart the app or check your device biometric settings.
            </Text>
          </View>
        </Animated.View>
      </SafeAreaView>
    </LinearGradient>
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
});