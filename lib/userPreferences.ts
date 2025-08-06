import { updateDoc, doc } from 'firebase/firestore';
import { db } from './firebase';
import { getCurrentUser } from './auth';
import { appStateManager } from './appStateManager';
import { updateNotificationPreferences } from './notifications';

export interface UserPreferences {
  appLockEnabled: boolean;
  lockTimeout: number; // in seconds
  notificationsEnabled: boolean;
  biometricEnabled: boolean;
}

export const updateUserPreferences = async (
  preferences: Partial<UserPreferences>
): Promise<{ success: boolean; message?: string }> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    // Update Firestore
    await updateDoc(doc(db, 'users', user.id), {
      ...preferences,
      updatedAt: new Date(),
    });

    // Update app state manager if app lock settings changed
    if (preferences.appLockEnabled !== undefined || preferences.lockTimeout !== undefined) {
      await appStateManager.updatePreferences(
        preferences.appLockEnabled ?? user.appLockEnabled ?? true,
        preferences.lockTimeout ?? user.lockTimeout ?? 30
      );
    }

    // Update notification preferences if changed
    if (preferences.notificationsEnabled !== undefined) {
      await updateNotificationPreferences(preferences.notificationsEnabled);
    }

    return { success: true, message: 'Preferences updated successfully' };
  } catch (error) {
    console.error('Error updating user preferences:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Failed to update preferences' 
    };
  }
};

export const getUserPreferences = async (): Promise<UserPreferences | null> => {
  try {
    const user = await getCurrentUser();
    if (!user) return null;

    return {
      appLockEnabled: user.appLockEnabled ?? true,
      lockTimeout: user.lockTimeout ?? 30,
      notificationsEnabled: user.notificationsEnabled ?? true,
      biometricEnabled: user.biometricEnabled ?? true,
    };
  } catch (error) {
    console.error('Error getting user preferences:', error);
    return null;
  }
};
