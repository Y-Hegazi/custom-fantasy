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
     const sysSnap = await getDoc(doc(db, "system", "status"));
     
     if (sysSnap.exists()) {
        const gw = sysSnap.data().currentRound || "4"; // Defaulting to 4 if missing, logic from Admin.jsx
        console.log("System GW:", gw);
        
        const cacheSnap = await getDoc(doc(db, "matches_cache", "week_" + gw));
        if (cacheSnap.exists()) {
            const matches = cacheSnap.data().matches || [];
            console.log(`GW ${gw} Match Count: ${matches.length}`);
            
            const finished = matches.filter(m => m.status === 'FINISHED');
            console.log(`Finished Matches: ${finished.length}`);
            
            if (finished.length > 0) {
               console.log("Sample Finished Match Score:", JSON.stringify(finished[0].score, null, 2));
               console.log("Sample Finished Match Status:", finished[0].status);
            }
        } else {
            console.log("No cache found for GW " + gw);
        }
     } else {
         console.log("System status doc missing");
     }
  } catch (e) {
      console.error(e);
  }
  process.exit();
}
check();
