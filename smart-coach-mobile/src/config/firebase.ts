import { initializeApp, getApp, getApps } from 'firebase/app';
// @ts-ignore
import { initializeAuth, getReactNativePersistence, getAuth, Auth, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAcsJPa5Xh5ut7l5Q-vTuogptaJoX_KM7I",
    authDomain: "smart-coach-e479b.firebaseapp.com",
    projectId: "smart-coach-e479b",
    storageBucket: "smart-coach-e479b.firebasestorage.app",
    messagingSenderId: "566873779914",
    appId: "1:566873779914:web:e5c4a2c898f91c3fe1ce33"
};

// Initialize Firebase
let app;
if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
} else {
    app = getApp();
}

// Initialize Auth with persistence
let auth: Auth;

// Force initialization with persistence to avoid warnings and ensure session stability
try {
    auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage)
    });
} catch (e: any) {
    // If auth is already initialized but maybe without persistence, we try to use the existing one
    // But this warning usually means we SHOULD have initialized it with persistence first.
    // In many Expo dev scenarios, reloading the app doesn't clear the firebase app instance.
    auth = getAuth(app);
}

// Export Firebase services
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };
export default app;
