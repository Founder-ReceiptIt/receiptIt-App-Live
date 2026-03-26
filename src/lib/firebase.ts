import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, orderBy, onSnapshot, deleteDoc, doc } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAh7yIZXf5edBvYBaHG8pCPRtbObUkFqjE",
  authDomain: "receiptit-app-demo.firebaseapp.com",
  projectId: "receiptit-app-demo",
  storageBucket: "receiptit-app-demo.firebasestorage.app",
  messagingSenderId: "705780615126",
  appId: "1:705780615126:web:40f844fa5f9eb458554677",
  measurementId: "G-7BPP15R4TD"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export { collection, query, orderBy, onSnapshot, deleteDoc, doc, signInAnonymously };
