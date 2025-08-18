// tokenManager.ts
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import serviceAccount from "../leavemanagersrm-firebase-adminsdk-fbsvc-b85442658a.json";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = ["https://www.googleapis.com/auth/firebase.messaging"];
const TOKEN_DOC_PATH = "system/fcmToken";
const TOKEN_BUFFER_MS = 5 * 60 * 1000;

// Your Vercel API endpoint
const VERCEL_SIGN_API = "https://signing-rs-256.vercel.app/sign-jwt";

interface TokenData {
  accessToken: string;
  expiresAt: number;
  refreshedAt: any;
}

/**
 * Create JWT using Vercel API for RS256 signing
 */
async function createJWT(): Promise<string> {
  try {
    const now = Math.floor(Date.now() / 1000);
    
    const payload = {
      iss: serviceAccount.client_email,
      scope: SCOPES.join(" "),
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600, // expires in 1h
    };

    // Call Vercel API to sign the JWT
    const response = await fetch(VERCEL_SIGN_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payload,
        privateKey: serviceAccount.private_key
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Signing API error: ${errorData.message}`);
    }

    const data = await response.json();
    return data.signedJWT;
  } catch (error) {
    console.error("Error creating JWT:", error);
    throw new Error("Failed to create JWT");
  }
}

/**
 * Exchange JWT for OAuth2 access token from Google
 */
async function fetchNewAccessToken(): Promise<{ token: string; expiresIn: number }> {
  try {
    const jwt = await createJWT();
    
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }).toString(),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Token fetch failed: ${res.status} ${errorText}`);
    }

    const data = await res.json();
    
    if (!data.access_token) {
      throw new Error("No access token in response");
    }

    return {
      token: data.access_token,
      expiresIn: data.expires_in || 3600, // default 1 hour
    };
  } catch (error) {
    console.error("Error fetching new access token:", error);
    throw error;
  }
}

/**
 * Get token from Firestore
 */
async function getTokenFromFirestore(): Promise<TokenData | null> {
  try {
    const tokenDoc = await getDoc(doc(db, TOKEN_DOC_PATH));
    
    if (!tokenDoc.exists()) {
      console.log("No token document found in Firestore");
      return null;
    }

    const data = tokenDoc.data() as TokenData;
    
    // Validate token data structure
    if (!data.accessToken || !data.expiresAt) {
      console.warn("Invalid token data structure in Firestore");
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error getting token from Firestore:", error);
    return null;
  }
}

/**
 * Save token to Firestore
 */
async function saveTokenToFirestore(token: string, expiresIn: number): Promise<void> {
  try {
    const expiresAt = Date.now() + (expiresIn * 1000);
    
    const tokenData: TokenData = {
      accessToken: token,
      expiresAt,
      refreshedAt: serverTimestamp(),
    };

    await setDoc(doc(db, TOKEN_DOC_PATH), tokenData);
    console.log("Token saved to Firestore successfully");
  } catch (error) {
    console.error("Error saving token to Firestore:", error);
    throw error;
  }
}

/**
 * Check if token is expired (with buffer time)
 */
function isTokenExpired(expiresAt: number): boolean {
  return Date.now() >= (expiresAt - TOKEN_BUFFER_MS);
}

/**
 * Refresh token and save to Firestore
 */
async function refreshAndSaveToken(): Promise<string> {
  console.log("Refreshing FCM access token...");
  
  try {
    const { token, expiresIn } = await fetchNewAccessToken();
    await saveTokenToFirestore(token, expiresIn);
    
    console.log("Token refreshed and saved successfully");
    return token;
  } catch (error) {
    console.error("Error refreshing token:", error);
    throw new Error("Failed to refresh access token");
  }
}

/**
 * Public API: Get a valid access token
 */
export async function getAccessToken(): Promise<string> {
  try {
    // Step 1: Try to get existing token from Firestore
    console.log("Checking for existing FCM token...");
    const existingToken = await getTokenFromFirestore();

    // Step 2: If token exists and is not expired, use it
    if (existingToken && !isTokenExpired(existingToken.expiresAt)) {
      console.log("Using existing valid token from Firestore");
      return existingToken.accessToken;
    }

    // Step 3: Token doesn't exist or is expired, refresh it
    if (existingToken) {
      console.log("Token expired, refreshing...");
    } else {
      console.log("No existing token found, fetching new one...");
    }

    return await refreshAndSaveToken();
    
  } catch (error) {
    console.error("Error in getAccessToken:", error);
    
    // Fallback: try to use existing token even if expired
    try {
      const fallbackToken = await getTokenFromFirestore();
      if (fallbackToken?.accessToken) {
        console.warn("Using expired token as fallback");
        return fallbackToken.accessToken;
      }
    } catch (fallbackError) {
      console.error("Fallback token retrieval failed:", fallbackError);
    }
    
    throw new Error("Failed to obtain access token");
  }
}

/**
 * Force refresh token
 */
export async function forceRefreshToken(): Promise<string> {
  console.log("Force refreshing FCM token...");
  return await refreshAndSaveToken();
}

/**
 * Get token info for debugging
 */
export async function getTokenInfo(): Promise<{ 
  hasToken: boolean; 
  expiresAt?: number; 
  isExpired?: boolean;
  timeUntilExpiry?: number;
}> {
  try {
    const tokenData = await getTokenFromFirestore();
    
    if (!tokenData) {
      return { hasToken: false };
    }

    const isExpired = isTokenExpired(tokenData.expiresAt);
    const timeUntilExpiry = tokenData.expiresAt - Date.now();

    return {
      hasToken: true,
      expiresAt: tokenData.expiresAt,
      isExpired,
      timeUntilExpiry: Math.max(0, timeUntilExpiry),
    };
  } catch (error) {
    console.error("Error getting token info:", error);
    return { hasToken: false };
  }
}
