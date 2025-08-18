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
  private readonly DEFAULT_LOCK_TIMEOUT = 0;
  private currentLockTimeout = this.DEFAULT_LOCK_TIMEOUT;
  private readonly STORAGE_KEY = 'app_was_locked';
  private readonly FIRST_INSTALL_KEY = 'first_install_completed';
  private readonly FIRST_LAUNCH_KEY = 'first_launch_completed';
  private appLockEnabled = false;
  private isFirstInstall = false;
  private isFirstLaunch = true;
  private authenticationPromise: Promise<{ success: boolean; message?: string }> | null = null;
  private isAuthenticated = false;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      console.log('Initializing AppStateManager...');
      
      await this.checkFirstInstall();
      await this.checkFirstLaunch();
      
      await this.loadLockState();
      await this.loadUserPreferences();
      
      if (this.isAuthenticated && Platform.OS !== 'web' && this.appLockEnabled) {
        this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
      }

      console.log('AppStateManager initialized successfully');
    } catch (error) {
      console.error('Error initializing AppStateManager:', error);
    }
  }

  private async loadLockState() {
    try {
      let storedLockState = 'false';
      if (Platform.OS === 'web') {
        storedLockState = localStorage.getItem(this.STORAGE_KEY) || 'false';
      } else {
        storedLockState = await SecureStore.getItemAsync(this.STORAGE_KEY) || 'false';
      }
      this.isLocked = storedLockState === 'true';
    } catch (error) {
      console.warn('Could not load lock state:', error);
      this.isLocked = false;
    }
  }

  public async setAuthState(authenticated: boolean) {
    this.isAuthenticated = authenticated;
    
    if (authenticated) {
      this.appLockEnabled = true;
      this.currentLockTimeout = 0;
      
      if (Platform.OS !== 'web') {
        this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
      }
      
      if (this.isLocked) {
        console.log('Maintaining existing lock state after login');
      } else {
        await this.unlockApp();
      }
    } else {
      this.appLockEnabled = false;
      
      if (this.appStateSubscription) {
        this.appStateSubscription.remove();
        this.appStateSubscription = null;
      }
      
      await this.unlockApp();
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
      }
    } catch (error) {
      console.warn('Could not load user preferences:', error);
      this.appLockEnabled = false;
      this.currentLockTimeout = 0;
    }
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (!this.isAuthenticated) return;
    
    if (nextAppState === 'background') {
      this.handleAppBackground();
    } else if (nextAppState === 'active') {
      this.handleAppForeground();
    }
  };

  private handleAppBackground() {
    if (!this.isAuthenticated || Platform.OS === 'web') return;
    
    this.lastActiveTime = Date.now();
    this.lockApp();
  }

  private handleAppForeground() {
    if (!this.isAuthenticated || Platform.OS === 'web') return;

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
      console.warn('Could not save lock state:', error);
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
      console.warn('Could not clear lock state:', error);
    }

    this.notifyListeners();
  }

  public async authenticate(): Promise<{ success: boolean; message?: string }> {
    if (this.authenticationPromise) {
      return this.authenticationPromise;
    }

    this.authenticationPromise = this.performAuthentication();
    
    try {
      const result = await this.authenticationPromise;
      return result;
    } finally {
      this.authenticationPromise = null;
    }
  }

  private async performAuthentication(): Promise<{ success: boolean; message?: string }> {
  try {
    // Add immediate auth check
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        await this.unlockApp();
        return { success: false, message: 'User not authenticated' };
      }
      
      if (Platform.OS === 'web') {
        await this.unlockApp();
        return { success: true };
      }

      if (AppState.currentState !== 'active') {
        await new Promise((resolve) => {
          const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
              subscription.remove();
              resolve(void 0);
            }
          });
          
          setTimeout(() => {
            subscription.remove();
            resolve(void 0);
          }, 3000);
        });
      }

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      
      if (!hasHardware) {
        await this.unlockApp();
        return { success: true, message: 'Biometric hardware not available' };
      }
      
      if (!isEnrolled) {
        await this.unlockApp();
        return { success: true, message: 'No biometrics set up on device' };
      }

      const promptMessage = this.isFirstInstall 
        ? 'Please authenticate to secure your app'
        : 'Unlock TrackMyLeave';

      let lastError = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const result = await authenticateWithBiometrics(promptMessage, true);
        
        if (result.success) {
          await this.unlockApp();
          return { success: true };
        }

        lastError = result.error || 'Authentication failed';

        if (lastError.includes('user_cancel') || 
            lastError.includes('too_many_attempts') ||
            lastError.includes('cancelled by user')) {
          break;
        }

        if (!lastError.includes('app_cancel') && !lastError.includes('system_cancel')) {
          break;
        }
      }
        
      return { success: false, message: lastError };

    } catch (error) {
      console.error('Error during authentication:', error);
      return { success: false, message: 'Authentication error occurred' };
    }
  }

  public async enableLockingAfterSetup() {
    if (this.isFirstInstall) {
      await this.markFirstInstallComplete();
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