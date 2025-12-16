// notifications.ts
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';          // your Firebase init
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { getCurrentUser } from './auth';  // helper that returns the signed-in user

/* ─────────────────── Types ─────────────────── */
export interface AppNotification {
  id?: string;    // undefined until Firestore assigns one
  userId: string;
  title: string;
  message: string;
  type: 'leave_request_created' | 'leave_request_updated' | 'system' | 'reminder';
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: Date | { seconds: number; nanoseconds: number };
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

/* ───────────────── Constants ──────────────── */
const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';
const ANDROID_SOUND = 'default'; // place a default.wav in android/app/src/main/res/raw/

/* ─────────────── Helper functions ─────────── */
const notificationsEnabledForUser = async (): Promise<boolean> => {
  const user = await getCurrentUser();
  return user?.notificationsEnabled ?? true; // default → enabled
};

/* Android channels (once at app start) */
const setupAndroidChannels = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;

  await Promise.all([
    Notifications.setNotificationChannelAsync('urgent', {
      name: 'Urgent',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250, 250, 250],
      lightColor: '#FF0000',
      sound: ANDROID_SOUND,
    }),
    Notifications.setNotificationChannelAsync('high', {
      name: 'High',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3B82F6',
      sound: ANDROID_SOUND,
    }),
    Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3B82F6',
      sound: ANDROID_SOUND,
    }),
  ]);
};

/* Request OS permissions */
export const requestPermissions = async (): Promise<boolean> => {
  if (Platform.OS === 'android') await setupAndroidChannels();

  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;

  const result = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
      allowCriticalAlerts: true,
    },
    android: {}, // Android 13+ system prompt
  });
  return result.status === 'granted';
};

/* Notification handler (foreground behaviour) */
Notifications.setNotificationHandler({
  handleNotification: async ({ request }) => {
    const p = (request.content?.data?.priority as AppNotification['priority']) ?? 'normal';

    const base: Notifications.NotificationBehavior = {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,  // iOS 15+
      shouldShowList: true,    // iOS 15+
    };

    if (Platform.OS === 'android') {
      return {
        ...base,
        priority:
          p === 'urgent'
            ? Notifications.AndroidNotificationPriority.MAX
            : p === 'high'
            ? Notifications.AndroidNotificationPriority.HIGH
            : Notifications.AndroidNotificationPriority.DEFAULT,
      };
    }
    return base;
  },
});

/* ─────────────── Push sender ─────────────── */
export const sendPush = async (
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  priority: AppNotification['priority'] = 'normal',
): Promise<void> => {
  if (!(await requestPermissions())) {
    console.warn('Permission denied, skip push');
    return;
  }

  const content: Notifications.NotificationContentInput = {
    title,
    body,
    data: { ...data, priority },
    sound: Platform.OS === 'ios' ? 'default' : ANDROID_SOUND,
    badge: 1,
    interruptionLevel:
      Platform.OS === 'ios' && priority === 'urgent' ? 'critical' : 'active',
    color: priority === 'urgent' ? '#FF0000' : '#3B82F6',
    // Removed unsupported 'android' property
  };

  await Notifications.scheduleNotificationAsync({ content, trigger: null });
};

/* ───────────── Firestore helpers ─────────── */
const addNotificationDoc = async (
  uid: string,
  payload: Omit<AppNotification, 'userId' | 'read' | 'createdAt'>,
): Promise<void> => {
  await addDoc(collection(db, 'notifications'), {
    userId: uid,
    ...payload,
    read: false,
    createdAt: serverTimestamp(),
  });
};

/* ───────────── Public API ──────────────── */
export const notifyUser = async (
  uid: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  priority: AppNotification['priority'] = 'normal',
): Promise<void> => {
  if (!(await notificationsEnabledForUser())) return;

  await addNotificationDoc(uid, { title, message: body, type: 'system', data, priority });
  await sendPush(title, body, { ...data, uid }, priority);
};

export const notifyDirectors = async (
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  priority: AppNotification['priority'] = 'high',
): Promise<void> => {
  const directors = await getDocs(
    query(collection(db, 'users'), where('role', '==', 'Director')),
  );

  await Promise.all(
    directors.docs.map(async (docSnap) => {
      if (docSnap.data().notificationsEnabled === false) return;
      await addNotificationDoc(docSnap.id, { title, message: body, type: 'system', data, priority });
      await sendPush(title, body, { ...data, uid: docSnap.id }, priority);
    }),
  );
};

/* ───────────── Realtime listener ────────── */
let stopSnapshot: (() => void) | null = null;

export const startRealtimeListener = async (uid: string): Promise<void> => {
  if (Platform.OS === 'web') return;
  if (!(await notificationsEnabledForUser())) return;

  stopSnapshot?.(); // remove old listener, if any

  stopSnapshot = onSnapshot(
    query(
      collection(db, 'notifications'),
      where('userId', '==', uid),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(10),
    ),
    (snap) =>
      snap.docChanges().forEach(({ type, doc }) => {
        if (type === 'added') {
          const n = doc.data() as AppNotification;
          sendPush(n.title, n.message, { ...n.data, realtime: true }, n.priority);
        }
      }),
  );
};

export const stopRealtimeListener = (): void => {
  stopSnapshot?.();
  stopSnapshot = null;
};

// Legacy helper used by other modules to stop any background notification listeners
export const stopBackgroundNotificationListener = (): void => {
  stopRealtimeListener();
};

/* ───────────── Background task ─────────── */
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ error }) => {
  if (error) {
    console.error('Background task error', error);
    return;
  }
  // TODO: add your background-fetch logic here
});

/* ───────────── Initialiser / cleanup ───── */
export const initializeNotifications = async (): Promise<() => void> => {
  if (!(await notificationsEnabledForUser())) return () => {};

  await requestPermissions();

  const sub = Notifications.addNotificationResponseReceivedListener((resp) =>
    console.log('User tapped notification', resp),
  );
  const fg = Notifications.addNotificationReceivedListener((n) =>
    console.log('Notification in foreground', n),
  );

  return () => {
    sub.remove();
    fg.remove();
  };
};

/* ───────────── Preferences toggle ───────── */
export const setNotificationsEnabled = async (enabled: boolean): Promise<void> => {
  const user = await getCurrentUser();
  if (!user) return;

  // Update user doc with enabled flag here if desired

  if (enabled) {
    await startRealtimeListener(user.id);
  } else {
    stopRealtimeListener();
  }
};
