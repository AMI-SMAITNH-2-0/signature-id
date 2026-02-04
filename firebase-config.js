// firebase-config.js
console.log('🔥 Loading Firebase config...');

const firebaseConfig = {
    apiKey: "AIzaSyDJzfOmhABSBW7b3gciWzw01y0yjaMItRo",
    authDomain: "ami-smaitnh-signature-id.firebaseapp.com",
    projectId: "ami-smaitnh-signature-id",
    storageBucket: "ami-smaitnh-signature-id.firebasestorage.app",
    messagingSenderId: "876171811139",
    appId: "1:876171811139:web:c1b6af6383f3827480f7f6"
};

// Initialize Firebase
try {
    // Check if Firebase is available
    if (typeof firebase === 'undefined') {
        console.error('❌ Firebase SDK not loaded! Check script order');
    } else {
        // Initialize only if not already initialized
        if (!firebase.apps.length) {
            console.log('🔄 Initializing Firebase app...');
            const app = firebase.initializeApp(firebaseConfig);
            console.log('✅ Firebase app initialized:', app.name);
            
            // Test services
            console.log('🧪 Testing services:');
            console.log('- Firestore:', typeof firebase.firestore);
            console.log('- Auth:', typeof firebase.auth);
            console.log('- Storage:', typeof firebase.storage);
        } else {
            console.log('✅ Firebase already initialized');
        }
    }
} catch (error) {
    console.error('❌ Firebase initialization error:', error);
}

// Make Firebase globally accessible
window.firebaseConfig = firebaseConfig;
console.log('✅ Firebase config loaded');