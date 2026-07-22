import Constants from 'expo-constants';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence, type Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Check if we are in Expo Go
const isExpoGo = Constants.appOwnership === 'expo';

// Firebase config (from env or app.json)
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || Constants.expoConfig?.extra?.firebase?.apiKey,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || Constants.expoConfig?.extra?.firebase?.authDomain,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || Constants.expoConfig?.extra?.firebase?.projectId,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || Constants.expoConfig?.extra?.firebase?.storageBucket,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || Constants.expoConfig?.extra?.firebase?.messagingSenderId,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || Constants.expoConfig?.extra?.firebase?.appId,
  databaseURL: process.env.EXPO_PUBLIC_DATABASE_URL || Constants.expoConfig?.extra?.firebase?.databaseURL,
};

console.log('Firebase Config:', {
  apiKey: firebaseConfig.apiKey ? 'SET' : 'NOT SET',
  authDomain: firebaseConfig.authDomain ? 'SET' : 'NOT SET',
  projectId: firebaseConfig.projectId ? 'SET' : 'NOT SET',
  storageBucket: firebaseConfig.storageBucket ? 'SET' : 'NOT SET',
  messagingSenderId: firebaseConfig.messagingSenderId ? 'SET' : 'NOT SET',
  appId: firebaseConfig.appId ? 'SET' : 'NOT SET',
  databaseURL: firebaseConfig.databaseURL ? 'SET' : 'NOT SET',
});

let app: any;
let auth: Auth;
let db: any;
let storage: any;

// Promise that resolves when the native Firebase SDK is ready.
// Resolves `true` on success, `false` when not applicable (web / Expo Go) or on error.
export let nativeFirebaseReady: Promise<boolean>;

// Initialize Firebase
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Initialize Auth
if (Platform.OS !== 'web') {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} else {
  auth = getAuth(app);
}

// Initialize Firestore & Storage
db = getFirestore(app);
storage = getStorage(app);

// Only initialize Native Firebase if NOT on web and NOT in Expo Go.
// nativeFirebaseReady resolves once the native SDK is ready so that
// callers (e.g. app/index.tsx) can safely use messaging() without a race.
if (Platform.OS !== 'web' && !isExpoGo) {
  nativeFirebaseReady = new Promise<boolean>((resolve) => {
    try {
      const { initializeApp: InitRNF } = require('@react-native-firebase/app');
      InitRNF(firebaseConfig)
        .then(() => {
          console.log('Native Firebase initialized successfully');
          resolve(true);
        })
        .catch((err: any) => {
          console.error('\x1b[31mNative Firebase init error:\x1b[0m', err);
          resolve(false); // resolve (not reject) so callers don't need try/catch
        });
    } catch (e) {
      console.log('Native Firebase not available (running in Expo Go or web)');
      resolve(false);
    }
  });
} else {
  // Not applicable on web or Expo Go — resolve immediately
  nativeFirebaseReady = Promise.resolve(false);
}

export { auth, db, storage };
export default app;