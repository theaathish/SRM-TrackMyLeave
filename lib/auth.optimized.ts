import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'Staff' | 'Director';
  department: string;
  employeeId: string;
  createdAt: Date;
  lastLoginAt?: Date;
  pinAttempts?: number;
  pinLockedUntil?: Date;
}

// Enhanced security constants
const PIN_SECURITY = {
  MAX_ATTEMPTS: 3,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
  PBKDF2_ITERATIONS: 100000,
  SALT_LENGTH: 32,
};

// Generate cryptographically secure salt
const generateSalt = (): string => {
  const array = new Uint8Array(PIN_SECURITY.SALT_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

// Enhanced PIN hashing with PBKDF2
const hashPin = async (pin: string, salt: string): Promise<string> => {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: PIN_SECURITY.PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  
  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Check if PIN is locked due to too many attempts
const isPinLocked = (user: User): boolean => {
  if (!user.pinLockedUntil) return false;
  return new Date() < user.pinLockedUntil;
};

// Reset PIN attempts after successful verification
const resetPinAttempts = async (userId: string): Promise<void> => {
  await updateDoc(doc(db, 'users', userId), {
    pinAttempts: 0,
    pinLockedUntil: null
  });
};

// Increment PIN attempts and lock if necessary
const incrementPinAttempts = async (userId: string, currentAttempts: number): Promise<void> => {
  const newAttempts = currentAttempts + 1;
  const updateData: any = { pinAttempts: newAttempts };
  
  if (newAttempts >= PIN_SECURITY.MAX_ATTEMPTS) {
    updateData.pinLockedUntil = new Date(Date.now() + PIN_SECURITY.LOCKOUT_DURATION);
  }
  
  await updateDoc(doc(db, 'users', userId), updateData);
};

// Optimized PIN save function
export const savePinToFirebase = async (userId: string, pin: string): Promise<void> => {
  try {
    if (!pin || pin.length < 4) {
      throw new Error('PIN must be at least 4 digits');
    }
    
    const salt = generateSalt();
    const hashedPin = await hashPin(pin, salt);
    
    await setDoc(doc(db, 'users', userId), {
      hashedPin,
      pinSalt: salt,
      pinUpdatedAt: serverTimestamp(),
      pinAttempts: 0,
      pinLockedUntil: null
    }, { merge: true });
    
    console.log('PIN saved successfully with enhanced security');
  } catch (error) {
    console.error('Error saving PIN:', error);
    throw new Error('Failed to save PIN. Please try again.');
  }
};

// Optimized PIN retrieval
export const getPinFromFirebase = async (userId: string): Promise<{ hash: string; salt: string } | null> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return null;
    
    const userData = userDoc.data();
    if (!userData.hashedPin || !userData.pinSalt) return null;
    
    return {
      hash: userData.hashedPin,
      salt: userData.pinSalt
    };
  } catch (error) {
    console.error('Error getting PIN from Firebase:', error);
    throw new Error('Failed to retrieve PIN data');
  }
};

// Enhanced PIN verification with security measures
export const verifyPin = async (userId: string, pin: string): Promise<{ success: boolean; message?: string }> => {
  try {
    // Get user data for security checks
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return { success: false, message: 'User not found' };
    }
    
    const userData = userDoc.data() as User;
    
    // Check if PIN is locked
    if (isPinLocked(userData)) {
      const lockTime = userData.pinLockedUntil!;
      const remainingTime = Math.ceil((lockTime.getTime() - Date.now()) / 60000);
      return { 
        success: false, 
        message: `PIN locked. Try again in ${remainingTime} minutes.` 
      };
    }
    
    // Get PIN data
    const pinData = await getPinFromFirebase(userId);
    if (!pinData) {
      return { success: false, message: 'PIN not found' };
    }
    
    // Verify PIN
    const hashedPin = await hashPin(pin, pinData.salt);
    const isValid = hashedPin === pinData.hash;
    
    if (isValid) {
      // Reset attempts on successful verification
      await resetPinAttempts(userId);
      
      // Update last login time
      await updateDoc(doc(db, 'users', userId), {
        lastLoginAt: serverTimestamp()
      });
      
      return { success: true };
    } else {
      // Increment attempts on failed verification
      const currentAttempts = userData.pinAttempts || 0;
      await incrementPinAttempts(userId, currentAttempts);
      
      const remainingAttempts = PIN_SECURITY.MAX_ATTEMPTS - (currentAttempts + 1);
      if (remainingAttempts > 0) {
        return { 
          success: false, 
          message: `Incorrect PIN. ${remainingAttempts} attempts remaining.` 
        };
      } else {
        return { 
          success: false, 
          message: 'PIN locked for 15 minutes due to too many attempts.' 
        };
      }
    }
  } catch (error) {
    console.error('Error verifying PIN:', error);
    return { success: false, message: 'Failed to verify PIN. Please try again.' };
  }
};

// Optimized PIN existence check
export const checkPinExists = async (userId: string): Promise<boolean> => {
  try {
    const pinData = await getPinFromFirebase(userId);
    return !!pinData;
  } catch (error) {
    console.error('Error checking PIN existence:', error);
    return false;
  }
};

// Enhanced PIN change function
export const changePinInFirebase = async (userId: string, oldPin: string, newPin: string): Promise<{ success: boolean; message?: string }> => {
  try {
    // Verify old PIN first
    const verificationResult = await verifyPin(userId, oldPin);
    if (!verificationResult.success) {
      return { success: false, message: verificationResult.message || 'Current PIN is incorrect' };
    }
    
    // Validate new PIN
    if (newPin.length < 4) {
      return { success: false, message: 'New PIN must be at least 4 digits' };
    }
    
    if (oldPin === newPin) {
      return { success: false, message: 'New PIN must be different from current PIN' };
    }
    
    // Save new PIN
    await savePinToFirebase(userId, newPin);
    return { success: true, message: 'PIN changed successfully' };
  } catch (error) {
    console.error('Error changing PIN:', error);
    return { success: false, message: 'Failed to change PIN. Please try again.' };
  }
};

// Optimized user authentication
export const signUp = async (
  email: string, 
  password: string, 
  name: string, 
  role: 'Staff' | 'Director', 
  department: string,
  employeeId: string
) => {
  try {
    // Validate input
    if (!email || !password || !name || !department || !employeeId) {
      throw new Error('All fields are required');
    }
    
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Create user profile with enhanced data
    const userProfile: User = {
      id: user.uid,
      email,
      name,
      role,
      department,
      employeeId,
      createdAt: new Date(),
      lastLoginAt: new Date(),
      pinAttempts: 0,
    };

    await setDoc(doc(db, 'users', user.uid), {
      ...userProfile,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
    
    return userCredential;
  } catch (error) {
    console.error('Error signing up:', error);
    throw error;
  }
};

// Optimized sign in
export const signIn = async (email: string, password: string) => {
  try {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }
    
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    
    // Update last login time
    await updateDoc(doc(db, 'users', userCredential.user.uid), {
      lastLoginAt: serverTimestamp()
    });
    
    return userCredential;
  } catch (error) {
    console.error('Error signing in:', error);
    throw error;
  }
};

// Enhanced sign out
export const signOut = async () => {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

// Optimized current user getter
export const getCurrentUser = async (): Promise<User | null> => {
  try {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return null;

    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (!userDoc.exists()) return null;

    const userData = userDoc.data();
    return {
      id: firebaseUser.uid,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      department: userData.department,
      employeeId: userData.employeeId,
      createdAt: userData.createdAt?.toDate() || new Date(),
      lastLoginAt: userData.lastLoginAt?.toDate(),
      pinAttempts: userData.pinAttempts || 0,
      pinLockedUntil: userData.pinLockedUntil?.toDate(),
    };
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
};

// Enhanced auth state listener
export const onAuthStateChangedListener = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      const user = await getCurrentUser();
      callback(user);
    } else {
      callback(null);
    }
  });
};

// Utility function for validation
export const validatePinInput = (pin: string): { isValid: boolean; message?: string } => {
  if (!pin) {
    return { isValid: false, message: 'PIN is required' };
  }
  
  if (pin.length < 4) {
    return { isValid: false, message: 'PIN must be at least 4 digits' };
  }
  
  if (pin.length > 6) {
    return { isValid: false, message: 'PIN cannot exceed 6 digits' };
  }
  
  if (!/^\d+$/.test(pin)) {
    return { isValid: false, message: 'PIN must contain only numbers' };
  }
  
  return { isValid: true };
};

// Export security constants for use in components
export { PIN_SECURITY };
