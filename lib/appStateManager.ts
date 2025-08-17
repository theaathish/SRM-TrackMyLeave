import { AppState, AppStateStatus, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { authenticateWithBiometrics } from './biometric';
import { getCurrentUser } from './auth';

type LockListener = (isLocked: boolean) => void;

class AppStateManager {
  private isLocked = false; // Start unlocked by default
  private lockTimeout: NodeJS.Timeout | null = null;
  private lastActiveTime = Date.now();
  private listeners: LockListener[] = [];
  private appStateSubscription: any = null;
  private readonly DEFAULT_LOCK_TIMEOUT = 0;
  private currentLockTimeout = this.DEFAULT_LOCK_TIMEOUT;
  private readonly STORAGE_KEY = 'app_was_locked';
  private readonly FIRST_INSTALL_KEY = 'first_install_completed';
  private readonly FIRST_LAUNCH_KEY = 'first_launch_completed';
  private appLockEnabled = false; // Disabled by default
  private isFirstInstall = false;
  private isFirstLaunch = true;
  private authenticationPromise: Promise<{ success: boolean; message?: string }> | null = null;
  private isAuthenticated = false; // Track authentication state

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      console.log('Initializing AppStateManager...');
      
      await this.checkFirstInstall();
      await this.checkFirstLaunch();
      
      await this.loadUserPreferences();
      
      // Only add app state listeners if authenticated
      if (this.isAuthenticated && Platform.OS !== 'web' && this.appLockEnabled) {
        this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
      }

      await this.initializeLockState();
      console.log('AppStateManager initialized successfully');
    } catch (error) {
      console.error('Error initializing AppStateManager:', error);
    }
  }

  public setAuthState(authenticated: boolean) {
    this.isAuthenticated = authenticated;
    
    if (authenticated) {
      // Enable app lock after login
      this.appLockEnabled = true;
      this.currentLockTimeout = 0;
      
      // Add app state listeners only after login
      if (Platform.OS !== 'web') {
        this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
      }
      
      // Lock immediately after login if not first launch
      if (!this.isFirstLaunch) {
        this.lockApp();
      }
    } else {
      // Disable app lock on logout
      this.appLockEnabled = false;
      
      // Remove app state listeners
      if (this.appStateSubscription) {
        this.appStateSubscription.remove();
        this.appStateSubscription = null;
      }
      
      // Unlock on logout
      this.unlockApp();
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
      this.isFirstInstall = true;
    }
  }

  private async checkFirstLaunch() {
    try {
      let firstLaunchCompleted = 'false';
      if (Platform.OS === 'web') {
        firstLaunchCompleted = localStorage.getItem(this.FIRST_LAUNCH_KEY) || 'false';
      } else {
        firstLaunchCompleted = await SecureStore.getItemAsync(this.FIRST_LAUNCH_KEY) || 'false';
      }

      this.isFirstLaunch = firstLaunchCompleted !== 'true';
      console.log('First launch check:', { isFirstLaunch: this.isFirstLaunch });
    } catch (error) {
      console.warn('Could not check first launch status:', error);
      this.isFirstLaunch = true;
    }
  }

  private async markFirstLaunchComplete() {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(this.FIRST_LAUNCH_KEY, 'true');
      } else {
        await SecureStore.setItemAsync(this.FIRST_LAUNCH_KEY, 'true');
      }
      this.isFirstLaunch = false;
      console.log('First launch marked as complete');
    } catch (error) {
      console.warn('Could not mark first launch as complete:', error);
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
        this.isAuthenticated = true;
        this.appLockEnabled = user.appLockEnabled ?? true;
        this.currentLockTimeout = user.lockTimeout ?? 0;
        console.log('App lock preferences loaded:', {
          enabled: this.appLockEnabled,
          timeout: this.currentLockTimeout
        });
      }
    } catch (error) {
      console.warn('Could not load user preferences:', error);
      this.appLockEnabled = false;
      this.currentLockTimeout = 0;
    }
  }

  private async initializeLockState() {
    // Only lock if authenticated and not first launch
    this.isLocked = this.isAuthenticated && !this.isFirstLaunch;
    
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(this.STORAGE_KEY, this.isLocked.toString());
      } else {
        await SecureStore.setItemAsync(this.STORAGE_KEY, this.isLocked.toString());
      }
    } catch (error) {
      console.warn('Could not save initial lock state to storage:', error);
    }

    if (this.isFirstLaunch) {
      await this.markFirstLaunchComplete();
    }

    this.notifyListeners();
    
    console.log('App initialized:', { 
      isFirstInstall: this.isFirstInstall, 
      isFirstLaunch: this.isFirstLaunch,
      isLocked: this.isLocked 
    });
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (!this.isAuthenticated) return;
    
    console.log('App state changed:', AppState.currentState, '->', nextAppState);
    if (nextAppState === 'background') {
      this.handleAppBackground();
    } else if (nextAppState === 'active') {
      this.handleAppForeground();
    }
  };

  private handleAppBackground() {
    if (!this.isAuthenticated) return;
    
    if (Platform.OS === 'web') return;
    
    this.lastActiveTime = Date.now();
    this.lockApp();
  }

  private handleAppForeground() {
    if (!this.isAuthenticated) return;
    
    if (Platform.OS === 'web') return;

    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
      this.lockTimeout = null;
    }

    setTimeout(() => {
      if (!this.isLocked) {
        this.lockApp();
      }
    }, 100);
  }

  public async updatePreferences(appLockEnabled: boolean, lockTimeout?: number) {
    this.appLockEnabled = appLockEnabled;
    this.currentLockTimeout = lockTimeout ?? this.DEFAULT_LOCK_TIMEOUT;
    console.log('App lock preferences updated:', {
      enabled: this.appLockEnabled,
      timeout: this.currentLockTimeout
    });
  }

  private async lockApp() {
    if (!this.isAuthenticated || this.isLocked) return;

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
      
      // Check authentication state first
      if (!this.isAuthenticated) {
        return { success: false, message: 'User not authenticated' };
      }
      
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
        ? 'Please authenticate to secure your app'
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

  // Call this method when user completes initial app setup
  public async enableLockingAfterSetup() {
    if (this.isFirstInstall) {
      console.log('Enabling app locking after first setup...');
      await this.markFirstInstallComplete();
      
      console.log('App locking enabled. Normal security behavior will apply.');
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
    // Always return false for web (no locking support), otherwise return actual state
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
    return this.appLockEnabled && this.isAuthenticated;
  }

  public isFirstInstallCheck(): boolean {
    return this.isFirstInstall;
  }

  public isFirstLaunchCheck(): boolean {
    return this.isFirstLaunch;
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
    this.authenticationPromise = null;
  }
}

export const appStateManager = new AppStateManager();