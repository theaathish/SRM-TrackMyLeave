import messaging from '@react-native-firebase/messaging';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { getCurrentUser } from './auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATION_API = process.env.EXPO_PUBLIC_NOTIFICATION_PUSH_API;

export const setupFCM = async () => {
  try {
    // Ask permission
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!enabled) {
      console.log('❌ Permission denied for notifications');
      return;
    }

    // Get FCM token
    const token = await messaging().getToken();
    const user = await getCurrentUser();
    console.log('🔑 FCM TOKEN:', token, '👤 User:', user);

    await AsyncStorage.setItem("FCMKey", token);
    
    // Add token to user's token list if user is authenticated
    if (user && token) {
      await addUserToken(user.id, token);
    }
  } catch (err) {
    console.log('❌ Notification setup error:', err);
  }
};

// Function to get current user's token and remove it from their list
export const removeCurrentUserToken = async (): Promise<void> => {
  try {
    const user = await getCurrentUser();
    const token = await AsyncStorage.getItem("FCMKey");
    
    AsyncStorage.removeItem("FCMKey");
    if (user && token) {
      await removeUserToken(user.id, token);
    }
  } catch (error) {
    console.error('Error removing current user token:', error);
    throw new Error(`Failed to remove current user token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Function #1: Get list of tokens for a specific userId
export const getUserTokens = async (userId: string): Promise<string[]> => {
  try {
    const userTokenDoc = await getDoc(doc(db, 'userTokens', userId));
    
    if (userTokenDoc.exists()) {
      const data = userTokenDoc.data();
      return data.tokens || [];
    }
    
    return [];
  } catch (error) {
    console.error('Error getting user tokens:', error);
    throw new Error(`Failed to get user tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Function #2: Get tokens of all directors
export const getDirectorTokens = async (): Promise<string[]> => {
  try {
    const q = query(
      collection(db, 'userTokens'),
      where('role', '==', 'Director')
    );
    
    const querySnapshot = await getDocs(q);
    const allTokens: string[] = [];
    
    querySnapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.tokens && Array.isArray(data.tokens)) {
        allTokens.push(...data.tokens);
      }
    });
    
    return allTokens;
  } catch (error) {
    console.error('Error getting director tokens:', error);
    throw new Error(`Failed to get director tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Function #3: Add a new token to user's token list
export const addUserToken = async (userId: string, token: string): Promise<void> => {
  try {
    const userTokenRef = doc(db, 'userTokens', userId);
    const userTokenDoc = await getDoc(userTokenRef);
    
    if (userTokenDoc.exists()) {
      // Document exists, update it
      await updateDoc(userTokenRef, {
        tokens: arrayUnion(token),
        updatedAt: new Date()
      });
    } else {
      // Document doesn't exist, create it
      // Get user role from users collection
      let userRole = 'staff'; // Default fallback
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          userRole = userDoc.data().role || 'staff';
        }
      } catch (roleError) {
        console.warn('Could not fetch user role, using default:', roleError);
      }
      
      await setDoc(userTokenRef, {
        userId: userId,
        tokens: [token],
        role: userRole,
        updatedAt: new Date()
      });
    }
  } catch (error) {
    console.error('Error adding user token:', error);
    throw new Error(`Failed to add user token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Function #4: Remove a token from user's token list
export const removeUserToken = async (userId: string, token: string): Promise<void> => {
  try {
    const userTokenRef = doc(db, 'userTokens', userId);
    
    await updateDoc(userTokenRef, {
      tokens: arrayRemove(token),
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Error removing user token:', error);
    throw new Error(`Failed to remove user token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// FIXED: Enhanced notification sender with proper error handling and response checking
const sendNot = async (token: string, title: string, body: string): Promise<boolean> => {
    try {
        console.log('🚀 Sending notification to token:', token.substring(0, 20) + '...');
        
        // Validate inputs
        if (!token || !title || !body) {
            console.error('❌ Invalid notification parameters:', { token: !!token, title, body });
            return false;
        }

        // Check if API key is available
        if (!NOTIFICATION_API) {
            console.error('❌ NOTIFICATION_API key is missing from environment variables');
            return false;
        }

        const response = await fetch("https://fcm.googleapis.com/v1/projects/7588322507/messages:send", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + NOTIFICATION_API
            },
            body: JSON.stringify({
                "message": {
                    "token": token,
                    "notification": {
                        "title": title,
                        "body": body
                    },
                    // Add data payload for better handling
                    "data": {
                        "title": title,
                        "body": body,
                        "timestamp": Date.now().toString()
                    }
                }
            })
        });

        // Check response status
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ FCM API Error:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            return false;
        }

        const result = await response.json();
        console.log('✅ Notification sent successfully:', result);
        return true;

    } catch (error) {
        console.error('❌ Error sending notification:', error);
        return false;
    }
};

// FIXED: Enhanced user notification function with better error handling
export async function sendPushNotificationToUser(userID: string, title: string, body: string): Promise<void> {
    try {
        console.log('📱 Sending notifications to user:', userID);
        
        const userTokens = await getUserTokens(userID);
        
        if (userTokens.length === 0) {
            console.warn('⚠️ No tokens found for user:', userID);
            return;
        }

        console.log('📋 Found', userTokens.length, 'tokens for user');

        // Send notifications concurrently for better performance
        const promises = userTokens.map(token => sendNot(token, title, body));
        const results = await Promise.allSettled(promises);
        
        // Log results
        const successful = results.filter(result => 
            result.status === 'fulfilled' && result.value === true
        ).length;
        
        console.log(`📊 Notification results: ${successful}/${userTokens.length} successful`);
        
        // Log any failures
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`❌ Failed to send to token ${index}:`, result.reason);
            }
        });

    } catch (error) {
        console.error('❌ Error in sendPushNotificationToUser:', error);
        throw error;
    }
}

// FIXED: Enhanced director notification function with better error handling
export async function sendNotificationToDirectors(title: string, body: string): Promise<void> {
    try {
        console.log('👥 Sending notifications to directors');
        
        const userTokens = await getDirectorTokens();
        
        if (userTokens.length === 0) {
            console.warn('⚠️ No director tokens found');
            return;
        }

        console.log('📋 Found', userTokens.length, 'director tokens');

        // Send notifications concurrently for better performance
        const promises = userTokens.map(token => sendNot(token, title, body));
        const results = await Promise.allSettled(promises);
        
        // Log results
        const successful = results.filter(result => 
            result.status === 'fulfilled' && result.value === true
        ).length;
        
        console.log(`📊 Director notification results: ${successful}/${userTokens.length} successful`);
        
        // Log any failures
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`❌ Failed to send to director token ${index}:`, result.reason);
            }
        });

    } catch (error) {
        console.error('❌ Error in sendNotificationToDirectors:', error);
        throw error;
    }
}

// BONUS: Utility function to test a single token
export async function testNotification(token: string): Promise<void> {
    console.log('🧪 Testing notification for token:', token.substring(0, 20) + '...');
    const success = await sendNot(token, 'Test Notification', 'This is a test message');
    console.log('🧪 Test result:', success ? '✅ Success' : '❌ Failed');
}