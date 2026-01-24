import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBWdHpHec7m_Xcyq8YISscZdcYkoRmIUEw",
  authDomain: "custom-fantasy-b220a.firebaseapp.com",
  projectId: "custom-fantasy-b220a",
  storageBucket: "custom-fantasy-b220a.firebasestorage.app",
  messagingSenderId: "273947739453",
  appId: "1:273947739453:web:c7169327a7d6cc6fc8f154"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  try {
     console.log("Checking system/standings...");
     const snap = await getDoc(doc(db, "system", "standings"));
     
     if (snap.exists()) {
        const data = snap.data();
        console.log("Forms Data Found!");
        console.log("Keys count:", Object.keys(data.forms || {}).length);
        console.log("Sample (Arsenal):", data.forms ? data.forms["Arsenal FC"] : "N/A");
        console.log("Sample (Liverpool):", data.forms ? data.forms["Liverpool FC"] : "N/A");
     } else {
         console.log("❌ system/standings document does NOT exist.");
     }
  } catch (e) {
      console.error(e);
  }
  process.exit();
}
check();
