import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyAJkOHxGtEIErCjcZFkD5w_0UTVewea4BE',
  authDomain: 'agentia-cbf24.firebaseapp.com',
  projectId: 'agentia-cbf24',
  storageBucket: 'agentia-cbf24.firebasestorage.app',
  messagingSenderId: '392565820880',
  appId: '1:392565820880:web:5b85f765580c60d40c7dd5',
  measurementId: 'G-DQP2MZJ36E',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
