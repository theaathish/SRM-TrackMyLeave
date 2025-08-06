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
    if (!isEnrolled) {
      return {
        isAvailable: false,
        supportedTypes: [],
        isEnrolled: false,
        error: 'No biometrics enrolled',
      };
    }

    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
    return {
      isAvailable: true,
      supportedTypes,
      isEnrolled: true,
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
  promptMessage: string = 'Use biometric authentication'
): Promise<BiometricResult> => {
  try {
    const capability = await checkBiometricCapability();
    if (!capability.isAvailable) {
      return {
        success: false,
        error: capability.error || 'Biometric authentication not available',
      };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use PIN Instead',
      disableDeviceFallback: true,
    });

    if (result.success) {
      return { success: true };
    } else {
      let errorMessage = 'Biometric authentication failed';
      if (result.error === 'user_cancel') {
        errorMessage = 'Authentication cancelled by user';
      } else if (result.error === 'user_fallback') {
        errorMessage = 'User chose to use PIN';
      } else if (result.error === 'biometric_not_available') {
        errorMessage = 'Biometric authentication not available';
      } else if (result.error === 'too_many_attempts') {
        errorMessage = 'Too many failed attempts';
      }
      
      return { success: false, error: errorMessage };
    }
  } catch (error) {
    return {
      success: false,
      error: 'An error occurred during biometric authentication',
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
    const capability = await checkBiometricCapability();
    if (!capability.isAvailable) {
      if (capability.error === 'Biometric hardware not available') {
        return 'Not supported on this device';
      } else if (capability.error === 'No biometrics enrolled') {
        return 'Available but not set up';
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
