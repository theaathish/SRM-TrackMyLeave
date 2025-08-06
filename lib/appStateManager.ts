import { AppState, AppStateStatus, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { authenticateWithBiometrics } from './biometric';
import { getCurrentUser } from './auth';

type LockListener = (isLocked: boolean) => void;

class AppStateManager {
  private isLocked = false;
  private lockTimeout: NodeJS.Timeout | null = null;
  private lastActiveTime = Date.now();
  private listeners: LockListener[] = [];
  private appStateSubscription: any = null;
  private readonly DEFAULT_LOCK_TIMEOUT = 30000; // 30 seconds
  private currentLockTimeout = this.DEFAULT_LOCK_TIMEOUT;
  private readonly STORAGE_KEY = 'app_was_locked';
  private appLockEnabled = true; // Default to enabled

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      console.log('Initializing AppStateManager...');
      
      // Load user preferences
      await this.loadUserPreferences();
      
      if (Platform.OS !== 'web' && this.appLockEnabled) {
        this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
      }

      await this.initializeLockState();
      console.log('AppStateManager initialized successfully');
    } catch (error) {
      console.error('Error initializing AppStateManager:', error);
    }
  }

  private async loadUserPreferences() {
    try {
      const user = await getCurrentUser();
      if (user) {
        this.appLockEnabled = user.appLockEnabled ?? true;
        this.currentLockTimeout = (user.lockTimeout ?? this.DEFAULT_LOCK_TIMEOUT) * 1000;
        console.log('App lock preferences loaded:', {
          enabled: this.appLockEnabled,
          timeout: this.currentLockTimeout
        });
      }
    } catch (error) {
      console.warn('Could not load user preferences:', error);
      // Use defaults
      this.appLockEnabled = true;
      this.currentLockTimeout = this.DEFAULT_LOCK_TIMEOUT;
    }
  }

  private async initializeLockState() {
    if (!this.appLockEnabled) {
      this.isLocked = false;
      return;
    }

    try {
      let wasLocked = 'false';
      if (Platform.OS === 'web') {
        wasLocked = localStorage.getItem(this.STORAGE_KEY) || 'false';
      } else {
        wasLocked = await SecureStore.getItemAsync(this.STORAGE_KEY) || 'false';
      }

      if (wasLocked === 'true') {
        this.isLocked = true;
        this.notifyListeners();
      }
    } catch (error) {
      console.warn('Could not read lock state from storage:', error);
      this.isLocked = false;
    }
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (!this.appLockEnabled) return;

    console.log('App state changed:', AppState.currentState, '->', nextAppState);
    if (nextAppState === 'background') {
      this.handleAppBackground();
    } else if (nextAppState === 'active') {
      this.handleAppForeground();
    }
  };

  private handleAppBackground() {
    if (Platform.OS === 'web' || !this.appLockEnabled) return;
    
    this.lastActiveTime = Date.now();
    this.lockTimeout = setTimeout(() => {
      console.log('Lock timeout triggered');
      this.lockApp();
    }, this.currentLockTimeout);
  }

  private handleAppForeground() {
    if (Platform.OS === 'web' || !this.appLockEnabled) return;

    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
      this.lockTimeout = null;
    }

    const timeAway = Date.now() - this.lastActiveTime;
    if (timeAway > this.currentLockTimeout && !this.isLocked) {
      this.lockApp();
    }
  }

  // Public method to update user preferences
  public async updatePreferences(appLockEnabled: boolean, lockTimeout?: number) {
    this.appLockEnabled = appLockEnabled;
    
    if (lockTimeout) {
      this.currentLockTimeout = lockTimeout * 1000; // Convert to milliseconds
    }

    if (!appLockEnabled) {
      // If app lock is disabled, unlock and clean up
      await this.unlockApp();
      this.cleanup();
    } else {
      // If enabled, reinitialize
      if (Platform.OS !== 'web') {
        this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
      }
    }

    console.log('App lock preferences updated:', {
      enabled: this.appLockEnabled,
      timeout: this.currentLockTimeout
    });
  }

  private async lockApp() {
    if (this.isLocked || !this.appLockEnabled) return;

    console.log('Locking app...');
    this.isLocked = true;
    
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(this.STORAGE_KEY, 'true');
      } else {
        await SecureStore.setItemAsync(this.STORAGE_KEY, 'true');
      }
    } catch (error) {
      console.warn('Could not save lock state to storage:', error);
    }

    this.notifyListeners();
  }

  private async unlockApp() {
    console.log('Unlocking app...');
    this.isLocked = false;
    
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem(this.STORAGE_KEY);
      } else {
        await SecureStore.deleteItemAsync(this.STORAGE_KEY);
      }
    } catch (error) {
      console.warn('Could not clear lock state from storage:', error);
    }

    this.notifyListeners();
  }

  public async authenticate(): Promise<{ success: boolean; message?: string }> {
    if (!this.appLockEnabled) {
      return { success: true };
    }

    try {
      console.log('Starting authentication...');
      if (Platform.OS === 'web') {
        await this.unlockApp();
        return { success: true };
      }

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      
      if (!hasHardware || !isEnrolled) {
        await this.unlockApp();
        return { success: true };
      }

      const result = await authenticateWithBiometrics('Unlock TrackMyLeave');
      if (result.success) {
        await this.unlockApp();
        return { success: true };
      } else {
        return { success: false, message: result.error };
      }
    } catch (error) {
      console.error('Error during authentication:', error);
      await this.unlockApp();
      return { success: true };
    }
  }

  public addListener(listener: LockListener) {
    this.listeners.push(listener);
  }

  public removeListener(listener: LockListener) {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  private notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.isLocked);
      } catch (error) {
        console.error('Error notifying lock listener:', error);
      }
    });
  }

  public getIsLocked(): boolean {
    return Platform.OS === 'web' ? false : (this.isLocked && this.appLockEnabled);
  }

  public manualLock() {
    if (Platform.OS === 'web' || !this.appLockEnabled) return;
    this.lockApp();
  }

  public isLockingSupported(): boolean {
    return Platform.OS !== 'web' && this.appLockEnabled;
  }

  public getAppLockEnabled(): boolean {
    return this.appLockEnabled;
  }

  public cleanup() {
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
      this.lockTimeout = null;
    }

    if (this.appStateSubscription && Platform.OS !== 'web') {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    this.listeners = [];
  }
}

export const appStateManager = new AppStateManager();
