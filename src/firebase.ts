// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; // Import the auth service

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBWdHpHec7m_Xcyq8YISscZdcYkoRmIUEw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "custom-fantasy-b220a.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "custom-fantasy-b220a",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "custom-fantasy-b220a.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "273947739453",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:273947739453:web:c7169327a7d6cc6fc8f154",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-B4ZZR77G9P"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);
// Initialize Firebase Authentication and get a reference to the service
const auth = getAuth(app);

// Export both so we can use them anywhere in our app
export { db, auth };

