// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; // Import the auth service

const firebaseConfig = {

  apiKey: "AIzaSyBWdHpHec7m_Xcyq8YISscZdcYkoRmIUEw",

  authDomain: "custom-fantasy-b220a.firebaseapp.com",

  projectId: "custom-fantasy-b220a",

  storageBucket: "custom-fantasy-b220a.firebasestorage.app",

  messagingSenderId: "273947739453",

  appId: "1:273947739453:web:c7169327a7d6cc6fc8f154",

  measurementId: "G-B4ZZR77G9P"

};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);
// Initialize Firebase Authentication and get a reference to the service
const auth = getAuth(app);

// Export both so we can use them anywhere in our app
export { db, auth };

