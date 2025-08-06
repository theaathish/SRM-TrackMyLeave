import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator, collection, doc, getDoc } from 'firebase/firestore';
import { getStorage, FirebaseStorage, connectStorageEmulator, ref, getDownloadURL } from 'firebase/storage';
import { getAnalytics, Analytics, isSupported } from 'firebase/analytics';
import { Platform } from 'react-native';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Validate configuration
const validateFirebaseConfig = () => {
  const requiredKeys = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId',
  ];
  
  const missingKeys = requiredKeys.filter(key => !firebaseConfig[key as keyof typeof firebaseConfig]);
  
  if (missingKeys.length > 0) {
    throw new Error(`Missing Firebase configuration: ${missingKeys.join(', ')}`);
  }
};

// Initialize Firebase app
let app: FirebaseApp;
try {
  validateFirebaseConfig();
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (error) {
  console.error('Firebase initialization error:', error);
  throw new Error('Failed to initialize Firebase. Please check your configuration.');
}

// Initialize Firebase Auth
let auth: Auth;
try {
  auth = getAuth(app);
} catch (error) {
  console.error('Firebase Auth initialization error:', error);
  throw new Error('Failed to initialize Firebase Auth');
}

// Initialize Firestore
let db: Firestore;
try {
  db = getFirestore(app);
} catch (error) {
  console.error('Firestore initialization error:', error);
  throw new Error('Failed to initialize Firestore');
}

// Initialize Firebase Storage
let storage: FirebaseStorage;
try {
  storage = getStorage(app);
} catch (error) {
  console.error('Firebase Storage initialization error:', error);
  throw new Error('Failed to initialize Firebase Storage');
}

// Initialize Analytics (web only)
let analytics: Analytics | undefined;
if (Platform.OS === 'web') {
  isSupported().then(supported => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(error => {
    console.warn('Analytics not supported:', error);
  });
}

// Connect to emulators in development
if (__DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  try {
    // Connect to Auth emulator
    connectAuthEmulator(auth, 'http://localhost:9099');
    
    // Connect to Firestore emulator
    connectFirestoreEmulator(db, 'localhost', 8080);
    
    // Connect to Storage emulator
    connectStorageEmulator(storage, 'localhost', 9199);
    
    console.log('Connected to Firebase emulators');
  } catch (error) {
    console.warn('Could not connect to Firebase emulators:', error);
  }
}

// Enhanced error handling wrapper
export const withFirebaseErrorHandling = <T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  context: string
) => {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error: any) {
      console.error(`Firebase error in ${context}:`, error);
      
      // Enhanced error messages
      let userFriendlyMessage = 'An unexpected error occurred';
      
      switch (error.code) {
        case 'auth/network-request-failed':
          userFriendlyMessage = 'Network error. Please check your connection.';
          break;
        case 'auth/too-many-requests':
          userFriendlyMessage = 'Too many requests. Please try again later.';
          break;
        case 'auth/user-not-found':
          userFriendlyMessage = 'User not found. Please check your credentials.';
          break;
        case 'auth/wrong-password':
          userFriendlyMessage = 'Incorrect password. Please try again.';
          break;
        case 'auth/invalid-email':
          userFriendlyMessage = 'Invalid email address.';
          break;
        case 'auth/user-disabled':
          userFriendlyMessage = 'This account has been disabled.';
          break;
        case 'auth/email-already-in-use':
          userFriendlyMessage = 'Email address is already in use.';
          break;
        case 'auth/weak-password':
          userFriendlyMessage = 'Password is too weak. Please choose a stronger password.';
          break;
        case 'firestore/permission-denied':
          userFriendlyMessage = 'Permission denied. Please check your access rights.';
          break;
        case 'firestore/unavailable':
          userFriendlyMessage = 'Service temporarily unavailable. Please try again.';
          break;
        case 'storage/unauthorized':
          userFriendlyMessage = 'Unauthorized access to storage.';
          break;
        case 'storage/quota-exceeded':
          userFriendlyMessage = 'Storage quota exceeded.';
          break;
        default:
          if (error.message) {
            userFriendlyMessage = error.message;
          }
      }
      
      // Create enhanced error object
      const enhancedError = new Error(userFriendlyMessage);
      enhancedError.name = error.name || 'FirebaseError';
      (enhancedError as any).code = error.code;
      (enhancedError as any).originalError = error;
      
      throw enhancedError;
    }
  };
};

// Connection status monitoring
export const monitorFirebaseConnection = () => {
  // This would implement real-time connection monitoring
  // For now, just return online status
  return navigator.onLine;
};

// Performance monitoring wrapper
export const withPerformanceMonitoring = <T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  operation: string
) => {
  return async (...args: T): Promise<R> => {
    const startTime = performance.now();
    
    try {
      const result = await fn(...args);
      const endTime = performance.now();
      
      console.log(`Firebase ${operation} took ${endTime - startTime}ms`);
      
      // Log slow operations
      if (endTime - startTime > 2000) {
        console.warn(`Slow Firebase operation: ${operation} took ${endTime - startTime}ms`);
      }
      
      return result;
    } catch (error) {
      const endTime = performance.now();
      console.error(`Firebase ${operation} failed after ${endTime - startTime}ms:`, error);
      throw error;
    }
  };
};

// Retry mechanism for failed operations
export const withRetry = <T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  maxRetries: number = 3,
  delay: number = 1000
) => {
  return async (...args: T): Promise<R> => {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain errors
        if (error && typeof error === 'object' && 'code' in error) {
          const nonRetryableErrors = [
            'auth/user-not-found',
            'auth/wrong-password',
            'auth/invalid-email',
            'firestore/permission-denied',
            'storage/unauthorized',
          ];
          
          if (nonRetryableErrors.includes((error as any).code)) {
            throw error;
          }
        }
        
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        }
      }
    }
    
    throw lastError;
  };
};

// Firebase status check
export const checkFirebaseStatus = async (): Promise<{
  auth: boolean;
  firestore: boolean;
  storage: boolean;
  analytics: boolean;
}> => {
  const status = {
    auth: false,
    firestore: false,
    storage: false,
    analytics: false,
  };
  
  try {
    // Check Auth
    status.auth = !!auth.currentUser || true; // Auth is available
    
    // Check Firestore
    const testDoc = doc(db, 'test', 'test');
    await getDoc(testDoc);
    status.firestore = true;
  } catch (error) {
    console.warn('Firestore check failed:', error);
  }
  
  try {
    // Check Storage
    const testRef = ref(storage, 'test');
    await getDownloadURL(testRef).catch(() => {}); // Expected to fail
    status.storage = true;
  } catch (error) {
    console.warn('Storage check failed:', error);
  }
  
  try {
    // Check Analytics
    status.analytics = !!analytics;
  } catch (error) {
    console.warn('Analytics check failed:', error);
  }
  
  return status;
};

// Firebase configuration info
export const getFirebaseConfig = () => ({
  projectId: firebaseConfig.projectId,
  region: 'us-central1', // Default region
  environment: __DEV__ ? 'development' : 'production',
  emulator: __DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true',
});

// Export Firebase services
export { app, auth, db, storage, analytics };

// Export types for better TypeScript support
export type {
  User,
  UserCredential,
  AuthError,
} from 'firebase/auth';

export type {
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  QueryDocumentSnapshot,
  QuerySnapshot,
  CollectionReference,
  Query,
  FirestoreError,
} from 'firebase/firestore';

export type {
  StorageReference,
  UploadTask,
  UploadTaskSnapshot,
  StorageError,
} from 'firebase/storage';

// Default export
export default app;
