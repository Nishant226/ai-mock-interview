// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAsGniD1cxd7pPZU074ETudbVSe8niJADQ",
  authDomain: "ai-interview-c43a0.firebaseapp.com",
  projectId: "ai-interview-c43a0",
  storageBucket: "ai-interview-c43a0.firebasestorage.app",
  messagingSenderId: "436377897386",
  appId: "1:436377897386:web:ed041c8eef07ae9bd303d3",
  measurementId: "G-0XPJ2XFV2F"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();