import { AppState, AppStateStatus, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { authenticateWithBiometrics } from './biometric';
import { getCurrentUser } from './auth';

type LockListener = (isLocked: boolean) => void;

class AppStateManager {
  private isLocked = true; // Always start locked
  private lockTimeout: NodeJS.Timeout | null = null;
  private lastActiveTime = Date.now();
  private listeners: LockListener[] = [];
  private appStateSubscription: any = null;
  private readonly DEFAULT_LOCK_TIMEOUT = 0; // Immediate lock
  private currentLockTimeout = this.DEFAULT_LOCK_TIMEOUT;
  private readonly STORAGE_KEY = 'app_was_locked';
  private readonly FIRST_INSTALL_KEY = 'first_install_completed';
  private appLockEnabled = true; // Always enabled
  private isFirstInstall = false;
  private authenticationPromise: Promise<{ success: boolean; message?: string }> | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      console.log('Initializing AppStateManager...');
      
      // Check if this is first install
      await this.checkFirstInstall();
      
      // Load user preferences
      await this.loadUserPreferences();
      
      if (Platform.OS !== 'web' && this.appLockEnabled) {
        this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
      }

      // Always initialize as locked - user must authenticate on every app open
      await this.initializeLockState();
      console.log('AppStateManager initialized successfully');
    } catch (error) {
      console.error('Error initializing AppStateManager:', error);
    }
  }

  private async checkFirstInstall() {
    try {
      let firstInstallCompleted = 'false';
      if (Platform.OS === 'web') {
        firstInstallCompleted = localStorage.getItem(this.FIRST_INSTALL_KEY) || 'false';
      } else {
        firstInstallCompleted = await SecureStore.getItemAsync(this.FIRST_INSTALL_KEY) || 'false';
      }

      this.isFirstInstall = firstInstallCompleted !== 'true';
      console.log('First install check:', { isFirstInstall: this.isFirstInstall });
    } catch (error) {
      console.warn('Could not check first install status:', error);
      this.isFirstInstall = true; // Assume first install on error
    }
  }

  private async markFirstInstallComplete() {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(this.FIRST_INSTALL_KEY, 'true');
      } else {
        await SecureStore.setItemAsync(this.FIRST_INSTALL_KEY, 'true');
      }
      this.isFirstInstall = false;
      console.log('First install marked as complete');
    } catch (error) {
      console.warn('Could not mark first install as complete:', error);
    }
  }

  private async loadUserPreferences() {
    try {
      const user = await getCurrentUser();
      if (user) {
        // Force app lock to be enabled regardless of user preference for security
        this.appLockEnabled = true;
        this.currentLockTimeout = 0; // Always immediate lock
        console.log('App lock preferences loaded (forced enabled):', {
          enabled: this.appLockEnabled,
          timeout: this.currentLockTimeout
        });
      }
    } catch (error) {
      console.warn('Could not load user preferences:', error);
      // Use secure defaults
      this.appLockEnabled = true;
      this.currentLockTimeout = 0;
    }
  }

  private async initializeLockState() {
    // Always start locked - user must authenticate on every app open
    this.isLocked = true;
    
    try {
      // Set locked state in storage
      if (Platform.OS === 'web') {
        localStorage.setItem(this.STORAGE_KEY, 'true');
      } else {
        await SecureStore.setItemAsync(this.STORAGE_KEY, 'true');
      }
    } catch (error) {
      console.warn('Could not save initial lock state to storage:', error);
    }

    // Notify listeners that app is locked
    this.notifyListeners();
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    console.log('App state changed:', AppState.currentState, '->', nextAppState);
    if (nextAppState === 'background') {
      this.handleAppBackground();
    } else if (nextAppState === 'active') {
      this.handleAppForeground();
    }
  };

  private handleAppBackground() {
    if (Platform.OS === 'web') return;
    
    this.lastActiveTime = Date.now();
    // Lock immediately when going to background
    this.lockApp();
  }

  private handleAppForeground() {
    if (Platform.OS === 'web') return;

    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
      this.lockTimeout = null;
    }

    // Always lock when coming back to foreground, but add a small delay
    // to avoid interference with the authentication process
    setTimeout(() => {
      if (!this.isLocked) {
        this.lockApp();
      }
    }, 100);
  }

  // Public method to update user preferences (but maintain security)
  public async updatePreferences(appLockEnabled: boolean, lockTimeout?: number) {
    // Force app lock to always be enabled for security
    this.appLockEnabled = true;
    this.currentLockTimeout = 0; // Always immediate lock

    console.log('App lock preferences updated (security enforced):', {
      enabled: this.appLockEnabled,
      timeout: this.currentLockTimeout
    });
  }

  private async lockApp() {
    if (this.isLocked) return;

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
    
    // Mark first install as complete when user successfully authenticates
    if (this.isFirstInstall) {
      await this.markFirstInstallComplete();
    }
    
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

  private authenticationPromise: Promise<{ success: boolean; message?: string }> | null = null;

  public async authenticate(): Promise<{ success: boolean; message?: string }> {
    // If authentication is already in progress, return the existing promise
    if (this.authenticationPromise) {
      console.log('Authentication already in progress, returning existing promise');
      return this.authenticationPromise;
    }

    // Create new authentication promise
    this.authenticationPromise = this.performAuthentication();
    
    try {
      const result = await this.authenticationPromise;
      return result;
    } finally {
      // Clear the promise when done
      this.authenticationPromise = null;
    }
  }

  private async performAuthentication(): Promise<{ success: boolean; message?: string }> {
    try {
      console.log('Starting authentication...');
      
      if (Platform.OS === 'web') {
        // For web, just unlock (no biometric support)
        await this.unlockApp();
        return { success: true };
      }

      // Wait for app to be fully active before attempting authentication
      if (AppState.currentState !== 'active') {
        console.log('App not active, waiting...');
        await new Promise((resolve) => {
          const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
              subscription.remove();
              resolve(void 0);
            }
          });
          
          // Timeout after 3 seconds
          setTimeout(() => {
            subscription.remove();
            resolve(void 0);
          }, 3000);
        });
      }

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      
      // If no biometric hardware or not enrolled, handle gracefully
      if (!hasHardware) {
        console.log('No biometric hardware available, unlocking...');
        await this.unlockApp();
        return { success: true, message: 'Biometric hardware not available' };
      }
      
      if (!isEnrolled) {
        console.log('No biometrics enrolled, unlocking...');
        await this.unlockApp();
        return { success: true, message: 'No biometrics set up on device' };
      }

      // Attempt biometric authentication with retries
      const promptMessage = this.isFirstInstall 
        ? 'Welcome! Please authenticate to secure your app'
        : 'Unlock TrackMyLeave';

      let lastError = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
          console.log(`Authentication attempt ${attempt + 1}/2`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const result = await authenticateWithBiometrics(promptMessage, true);
        
        if (result.success) {
          await this.unlockApp();
          return { success: true };
        }

        lastError = result.error || 'Authentication failed';
        console.log(`Attempt ${attempt + 1} failed:`, lastError);

        // Don't retry on user cancellation or too many attempts
        if (lastError.includes('user_cancel') || 
            lastError.includes('too_many_attempts') ||
            lastError.includes('cancelled by user')) {
          break;
        }

        // Only retry on system/app cancellation
        if (!lastError.includes('app_cancel') && !lastError.includes('system_cancel')) {
          break;
        }
      }
        
      // Keep app locked on authentication failure
      return { success: false, message: lastError };

    } catch (error) {
      console.error('Error during authentication:', error);
      return { success: false, message: 'Authentication error occurred' };
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
    // Always return true for web (no locking support), otherwise return actual state
    return Platform.OS === 'web' ? false : this.isLocked;
  }

  public manualLock() {
    if (Platform.OS === 'web') return;
    this.lockApp();
  }

  public isLockingSupported(): boolean {
    return Platform.OS !== 'web';
  }

  public getAppLockEnabled(): boolean {
    return Platform.OS !== 'web'; // Always enabled on mobile
  }

  public isFirstInstallCheck(): boolean {
    return this.isFirstInstall;
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
    this.authenticationPromise = null; // Clear authentication promise
  }
}

export const appStateManager = new AppStateManager();