import Constants from 'expo-constants';
import { initializeApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { initializeApp as InitRNF } from '@react-native-firebase/app';

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

// 🔥 Initialize Firebase & Setup Notifications
InitRNF(firebaseConfig)
  .then(() => {console.log("intilized fire message")})
  .catch(err => console.log("\x1b[31mNotification Error:\x1b[0m", err));

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth with AsyncStorage persistence for auto-login
let auth;
if (Platform.OS !== 'web') {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} else {
  auth = getAuth(app);
}
export { auth };

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Storage
export const storage = getStorage(app);

export default app;