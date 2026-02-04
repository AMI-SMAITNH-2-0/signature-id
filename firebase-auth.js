// firebase-auth.js - COMPLETE VERSION WITH ERROR HANDLING
class FirebaseAuthManager {
    constructor() {
        this.auth = null;
        this.db = null;
        this.storage = null;
        this.isInitialized = false;
        this.currentUser = null;
        this.userProfile = null;
        this.isOnline = true;
        this.authListeners = [];
        
        // Initialize auth state
        this.init();
    }
    
    async init() {
        try {
            console.log('🚀 Initializing Firebase Auth Manager...');
            
            // Check if Firebase is loaded
            if (typeof firebase === 'undefined') {
                console.warn('⚠️ Firebase SDK not loaded - will use local storage only');
                this.setupOfflineMode();
                return;
            }
            
            // Initialize Firebase services
            this.auth = firebase.auth();
            this.db = firebase.firestore();
            this.storage = firebase.storage();
            
            console.log('✅ Firebase services loaded');
            
            // Set up network monitoring
            this.setupNetworkMonitoring();
            
            // Set up auth state listener with retry logic
            this.setupAuthStateListener();
            
            this.isInitialized = true;
            console.log('✅ Firebase Auth Manager initialized successfully');
            
            // Try to get current user immediately
            const currentUser = this.auth.currentUser;
            if (currentUser) {
                console.log('👤 Found existing user session:', currentUser.email);
                await this.getOrCreateUserProfile(currentUser);
                this.dispatchAuthStateChange(true);
            }
            
        } catch (error) {
            console.error('❌ Error initializing Firebase Auth Manager:', error);
            this.setupOfflineMode();
        }
    }
    
    setupOfflineMode() {
        console.log('📴 Setting up offline mode');
        this.isInitialized = false;
        this.isOnline = false;
        
        // Check for existing local user
        const localUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
        if (localUser && localUser.isLoggedIn) {
            this.currentUser = { 
                email: localUser.email,
                uid: 'local_' + localUser.email.replace(/[^a-zA-Z0-9]/g, '_'),
                displayName: localUser.displayName || localUser.email.split('@')[0]
            };
            this.userProfile = localUser;
            console.log('👤 Using local user:', localUser.email);
        }
    }
    
    setupNetworkMonitoring() {
        // Monitor online/offline status
        window.addEventListener('online', () => {
            console.log('🌐 App is online');
            this.isOnline = true;
            this.dispatchNetworkStatusChange(true);
        });
        
        window.addEventListener('offline', () => {
            console.log('📴 App is offline');
            this.isOnline = false;
            this.dispatchNetworkStatusChange(false);
        });
        
        // Initial check
        this.isOnline = navigator.onLine;
    }
    
    setupAuthStateListener() {
    // Set up auth state listener with better error handling
    this.auth.onAuthStateChanged(async (user) => {
        try {
            console.log('🔄 Auth state change detected:', user ? 'User present' : 'No user');
            
            if (user) {
                console.log('👤 User details:', {
                    email: user.email,
                    uid: user.uid,
                    displayName: user.displayName,
                    emailVerified: user.emailVerified
                });
                
                this.currentUser = user;
                
                try {
                    await this.getOrCreateUserProfile(user);
                    console.log('✅ User profile processed successfully');
                } catch (profileError) {
                    console.warn('⚠️ Could not process user profile:', profileError);
                    
                    // Create basic profile from auth data
                    this.userProfile = {
                        email: user.email,
                        displayName: user.displayName || user.email.split('@')[0],
                        role: 'user',
                        createdAt: new Date().toISOString(),
                        lastLogin: new Date().toISOString()
                    };
                    
                    // Save to localStorage as backup
                    localStorage.setItem(`user_profile_${user.email}`, JSON.stringify(this.userProfile));
                }
                
                // Save to localStorage as backup
                localStorage.setItem('currentUser', JSON.stringify({
                    email: user.email,
                    displayName: user.displayName || user.email.split('@')[0],
                    isLoggedIn: true,
                    uid: user.uid,
                    lastLogin: new Date().toISOString(),
                    source: 'firebase'
                }));
                
                this.dispatchAuthStateChange(true);
                
            } else {
                console.log('👤 User logged out');
                this.currentUser = null;
                this.userProfile = null;
                
                // Clear localStorage
                localStorage.removeItem('currentUser');
                
                this.dispatchAuthStateChange(false);
            }
        } catch (error) {
            console.error('❌ CRITICAL ERROR in auth state change listener:', {
                error: error.message,
                code: error.code,
                stack: error.stack
            });
            
            // Fallback to check localStorage
            try {
                const localUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
                if (localUser && localUser.isLoggedIn) {
                    console.log('🔄 Falling back to local user session');
                    this.currentUser = {
                        email: localUser.email,
                        uid: localUser.uid || 'local_' + localUser.email.replace(/[^a-zA-Z0-9]/g, '_'),
                        displayName: localUser.displayName
                    };
                    this.userProfile = localUser;
                    this.dispatchAuthStateChange(true);
                }
            } catch (localError) {
                console.error('❌ Fallback also failed:', localError);
            }
        }
    }, (error) => {
        console.error('❌ Auth state listener setup error:', {
            error: error.message,
            code: error.code,
            stack: error.stack
        });
    });
}
    
    async getOrCreateUserProfile(user) {
    try {
        console.log('📄 Processing user profile for:', user.email);
        
        // Check if we can access Firestore
        if (!this.db) {
            console.log('📴 Firestore not available, using localStorage');
            throw new Error('Firestore not available');
        }
        
        // Check if user object is valid
        if (!user || !user.uid) {
            throw new Error('Invalid user object');
        }
        
        let userDoc;
        try {
            userDoc = await this.db.collection('users').doc(user.uid).get();
            console.log('📄 Firestore access successful');
        } catch (firestoreError) {
            console.warn('⚠️ Firestore access failed:', firestoreError.message);
            throw firestoreError;
        }
        
        if (userDoc.exists) {
            this.userProfile = userDoc.data();
            console.log('📄 User profile loaded from Firestore:', this.userProfile);
            
            // Update last login
            try {
                await this.db.collection('users').doc(user.uid).update({
                    lastLogin: new Date().toISOString()
                });
            } catch (updateError) {
                console.warn('⚠️ Could not update last login:', updateError);
            }
            
        } else {
            // Create new user profile
            this.userProfile = {
                email: user.email,
                displayName: user.displayName || user.email.split('@')[0],
                createdAt: new Date().toISOString(),
                role: 'user',
                lastLogin: new Date().toISOString(),
                uid: user.uid
            };
            
            console.log('🆕 Creating new user profile:', this.userProfile);
            
            try {
                await this.db.collection('users').doc(user.uid).set(this.userProfile, { merge: true });
                console.log('✅ New user profile created in Firestore');
            } catch (createError) {
                console.warn('⚠️ Could not create Firestore profile:', createError);
                // Continue anyway - we'll use local storage
            }
        }
        
        // Always save to localStorage as backup
        localStorage.setItem(`user_profile_${user.email}`, JSON.stringify(this.userProfile));
        
    } catch (error) {
        console.warn('⚠️ Could not access Firestore for user profile:', error);
        
        // Fallback to localStorage
        const localProfile = JSON.parse(localStorage.getItem(`user_profile_${user.email}`) || 'null');
        
        if (localProfile) {
            this.userProfile = localProfile;
            console.log('📄 User profile loaded from localStorage');
        } else {
            // Create minimal profile
            this.userProfile = {
                email: user.email,
                displayName: user.displayName || user.email.split('@')[0],
                createdAt: new Date().toISOString(),
                role: 'user',
                lastLogin: new Date().toISOString(),
                uid: user.uid
            };
            
            // Save to localStorage
            localStorage.setItem(`user_profile_${user.email}`, JSON.stringify(this.userProfile));
            console.log('✅ New user profile created in localStorage');
        }
        
        throw error; // Re-throw to indicate fallback was used
    }
}
    
    async login(email, password) {
        try {
            console.log('🔐 Attempting login for:', email);
            
            // Validation
            if (!email || !password) {
                throw new Error('Email and password are required');
            }
            
            // Try Firebase login first if available
            if (this.auth && this.isOnline) {
                try {
                    const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
                    console.log('✅ Firebase login successful');
                    
                    // Return success immediately (auth listener will handle the rest)
                    return {
                        success: true,
                        user: userCredential.user,
                        source: 'firebase'
                    };
                    
                } catch (firebaseError) {
                    console.warn('⚠️ Firebase login failed:', firebaseError.code, firebaseError.message);
                    
                    // Check if it's a permission error
                    if (firebaseError.code === 'permission-denied') {
                        console.log('🔄 Trying local login due to permission error');
                        return await this.localLogin(email, password);
                    }
                    
                    // For other Firebase errors, try local login as fallback
                    if (firebaseError.code === 'auth/network-request-failed' || 
                        firebaseError.code === 'auth/internal-error') {
                        console.log('🔄 Network error, trying local login');
                        return await this.localLogin(email, password);
                    }
                    
                    // For other auth errors, return Firebase error
                    throw firebaseError;
                }
            } else {
                // Firebase not available, use local login
                console.log('📴 Firebase not available, using local login');
                return await this.localLogin(email, password);
            }
            
        } catch (error) {
            console.error('❌ Login error:', error.code || '', error.message);
            
            // Format error message
            let errorMessage = 'Login failed';
            switch (error.code) {
                case 'auth/invalid-email':
                    errorMessage = 'Invalid email address';
                    break;
                case 'auth/user-disabled':
                    errorMessage = 'This account has been disabled';
                    break;
                case 'auth/user-not-found':
                    errorMessage = 'No account found with this email';
                    break;
                case 'auth/wrong-password':
                    errorMessage = 'Incorrect password';
                    break;
                case 'auth/invalid-login-credentials':
                    errorMessage = 'Invalid login credentials';
                    break;
                case 'auth/too-many-requests':
                    errorMessage = 'Too many failed attempts. Please try again later';
                    break;
                case 'auth/network-request-failed':
                    errorMessage = 'Network error. Please check your connection';
                    break;
                case 'permission-denied':
                    errorMessage = 'Database permission denied';
                    break;
                default:
                    errorMessage = error.message || 'Login failed';
            }
            
            return {
                success: false,
                error: errorMessage,
                code: error.code
            };
        }
    }
    
    async localLogin(email, password) {
        console.log('💾 Attempting local login for:', email);
        
        const allowedUsers = {
            'ami.smaitnh.2.0@gmail.com': '<!AMI 2.0>',
            'mps.smaitnh.2.0@gmail.com': 'MPS2',
            'osis.smaitnh.2.0@gmail.com': 'OSIS',
            'da.smaitnh.2.0@gmail.com': 'DA2'
        };
        
        // Check if email is authorized
        if (!allowedUsers[email]) {
            return {
                success: false,
                error: 'Email not authorized',
                source: 'local'
            };
        }
        
        // Check password
        if (password !== allowedUsers[email]) {
            return {
                success: false,
                error: 'Incorrect password',
                source: 'local'
            };
        }
        
        // Create local user session
        const localUser = {
            email: email,
            displayName: email.split('@')[0].replace(/\./g, ' ').replace('advanced ', ''),
            isLoggedIn: true,
            role: email.split('.')[1].toUpperCase(),
            lastLogin: new Date().toISOString()
        };
        
        // Save to localStorage
        localStorage.setItem('currentUser', JSON.stringify(localUser));
        
        // Set current user
        this.currentUser = {
            email: email,
            uid: 'local_' + email.replace(/[^a-zA-Z0-9]/g, '_'),
            displayName: email.split('@')[0].replace(/\./g, ' ').replace('advanced ', '')
        };
        
        this.userProfile = localUser;
        
        console.log('✅ Local login successful');
        
        // Dispatch auth state change
        this.dispatchAuthStateChange(true);
        
        return {
            success: true,
            user: this.currentUser,
            source: 'local'
        };
    }
    
    async logout() {
        try {
            // Clear local data first
            this.currentUser = null;
            this.userProfile = null;
            localStorage.removeItem('currentUser');
            
            // Try Firebase logout if available
            if (this.auth && this.isOnline) {
                await this.auth.signOut();
                console.log('✅ Firebase logout successful');
            } else {
                console.log('📴 Local logout only (Firebase not available)');
            }
            
            // Dispatch auth state change
            this.dispatchAuthStateChange(false);
            
            return {
                success: true,
                message: 'Logged out successfully'
            };
            
        } catch (error) {
            console.error('❌ Logout error:', error);
            
            // Even if Firebase logout fails, clear local data
            this.currentUser = null;
            this.userProfile = null;
            localStorage.removeItem('currentUser');
            this.dispatchAuthStateChange(false);
            
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async register(email, password, displayName) {
        try {
            console.log('📝 Attempting registration for:', email);
            
            if (!email || !password) {
                throw new Error('Email and password are required');
            }
            
            // Only allow registration if Firebase is available
            if (!this.auth || !this.isOnline) {
                throw new Error('Registration not available in offline mode');
            }
            
            // Create user with email and password
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
            
            // Update display name
            if (displayName) {
                await userCredential.user.updateProfile({
                    displayName: displayName
                });
            }
            
            // Create user profile in Firestore
            const userProfile = {
                email: email,
                displayName: displayName || email.split('@')[0],
                createdAt: new Date().toISOString(),
                role: 'user',
                lastLogin: new Date().toISOString()
            };
            
            try {
                await this.db.collection('users').doc(userCredential.user.uid).set(userProfile);
                console.log('✅ User profile created in Firestore');
            } catch (dbError) {
                console.warn('⚠️ Could not create Firestore profile:', dbError);
                // Continue anyway - auth was successful
            }
            
            return {
                success: true,
                user: userCredential.user
            };
            
        } catch (error) {
            console.error('❌ Registration error:', error.code, error.message);
            
            let errorMessage = 'Registration failed';
            switch (error.code) {
                case 'auth/email-already-in-use':
                    errorMessage = 'Email already in use';
                    break;
                case 'auth/invalid-email':
                    errorMessage = 'Invalid email address';
                    break;
                case 'auth/operation-not-allowed':
                    errorMessage = 'Email/password accounts are not enabled';
                    break;
                case 'auth/weak-password':
                    errorMessage = 'Password is too weak';
                    break;
                case 'permission-denied':
                    errorMessage = 'Database permission denied';
                    break;
                default:
                    errorMessage = error.message || 'Registration failed';
            }
            
            return {
                success: false,
                error: errorMessage
            };
        }
    }
    
    isLoggedIn() {
        // Check both Firebase and local session
        if (this.currentUser) {
            return true;
        }
        
        // Check localStorage
        const localUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
        return localUser !== null && localUser.isLoggedIn === true;
    }
    
    getUserProfile() {
        if (this.userProfile) {
            return this.userProfile;
        }
        
        // Check localStorage
        if (this.currentUser && this.currentUser.email) {
            const localProfile = JSON.parse(localStorage.getItem(`user_profile_${this.currentUser.email}`) || 'null');
            return localProfile;
        }
        
        return null;
    }
    
    getCurrentUser() {
        return this.currentUser;
    }
    
    getUserId() {
        if (this.currentUser) {
            return this.currentUser.uid;
        }
        
        const localUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
        return localUser ? 'local_' + localUser.email.replace(/[^a-zA-Z0-9]/g, '_') : null;
    }
    
    getUserEmail() {
        if (this.currentUser) {
            return this.currentUser.email;
        }
        
        const localUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
        return localUser ? localUser.email : null;
    }
    
    addAuthListener(callback) {
        this.authListeners.push(callback);
    }
    
    removeAuthListener(callback) {
        const index = this.authListeners.indexOf(callback);
        if (index > -1) {
            this.authListeners.splice(index, 1);
        }
    }
    
    addNetworkListener(callback) {
        window.addEventListener('online', () => callback(true));
        window.addEventListener('offline', () => callback(false));
    }
    
    dispatchAuthStateChange(isLoggedIn) {
        const event = new CustomEvent('authStateChanged', {
            detail: {
                isLoggedIn: isLoggedIn,
                user: this.currentUser,
                profile: this.userProfile,
                source: this.currentUser && this.currentUser.uid.startsWith('local_') ? 'local' : 'firebase'
            }
        });
        
        // Dispatch global event
        window.dispatchEvent(event);
        
        // Notify registered listeners
        this.authListeners.forEach(callback => {
            try {
                callback(isLoggedIn, this.currentUser, this.userProfile);
            } catch (error) {
                console.error('Error in auth listener:', error);
            }
        });
    }
    
    dispatchNetworkStatusChange(isOnline) {
        const event = new CustomEvent('networkStatusChanged', {
            detail: {
                isOnline: isOnline
            }
        });
        window.dispatchEvent(event);
    }
    
    // Utility methods for admin users
    isAdmin() {
        const profile = this.getUserProfile();
        return profile && profile.role === 'admin';
    }
    
    hasPermission(permission) {
        const profile = this.getUserProfile();
        if (!profile) return false;
        
        // Check permissions based on role
        switch (profile.role) {
            case 'admin':
                return true; // Admins have all permissions
            case 'editor':
                return ['read', 'write', 'edit'].includes(permission);
            case 'viewer':
                return permission === 'read';
            default:
                return false;
        }
    }
    
    // Password reset
    async resetPassword(email) {
        try {
            if (!this.auth || !this.isOnline) {
                throw new Error('Password reset not available in offline mode');
            }
            
            await this.auth.sendPasswordResetEmail(email);
            
            return {
                success: true,
                message: 'Password reset email sent'
            };
            
        } catch (error) {
            console.error('❌ Password reset error:', error);
            
            let errorMessage = 'Password reset failed';
            switch (error.code) {
                case 'auth/user-not-found':
                    errorMessage = 'No account found with this email';
                    break;
                case 'auth/invalid-email':
                    errorMessage = 'Invalid email address';
                    break;
                default:
                    errorMessage = error.message || 'Password reset failed';
            }
            
            return {
                success: false,
                error: errorMessage
            };
        }
    }
    
    // Update user profile
    async updateProfile(updates) {
        try {
            if (!this.currentUser) {
                throw new Error('No user logged in');
            }
            
            // Update local profile
            if (!this.userProfile) {
                this.userProfile = {};
            }
            
            Object.assign(this.userProfile, updates);
            this.userProfile.updatedAt = new Date().toISOString();
            
            // Try to update Firebase if available
            if (this.db && this.isOnline && !this.currentUser.uid.startsWith('local_')) {
                await this.db.collection('users').doc(this.currentUser.uid).update(updates);
                console.log('✅ User profile updated in Firestore');
            }
            
            // Save to localStorage as backup
            if (this.currentUser.email) {
                localStorage.setItem(`user_profile_${this.currentUser.email}`, JSON.stringify(this.userProfile));
                console.log('✅ User profile updated in localStorage');
            }
            
            // Dispatch update event
            this.dispatchAuthStateChange(true);
            
            return {
                success: true,
                profile: this.userProfile
            };
            
        } catch (error) {
            console.error('❌ Profile update error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // Clean up
    destroy() {
        this.authListeners = [];
        this.currentUser = null;
        this.userProfile = null;
        console.log('🧹 Firebase Auth Manager destroyed');
    }
}

// Create global instance
window.firebaseAuth = new FirebaseAuthManager();

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 DOM loaded - Starting Firebase Auth...');
    
    // Wait a bit for Firebase SDK to load
    setTimeout(async () => {
        try {
            // If Firebase is already loaded, initialize auth
            if (typeof firebase !== 'undefined') {
                await window.firebaseAuth.init();
                
                // Check if user is already logged in locally
                if (!window.firebaseAuth.isLoggedIn()) {
                    const localUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
                    if (localUser && localUser.isLoggedIn) {
                        console.log('🔄 Restoring local user session');
                        window.firebaseAuth.currentUser = {
                            email: localUser.email,
                            uid: 'local_' + localUser.email.replace(/[^a-zA-Z0-9]/g, '_'),
                            displayName: localUser.displayName
                        };
                        window.firebaseAuth.userProfile = localUser;
                        window.firebaseAuth.dispatchAuthStateChange(true);
                    }
                }
                
                console.log('✅ Firebase Auth ready');
            } else {
                console.log('⚠️ Firebase SDK not loaded - running in offline mode');
                window.firebaseAuth.setupOfflineMode();
            }
        } catch (error) {
            console.error('❌ Error during Firebase Auth initialization:', error);
        }
    }, 1000);
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FirebaseAuthManager;
}