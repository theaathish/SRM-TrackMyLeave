import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export interface BiometricCapability {
  isAvailable: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
  isEnrolled: boolean;
  error?: string;
}

export interface BiometricResult {
  success: boolean;
  error?: string;
}

export const checkBiometricCapability = async (): Promise<BiometricCapability> => {
  try {
    if (Platform.OS === 'web') {
      return {
        isAvailable: false,
        supportedTypes: [],
        isEnrolled: false,
        error: 'Web platform does not support biometrics',
      };
    }

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      return {
        isAvailable: false,
        supportedTypes: [],
        isEnrolled: false,
        error: 'Biometric hardware not available',
      };
    }

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
    
    return {
      isAvailable: hasHardware && isEnrolled,
      supportedTypes,
      isEnrolled,
      error: !isEnrolled ? 'No biometrics enrolled' : undefined,
    };
  } catch (error) {
    return {
      isAvailable: false,
      supportedTypes: [],
      isEnrolled: false,
      error: 'Failed to check biometric capability',
    };
  }
};

export const authenticateWithBiometrics = async (
  promptMessage: string = 'Use biometric authentication',
  allowCancel: boolean = true
): Promise<BiometricResult> => {
  try {
    if (Platform.OS === 'web') {
      return {
        success: false,
        error: 'Biometric authentication not supported on web',
      };
    }

    const capability = await checkBiometricCapability();
    if (!capability.isAvailable) {
      return {
        success: false,
        error: capability.error || 'Biometric authentication not available',
      };
    }

    // Add a small delay to ensure the app is in the foreground
    await new Promise(resolve => setTimeout(resolve, 100));

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: allowCancel ? 'Cancel' : undefined,
      fallbackLabel: 'Use Passcode',
      disableDeviceFallback: false, // Allow fallback to device passcode
      requireConfirmation: false, // Don't require additional confirmation
    });

    if (result.success) {
      return { success: true };
    } else {
      let errorMessage = 'Biometric authentication failed';
      
      switch (result.error) {
        case 'user_cancel':
          errorMessage = allowCancel ? 'Authentication cancelled by user' : 'Please authenticate to continue';
          break;
        case 'user_fallback':
          // Fallback was used successfully, treat as success
          return { success: true };
        case 'biometric_not_available':
          errorMessage = 'Biometric authentication not available';
          break;
        case 'too_many_attempts':
          errorMessage = 'Too many failed attempts. Please try again later';
          break;
        case 'system_cancel':
        case 'app_cancel':
          // These usually happen due to app state changes, retry once
          console.log('Authentication cancelled by system/app, retrying...');
          await new Promise(resolve => setTimeout(resolve, 500));
          return authenticateWithBiometrics(promptMessage, allowCancel);
        case 'not_enrolled':
          errorMessage = 'No biometrics enrolled on this device';
          break;
        case 'not_available':
          errorMessage = 'Biometric authentication not available';
          break;
        default:
          console.log('Unhandled authentication error:', result.error);
          errorMessage = `Authentication failed: ${result.error}`;
      }
      
      return { success: false, error: errorMessage };
    }
  } catch (error) {
    console.error('Biometric authentication error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred during authentication',
    };
  }
};

export const getBiometricTypeNames = (
  types: LocalAuthentication.AuthenticationType[]
): string[] => {
  return types.map(type => {
    switch (type) {
      case LocalAuthentication.AuthenticationType.FINGERPRINT:
        return 'Fingerprint';
      case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
        return Platform.OS === 'ios' ? 'Face ID' : 'Face Recognition';
      case LocalAuthentication.AuthenticationType.IRIS:
        return 'Iris';
      default:
        return 'Biometric';
    }
  });
};

export const getBiometricDescription = async (): Promise<string> => {
  try {
    if (Platform.OS === 'web') {
      return 'Not supported on web';
    }

    const capability = await checkBiometricCapability();
    if (!capability.isAvailable) {
      if (capability.error === 'Biometric hardware not available') {
        return 'Not supported on this device';
      } else if (capability.error === 'No biometrics enrolled') {
        return 'Available but not set up. Please set up biometrics in device settings';
      } else {
        return 'Not available';
      }
    }

    const typeNames = getBiometricTypeNames(capability.supportedTypes);
    if (typeNames.length === 0) {
      return 'Available';
    } else if (typeNames.length === 1) {
      return `${typeNames[0]} enabled`;
    } else {
      return `${typeNames.join(' & ')} enabled`;
    }
  } catch (error) {
    return 'Unable to check status';
  }
};

// Helper function to check if biometric setup is recommended
export const shouldPromptBiometricSetup = async (): Promise<{ shouldPrompt: boolean; message?: string }> => {
  try {
    if (Platform.OS === 'web') {
      return { shouldPrompt: false };
    }

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      return { shouldPrompt: false };
    }

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) {
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const typeNames = getBiometricTypeNames(supportedTypes);
      const typesText = typeNames.length > 0 ? typeNames.join(' or ') : 'biometric authentication';
      
      return {
        shouldPrompt: true,
        message: `For enhanced security, please set up ${typesText} in your device settings.`
      };
    }

    return { shouldPrompt: false };
  } catch (error) {
    return { shouldPrompt: false };
  }
};