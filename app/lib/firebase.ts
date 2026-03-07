import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDIbQaayBFHd5sxGCAnTRr3Eypex6C6bJw",
  authDomain: "shareline-591bb.firebaseapp.com",
  projectId: "shareline-591bb",
  storageBucket: "shareline-591bb.firebasestorage.app",
  messagingSenderId: "1061493986739",
  appId: "1:1061493986739:web:05d044252d6145ee1da7c6",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);

// 🔎 Firestore debug logs go to the browser console

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});