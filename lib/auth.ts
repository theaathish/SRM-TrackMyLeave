import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendPasswordResetEmail,
  User as FirebaseUser
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { Platform } from 'react-native';
import {setupFCM, removeCurrentUserToken} from './notificationTokenManager';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'Staff' | 'Director' | 'SubAdmin';
  department: string;
  employeeId?: string;
  campus?: 'TRP' | 'RMP';
  createdAt?: any;
  updatedAt?: any;
  lastLoginAt?: Date;
  biometricEnabled?: boolean;
  appLockEnabled?: boolean; // NEW: App lock preference
  notificationsEnabled?: boolean; // NEW: Notification preference
  lockTimeout?: number; // NEW: Custom lock timeout in seconds
}

export const signIn = async (email: string, password: string): Promise<User> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = await getUserData(userCredential.user.uid);
    if (!user) {
      throw new Error('User data not found');
    }

    await updateDoc(doc(db, 'users', userCredential.user.uid), {
      lastLoginAt: serverTimestamp()
    });

    setupFCM();

    return user;
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw new Error(error.message || 'Failed to sign in');
  }
};

export const signUp = async (
  email: string,
  password: string,
  name: string,
  department?: string,
  employeeId?: string,
  campus?: 'TRP' | 'RMP'
): Promise<User> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const userData: User = {
      id: userCredential.user.uid,
      email: email.toLowerCase(),
      name,
      role: 'Staff',
      department: department || '',
      employeeId: employeeId || '',
      campus: campus || undefined,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      biometricEnabled: true,
      appLockEnabled: true, // Default to enabled
      notificationsEnabled: true, // Default to enabled
      lockTimeout: 30, // Default 30 seconds
    };

    await setDoc(doc(db, 'users', userCredential.user.uid), userData);
    return userData;
  } catch (error: any) {
    console.error('Sign up error:', error);
    throw new Error(error.message || 'Failed to sign up');
  }
};

export const signOut = async (): Promise<void> => {
  try {
    // Stop any background listeners
    if (Platform.OS !== 'web') {
      try {
        const { stopBackgroundNotificationListener } = await import('./notifications');
        stopBackgroundNotificationListener();
      } catch (error) {
        console.warn('Could not stop background listeners:', error);
      }
    }

    // Clear any app state
    try {
      await removeCurrentUserToken();
      const { appStateManager } = await import('./appStateManager');
      appStateManager.cleanup();
    } catch (error) {
      console.warn('Could not cleanup app state:', error);
    }

    await firebaseSignOut(auth);
    console.log('Firebase sign out completed successfully');
  } catch (error: any) {
    console.error('Sign out error:', error);
    throw new Error(error.message || 'Failed to sign out');
  }
};

export const getCurrentUser = async (): Promise<User | null> => {
  try {
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        unsubscribe();
        if (firebaseUser) {
          const userData = await getUserData(firebaseUser.uid);
          resolve(userData);
        } else {
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return null;
  }
};

export const getUserData = async (uid: string): Promise<User | null> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      return { id: uid, ...userDoc.data() } as User;
    }
    return null;
  } catch (error) {
    console.error('Get user data error:', error);
    return null;
  }
};

export const updateUserProfile = async (uid: string, updates: Partial<User>): Promise<void> => {
  try {
    await updateDoc(doc(db, 'users', uid), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error: any) {
    console.error('Update user profile error:', error);
    throw new Error(error.message || 'Failed to update profile');
  }
};

export const updateUserEmployeeId = async (uid: string, employeeId: string): Promise<void> => {
  try {
    await updateDoc(doc(db, 'users', uid), {
      employeeId,
      updatedAt: serverTimestamp(),
    });
  } catch (error: any) {
    console.error('Update employee ID error:', error);
    throw new Error(error.message || 'Failed to update employee ID');
  }
};

export const updateBiometricSetting = async (uid: string, enabled: boolean): Promise<void> => {
  try {
    await updateDoc(doc(db, 'users', uid), {
      biometricEnabled: enabled,
      updatedAt: serverTimestamp(),
    });
  } catch (error: any) {
    console.error('Update biometric setting error:', error);
    throw new Error(error.message || 'Failed to update biometric setting');
  }
};

export const changePassword = async (
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; message?: string }> => {
  try {
    const userObj = auth.currentUser;
    if (!userObj || !userObj.email) {
      return { success: false, message: 'User not found' };
    }

    if (newPassword.length < 6) {
      return { success: false, message: 'New password must be at least 6 characters' };
    }

    const credential = EmailAuthProvider.credential(userObj.email, currentPassword);
    await reauthenticateWithCredential(userObj, credential);
    await updatePassword(userObj, newPassword);

    return { success: true, message: 'Password changed successfully' };
  } catch (error: any) {
    console.error('Error changing password:', error);
    let message = 'Failed to change password';
    
    switch (error.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
        message = 'Current password is incorrect';
        break;
      case 'auth/weak-password':
        message = 'New password is too weak. Please choose a stronger password.';
        break;
      case 'auth/too-many-requests':
        message = 'Too many attempts. Please try again later.';
        break;
      case 'auth/network-request-failed':
        message = 'Network error. Please check your connection.';
        break;
      default:
        if (error.message) {
          message = error.message;
        }
        break;
    }

    return { success: false, message };
  }
};

export const sendPasswordReset = async (email: string): Promise<{ success: boolean; message?: string }> => {
  try {
    await sendPasswordResetEmail(auth, email);
    return { success: true, message: 'Password reset email sent' };
  } catch (error: any) {
    console.error('Error sending password reset:', error);
    return { success: false, message: error.message || 'Failed to send password reset email' };
  }
};
