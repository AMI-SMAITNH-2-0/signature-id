// ========== FIREBASE REAL-TIME SYNC LISTENER ==========
class FirebaseSyncListener {
    constructor() {
        this.isListening = false;
        this.unsubscribers = {};
        this.syncInterval = null;
        this.lastSyncTimes = {};
        this.init();
    }
    
    async init() {
        console.log('🔄 Initializing Firebase Sync Listener...');
        
        // Wait for Firebase to be ready
        await this.waitForFirebase();
        
        // Start listening for changes
        this.startListening();
        
        // Start periodic sync
        this.startPeriodicSync();
        
        console.log('✅ Firebase Sync Listener initialized');
    }
    
    async waitForFirebase() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 30; // 30 seconds max
            
            const check = () => {
                attempts++;
                
                if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
                    console.log('✅ Firebase ready for sync listener');
                    resolve();
                } else if (attempts >= maxAttempts) {
                    console.warn('⚠️ Firebase not loaded, sync listener disabled');
                    resolve();
                } else {
                    setTimeout(check, 1000);
                }
            };
            
            check();
        });
    }
    
    startListening() {
        if (typeof firebase === 'undefined' || !firebase.apps.length) {
            console.warn('📴 Firebase not available for real-time sync');
            return;
        }
        
        // Listen for division changes
        this.listenForDivisionChanges();
        
        // Listen for all data types
        this.listenForAllData();
        
        this.isListening = true;
        console.log('👂 Listening for Firebase changes...');
    }
    
    listenForDivisionChanges() {
        // Get all possible divisions and genders
        const divisions = ['Khusus', 'Sekum', 'Bendum', 'PSDM', 'Syidak', 'DKMA', 'JWR'];
        const genders = ['Ikhwan', 'Akhwat'];
        
        for (const division of divisions) {
            for (const gender of genders) {
                this.listenForDivisionData(division, gender);
            }
        }
    }
    
    listenForDivisionData(division, gender) {
        try {
            const db = firebase.firestore();
            
            // Listen for attendance names
            this.listenToCollection(
                'attendance_names',
                { division, gender },
                (data) => this.handleNamesUpdate(division, gender, data)
            );
            
            // Listen for titles
            this.listenToCollection(
                'attendance_titles',
                { division, gender },
                (data) => this.handleTitlesUpdate(division, gender, data)
            );
            
            // Listen for info
            this.listenToCollection(
                'attendance_info',
                { division, gender },
                (data) => this.handleInfoUpdate(division, gender, data)
            );
            
            // Listen for dates
            this.listenToCollection(
                'attendance_dates',
                { division, gender },
                (data) => this.handleDateUpdate(division, gender, data)
            );
            
            // Listen for signatures (individual documents)
            this.listenToSignatures(division, gender);
            
        } catch (error) {
            console.error(`❌ Error listening for ${division}_${gender} data:`, error);
        }
    }
    
    listenToCollection(collectionName, filters, callback) {
        try {
            const db = firebase.firestore();
            let query = db.collection(collectionName);
            
            // Apply filters
            Object.entries(filters).forEach(([key, value]) => {
                query = query.where(key, '==', value);
            });
            
            const unsubscribe = query.onSnapshot(
                (snapshot) => {
                    if (!snapshot.empty) {
                        const data = snapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data()
                        }));
                        
                        // Get the most recent document
                        const latestDoc = data.sort((a, b) => 
                            new Date(b.updatedAt?.toDate?.() || b.updatedAt || 0) - 
                            new Date(a.updatedAt?.toDate?.() || a.updatedAt || 0)
                        )[0];
                        
                        if (latestDoc) {
                            callback(latestDoc);
                        }
                    }
                },
                (error) => {
                    console.error(`❌ Error listening to ${collectionName}:`, error);
                }
            );
            
            // Store unsubscribe function
            const key = `${collectionName}_${filters.division}_${filters.gender}`;
            this.unsubscribers[key] = unsubscribe;
            
        } catch (error) {
            console.error(`❌ Error setting up listener for ${collectionName}:`, error);
        }
    }
    
    listenToSignatures(division, gender) {
        try {
            const db = firebase.firestore();
            
            // Listen to signatures for this division/gender
            const unsubscribe = db.collection('attendance_data')
                .where('division', '==', division)
                .where('gender', '==', gender)
                .onSnapshot(
                    (snapshot) => {
                        if (!snapshot.empty) {
                            const signatures = {};
                            
                            snapshot.docs.forEach(doc => {
                                const data = doc.data();
                                const name = data.name;
                                
                                if (name) {
                                    signatures[name] = {
                                        image: data.signatureDataUrl || '',
                                        keterangan: data.keterangan || ''
                                    };
                                }
                            });
                            
                            this.handleSignaturesUpdate(division, gender, signatures);
                        }
                    },
                    (error) => {
                        console.error(`❌ Error listening to signatures for ${division}_${gender}:`, error);
                    }
                );
            
            // Store unsubscribe function
            const key = `signatures_${division}_${gender}`;
            this.unsubscribers[key] = unsubscribe;
            
        } catch (error) {
            console.error(`❌ Error setting up signatures listener:`, error);
        }
    }
    
    handleNamesUpdate(division, gender, data) {
        console.log(`📥 Received names update for ${division}_${gender}:`, data.names?.length || 0, 'names');
        
        if (data && data.names) {
            const key = `${division}_${gender}_attendanceNames`;
            
            // Check if data is newer than local
            const localData = JSON.parse(localStorage.getItem(key) || '[]');
            const remoteTime = new Date(data.updatedAt?.toDate?.() || data.updatedAt || 0).getTime();
            const localTime = this.lastSyncTimes[key] || 0;
            
            if (remoteTime > localTime) {
                console.log(`🔄 Updating names from Firebase (newer data)`);
                localStorage.setItem(key, JSON.stringify(data.names));
                
                // Update last sync time
                this.lastSyncTimes[key] = remoteTime;
                
                // If this is the current division/gender, update UI
                const currentDivision = localStorage.getItem('currentDivision') || 'Khusus';
                const currentGender = localStorage.getItem('currentGender') || 'Ikhwan';
                
                if (division === currentDivision && gender === currentGender) {
                    window.dispatchEvent(new CustomEvent('firebaseNamesUpdate', { 
                        detail: { names: data.names, division, gender } 
                    }));
                }
            }
        }
    }
    
    handleTitlesUpdate(division, gender, data) {
        console.log(`📥 Received titles update for ${division}_${gender}`);
        
        if (data && data.titles) {
            const key = `${division}_${gender}_reportTitles`;
            
            // Check if data is newer than local
            const localData = JSON.parse(localStorage.getItem(key) || '[]');
            const remoteTime = new Date(data.updatedAt?.toDate?.() || data.updatedAt || 0).getTime();
            const localTime = this.lastSyncTimes[key] || 0;
            
            if (remoteTime > localTime) {
                console.log(`🔄 Updating titles from Firebase`);
                localStorage.setItem(key, JSON.stringify(data.titles));
                
                // Update last sync time
                this.lastSyncTimes[key] = remoteTime;
                
                // If this is the current division/gender, update UI
                const currentDivision = localStorage.getItem('currentDivision') || 'Khusus';
                const currentGender = localStorage.getItem('currentGender') || 'Ikhwan';
                
                if (division === currentDivision && gender === currentGender) {
                    window.dispatchEvent(new CustomEvent('firebaseTitlesUpdate', { 
                        detail: { titles: data.titles, division, gender } 
                    }));
                }
            }
        }
    }
    
    handleInfoUpdate(division, gender, data) {
        console.log(`📥 Received info update for ${division}_${gender}`);
        
        const key = `${division}_${gender}_attendanceInfo`;
        
        // Check if data is newer than local
        const localData = JSON.parse(localStorage.getItem(key) || '{}');
        const remoteTime = new Date(data.updatedAt?.toDate?.() || data.updatedAt || 0).getTime();
        const localTime = this.lastSyncTimes[key] || 0;
        
        if (remoteTime > localTime) {
            console.log(`🔄 Updating info from Firebase`);
            
            // Remove metadata fields
            const { userId, userEmail, updatedAt, ...infoData } = data;
            localStorage.setItem(key, JSON.stringify(infoData));
            
            // Update last sync time
            this.lastSyncTimes[key] = remoteTime;
            
            // If this is the current division/gender, update UI
            const currentDivision = localStorage.getItem('currentDivision') || 'Khusus';
            const currentGender = localStorage.getItem('currentGender') || 'Ikhwan';
            
            if (division === currentDivision && gender === currentGender) {
                window.dispatchEvent(new CustomEvent('firebaseInfoUpdate', { 
                    detail: { info: infoData, division, gender } 
                }));
            }
        }
    }
    
    handleDateUpdate(division, gender, data) {
        console.log(`📥 Received date update for ${division}_${gender}`);
        
        if (data && data.date) {
            const key = `${division}_${gender}_tanggalPresensi`;
            
            // Check if data is newer than local
            const localData = localStorage.getItem(key) || '';
            const remoteTime = new Date(data.updatedAt?.toDate?.() || data.updatedAt || 0).getTime();
            const localTime = this.lastSyncTimes[key] || 0;
            
            if (remoteTime > localTime) {
                console.log(`🔄 Updating date from Firebase`);
                localStorage.setItem(key, data.date);
                
                // Update last sync time
                this.lastSyncTimes[key] = remoteTime;
                
                // If this is the current division/gender, update UI
                const currentDivision = localStorage.getItem('currentDivision') || 'Khusus';
                const currentGender = localStorage.getItem('currentGender') || 'Ikhwan';
                
                if (division === currentDivision && gender === currentGender) {
                    window.dispatchEvent(new CustomEvent('firebaseDateUpdate', { 
                        detail: { date: data.date, division, gender } 
                    }));
                }
            }
        }
    }
    
    handleSignaturesUpdate(division, gender, signatures) {
        console.log(`📥 Received signatures update for ${division}_${gender}:`, Object.keys(signatures).length, 'signatures');
        
        const key = `${division}_${gender}_spreadsheetData`;
        const currentTime = Date.now();
        
        // Get local signatures
        const localSignatures = JSON.parse(localStorage.getItem(key) || '{}');
        let hasChanges = false;
        
        // Merge remote signatures into local
        Object.entries(signatures).forEach(([name, data]) => {
            if (name && name.trim()) {
                const localSignature = localSignatures[name];
                
                // If remote has newer data or local doesn't have this signature
                if (!localSignature || 
                    (data.image && !localSignature.image) || 
                    (data.keterangan && !localSignature.keterangan)) {
                    
                    localSignatures[name] = {
                        ...localSignatures[name],
                        ...data
                    };
                    hasChanges = true;
                }
            }
        });
        
        if (hasChanges) {
            console.log(`🔄 Updating signatures from Firebase`);
            localStorage.setItem(key, JSON.stringify(localSignatures));
            
            // Update last sync time
            this.lastSyncTimes[key] = currentTime;
            
            // If this is the current division/gender, update UI
            const currentDivision = localStorage.getItem('currentDivision') || 'Khusus';
            const currentGender = localStorage.getItem('currentGender') || 'Ikhwan';
            
            if (division === currentDivision && gender === currentGender) {
                window.dispatchEvent(new CustomEvent('firebaseSignaturesUpdate', { 
                    detail: { signatures: localSignatures, division, gender } 
                }));
            }
        }
    }
    
    startPeriodicSync() {
        // Sync every 10 seconds
        this.syncInterval = setInterval(() => {
            if (navigator.onLine) {
                this.pullLatestData();
            }
        }, 10000); // 10 seconds
        
        // Also sync immediately on page focus
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && navigator.onLine) {
                setTimeout(() => this.pullLatestData(), 1000);
            }
        });
    }
    
    async pullLatestData() {
        console.log('🔍 Pulling latest data from Firebase...');
        
        const currentDivision = localStorage.getItem('currentDivision') || 'Khusus';
        const currentGender = localStorage.getItem('currentGender') || 'Ikhwan';
        
        try {
            await this.pullDivisionData(currentDivision, currentGender);
        } catch (error) {
            console.error('❌ Error pulling latest data:', error);
        }
    }
    
    async pullDivisionData(division, gender) {
        if (typeof firebase === 'undefined' || !firebase.apps.length) {
            return;
        }
        
        const db = firebase.firestore();
        
        try {
            // Pull names
            const namesQuery = await db.collection('attendance_names')
                .where('division', '==', division)
                .where('gender', '==', gender)
                .orderBy('updatedAt', 'desc')
                .limit(1)
                .get();
            
            if (!namesQuery.empty) {
                const namesData = namesQuery.docs[0].data();
                this.handleNamesUpdate(division, gender, namesData);
            }
            
            // Pull titles
            const titlesQuery = await db.collection('attendance_titles')
                .where('division', '==', division)
                .where('gender', '==', gender)
                .orderBy('updatedAt', 'desc')
                .limit(1)
                .get();
            
            if (!titlesQuery.empty) {
                const titlesData = titlesQuery.docs[0].data();
                this.handleTitlesUpdate(division, gender, titlesData);
            }
            
            // Pull info
            const infoQuery = await db.collection('attendance_info')
                .where('division', '==', division)
                .where('gender', '==', gender)
                .orderBy('updatedAt', 'desc')
                .limit(1)
                .get();
            
            if (!infoQuery.empty) {
                const infoData = infoQuery.docs[0].data();
                this.handleInfoUpdate(division, gender, infoData);
            }
            
            // Pull date
            const dateQuery = await db.collection('attendance_dates')
                .where('division', '==', division)
                .where('gender', '==', gender)
                .orderBy('updatedAt', 'desc')
                .limit(1)
                .get();
            
            if (!dateQuery.empty) {
                const dateData = dateQuery.docs[0].data();
                this.handleDateUpdate(division, gender, dateData);
            }
            
            // Pull signatures
            const signaturesQuery = await db.collection('attendance_data')
                .where('division', '==', division)
                .where('gender', '==', gender)
                .get();
            
            if (!signaturesQuery.empty) {
                const signatures = {};
                signaturesQuery.docs.forEach(doc => {
                    const data = doc.data();
                    const name = data.name;
                    
                    if (name) {
                        signatures[name] = {
                            image: data.signatureDataUrl || '',
                            keterangan: data.keterangan || ''
                        };
                    }
                });
                
                this.handleSignaturesUpdate(division, gender, signatures);
            }
            
        } catch (error) {
            console.error(`❌ Error pulling data for ${division}_${gender}:`, error);
        }
    }
    
    stopListening() {
        // Unsubscribe all listeners
        Object.values(this.unsubscribers).forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        
        this.unsubscribers = {};
        
        // Clear interval
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        
        this.isListening = false;
        console.log('🛑 Stopped Firebase Sync Listener');
    }
    
    restart() {
        this.stopListening();
        this.init();
    }
}

// Create global instance
window.firebaseSyncListener = new FirebaseSyncListener();

// ========== AUTO-SYNC MANAGER ==========
class AutoSyncManager {
    constructor() {
        this.isSyncing = false;
        this.syncQueue = [];
        this.lastSyncTime = 0;
        this.syncInterval = 2000; // Sync every 2 seconds
        this.batchSize = 5; // Sync in batches of 5 items
        this.init();
    }
    
    init() {
        console.log('🔄 Initializing Auto-Sync Manager...');
        
        // Setup periodic sync
        this.startPeriodicSync();
        
        // Setup event listeners for data changes
        this.setupChangeListeners();
        
        // Setup network monitoring
        this.setupNetworkMonitoring();
        
        console.log('✅ Auto-Sync Manager initialized');
    }
    
    setupChangeListeners() {
        // Listen for various data change events
        window.addEventListener('namesUpdate', () => this.queueSync('names'));
        window.addEventListener('storageUpdate', () => this.queueSync('signatures'));
        window.addEventListener('titlesUpdated', () => this.queueSync('titles'));
        window.addEventListener('infoUpdated', () => this.queueSync('info'));
        window.addEventListener('signaturesUpdated', () => this.queueSync('signatures'));
        
        // Listen for localStorage changes (from other tabs)
        window.addEventListener('storage', (event) => {
            if (event.key && event.key.includes('_spreadsheetData')) {
                this.queueSync('signatures');
            } else if (event.key && event.key.includes('_attendanceNames')) {
                this.queueSync('names');
            } else if (event.key && event.key.includes('_reportTitles')) {
                this.queueSync('titles');
            } else if (event.key && event.key.includes('_attendanceInfo')) {
                this.queueSync('info');
            } else if (event.key && event.key.includes('_tanggalPresensi')) {
                this.queueSync('date');
            }
        });
    }
    
    setupNetworkMonitoring() {
        window.addEventListener('online', () => {
            console.log('🌐 Network is back online - triggering sync');
            this.triggerSync();
        });
        
        window.addEventListener('offline', () => {
            console.log('📴 Network is offline - pausing sync');
        });
    }
    
    startPeriodicSync() {
        // Sync every 30 seconds when online
        setInterval(() => {
            if (navigator.onLine && !this.isSyncing && this.syncQueue.length > 0) {
                this.triggerSync();
            }
        }, 30000);
    }
    
    queueSync(dataType) {
        // Avoid duplicate entries
        if (!this.syncQueue.includes(dataType)) {
            this.syncQueue.push(dataType);
            console.log(`📋 Queued sync for: ${dataType}`);
            
            // Trigger sync after a short delay (debounce)
            clearTimeout(this.syncTimeout);
            this.syncTimeout = setTimeout(() => this.triggerSync(), 1000);
        }
    }
    
    async triggerSync() {
        if (this.isSyncing || !navigator.onLine) {
            return;
        }
        
        this.isSyncing = true;
        console.log('🔄 Starting auto-sync...');
        
        try {
            // Process all queued sync types
            while (this.syncQueue.length > 0) {
                const dataType = this.syncQueue.shift();
                await this.syncDataType(dataType);
            }
            
            // Always sync current data on trigger
            await this.syncAllCurrentData();
            
            this.lastSyncTime = Date.now();
            console.log('✅ Auto-sync completed');
            
        } catch (error) {
            console.error('❌ Auto-sync error:', error);
        } finally {
            this.isSyncing = false;
        }
    }
    
    async syncDataType(dataType) {
        console.log(`🔄 Syncing ${dataType}...`);
        
        const currentDivision = localStorage.getItem('currentDivision') || 'Khusus';
        const currentGender = localStorage.getItem('currentGender') || 'Ikhwan';
        
        switch (dataType) {
            case 'names':
                await this.syncNames(currentDivision, currentGender);
                break;
            case 'signatures':
                await this.syncSignatures(currentDivision, currentGender);
                break;
            case 'titles':
                await this.syncTitles(currentDivision, currentGender);
                break;
            case 'info':
                await this.syncInfo(currentDivision, currentGender);
                break;
            case 'date':
                await this.syncDate(currentDivision, currentGender);
                break;
        }
    }
    
    async syncAllCurrentData() {
        const currentDivision = localStorage.getItem('currentDivision') || 'Khusus';
        const currentGender = localStorage.getItem('currentGender') || 'Ikhwan';
        
        // Sync everything
        await Promise.all([
            this.syncNames(currentDivision, currentGender),
            this.syncTitles(currentDivision, currentGender),
            this.syncInfo(currentDivision, currentGender),
            this.syncDate(currentDivision, currentGender),
            this.syncSignatures(currentDivision, currentGender)
        ]);
    }
    
    
    
    async syncNames(currentDivision, currentGender) {
        try {
            const key = `${currentDivision}_${currentGender}_attendanceNames`;
            const names = JSON.parse(localStorage.getItem(key) || '[]');
            
            console.log(`📤 Syncing ${names.length} names...`);
            
            // Save names as a batch
            if (window.dbManager && window.dbManager.saveNames) {
                await window.dbManager.saveNames(names, currentDivision, currentGender);
            }
            
        } catch (error) {
            console.error('❌ Error syncing names:', error);
        }
    }
    
    async syncSignatures(currentDivision, currentGender) {
        try {
            const key = `${currentDivision}_${currentGender}_spreadsheetData`;
            const signatures = JSON.parse(localStorage.getItem(key) || '{}');
            const names = Object.keys(signatures);
            
            console.log(`📤 Syncing ${names.length} signatures...`);
            
            // Sync in batches to avoid rate limiting
            const batch = [];
            for (const name of names) {
                if (name.trim()) {
                    const signatureData = signatures[name];
                    batch.push({ name, ...signatureData });
                    
                    if (batch.length >= this.batchSize) {
                        await this.syncSignatureBatch(batch, currentDivision, currentGender);
                        batch.length = 0;
                    }
                }
            }
            
            // Sync remaining
            if (batch.length > 0) {
                await this.syncSignatureBatch(batch, currentDivision, currentGender);
            }
            
        } catch (error) {
            console.error('❌ Error syncing signatures:', error);
        }
    }
    
    async syncSignatureBatch(batch, currentDivision, currentGender) {
        for (const item of batch) {
            try {
                if (window.dbManager && window.dbManager.saveSignature) {
                    await window.dbManager.saveSignature(
                        item.name,
                        item.image || '',
                        item.keterangan || ''
                    );
                }
            } catch (error) {
                console.warn(`⚠️ Failed to sync signature for "${item.name}":`, error.message);
            }
        }
    }
    
    async syncTitles(currentDivision, currentGender) {
        try {
            const key = `${currentDivision}_${currentGender}_reportTitles`;
            const titles = JSON.parse(localStorage.getItem(key) || '[]');
            
            console.log(`📤 Syncing titles...`);
            
            if (window.dbManager && window.dbManager.saveTitles) {
                await window.dbManager.saveTitles(titles, currentDivision, currentGender);
            }
            
        } catch (error) {
            console.error('❌ Error syncing titles:', error);
        }
    }
    
    async syncInfo(currentDivision, currentGender) {
        try {
            const key = `${currentDivision}_${currentGender}_attendanceInfo`;
            const info = JSON.parse(localStorage.getItem(key) || '{}');
            
            console.log(`📤 Syncing info...`);
            
            if (window.dbManager && window.dbManager.saveInfo) {
                await window.dbManager.saveInfo(info, currentDivision, currentGender);
            }
            
        } catch (error) {
            console.error('❌ Error syncing info:', error);
        }
    }
    
    async syncDate(currentDivision, currentGender) {
        try {
            const key = `${currentDivision}_${currentGender}_tanggalPresensi`;
            const date = localStorage.getItem(key) || '';
            
            console.log(`📤 Syncing date...`);
            
            if (window.dbManager && window.dbManager.saveDate) {
                await window.dbManager.saveDate(date, currentDivision, currentGender);
            }
            
        } catch (error) {
            console.error('❌ Error syncing date:', error);
        }
    }
}

// Create global instance
window.autoSyncManager = new AutoSyncManager();

// firebase-db-debug.js - COMPLETE DEBUG VERSION
class FirebaseDBManager {
    constructor() {
        this.db = null;
        this.storage = null;
        this.isInitialized = false;
        this.debugLogs = [];
    }

    logDebug(message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, message, data };
        this.debugLogs.push(logEntry);
        console.log(`[${timestamp}] ${message}`, data || '');
    }

    getDebugLogs() {
        return this.debugLogs;
    }

    async initialize() {
        try {
            this.logDebug('🔄 Initializing Firebase DB...');
            
            // Check if Firebase SDK is loaded
            if (typeof firebase === 'undefined') {
                this.logDebug('❌ Firebase SDK not loaded - Check if firebase scripts are loaded');
                return false;
            }
            
            // List all Firebase apps
            this.logDebug('Firebase apps:', firebase.apps);
            
            if (!firebase.apps.length) {
                this.logDebug('❌ No Firebase apps initialized');
                return false;
            }
            
            // Get the default app
            const app = firebase.app();
            this.logDebug('✅ Using Firebase app:', app.name);
            
            // Initialize services
            this.db = firebase.firestore();
            this.storage = firebase.storage();
            
            // Test Firestore connection
            try {
                this.logDebug('🔧 Testing Firestore connection...');
                const testDocRef = this.db.collection('connection_tests').doc('web_app_test');
                await testDocRef.set({
                    test: true,
                    timestamp: new Date().toISOString(),
                    message: 'Test from web app',
                    appName: app.name
                }, { merge: true });
                this.logDebug('✅ Firestore connection test passed');
            } catch (testError) {
                this.logDebug('❌ Firestore connection test failed:', testError.message);
                console.error('Firestore error details:', testError);
            }
            
            // Test Storage connection
            try {
                this.logDebug('🔧 Testing Storage connection...');
                const storageRef = this.storage.ref('test.txt');
                await storageRef.putString('test file', 'raw');
                this.logDebug('✅ Storage connection test passed');
            } catch (storageError) {
                this.logDebug('❌ Storage connection test failed:', storageError.message);
            }
            
            this.isInitialized = true;
            this.logDebug('✅ Firebase DB initialized successfully');
            
            // Log current user if any
            if (firebase.auth().currentUser) {
                this.logDebug('👤 Current Firebase user:', {
                    uid: firebase.auth().currentUser.uid,
                    email: firebase.auth().currentUser.email
                });
            }
            
            return true;
        } catch (error) {
            this.logDebug('❌ Critical error initializing Firebase DB:', {
                error: error.message,
                code: error.code,
                stack: error.stack
            });
            return false;
        }
    }
    
    // Add these methods to your dbManager class
async saveTitles(titles, currentDivision, currentGender) {
    try {
        console.log('💾 Saving titles to Firebase...', titles);
        
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        if (typeof firebase === 'undefined' || !firebase.apps.length) {
            console.log('📴 Firebase not available');
            return { success: false, error: 'Firebase not available' };
        }
        
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) {
            console.log('👤 No Firebase user logged in');
            return { success: false, error: 'No user logged in' };
        }
        
        // Create document ID
        const docId = `${currentDivision}_${currentGender}_titles_${currentUser.uid}`;
        
        const titleData = {
            titles: titles,
            division: currentDivision,
            gender: currentGender,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await firebase.firestore()
            .collection('attendance_titles')
            .doc(docId)
            .set(titleData, { merge: true });
        
        console.log('✅ Titles saved to Firebase:', titles);
        return { success: true, docId: docId };
        
    } catch (error) {
        console.error('❌ Error saving titles:', error);
        return { success: false, error: error.message };
    }
}

async saveInfo(infoData, currentDivision, currentGender) {
    try {
        console.log('💾 Saving info to Firebase...', infoData);
        
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        if (typeof firebase === 'undefined' || !firebase.apps.length) {
            console.log('📴 Firebase not available');
            return { success: false, error: 'Firebase not available' };
        }
        
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) {
            console.log('👤 No Firebase user logged in');
            return { success: false, error: 'No user logged in' };
        }
        
        // Create document ID
        const docId = `${currentDivision}_${currentGender}_info_${currentUser.uid}`;
        
        const infoDocument = {
            ...infoData,
            division: currentDivision,
            gender: currentGender,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await firebase.firestore()
            .collection('attendance_info')
            .doc(docId)
            .set(infoDocument, { merge: true });
        
        console.log('✅ Info saved to Firebase:', infoData);
        return { success: true, docId: docId };
        
    } catch (error) {
        console.error('❌ Error saving info:', error);
        return { success: false, error: error.message };
    }
}

async saveDate(dateValue, currentDivision, currentGender) {
    try {
        console.log('💾 Saving date to Firebase...', dateValue);
        
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        if (typeof firebase === 'undefined' || !firebase.apps.length) {
            console.log('📴 Firebase not available');
            return { success: false, error: 'Firebase not available' };
        }
        
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) {
            console.log('👤 No Firebase user logged in');
            return { success: false, error: 'No user logged in' };
        }
        
        // Create document ID
        const docId = `${currentDivision}_${currentGender}_date_${currentUser.uid}`;
        
        const dateData = {
            date: dateValue,
            division: currentDivision,
            gender: currentGender,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await firebase.firestore()
            .collection('attendance_dates')
            .doc(docId)
            .set(dateData, { merge: true });
        
        console.log('✅ Date saved to Firebase:', dateValue);
        return { success: true, docId: docId };
        
    } catch (error) {
        console.error('❌ Error saving date:', error);
        return { success: false, error: error.message };
    }
}

    async saveSignature(name, signatureDataUrl = '', keterangan = '') {
        const saveId = Date.now();
        this.logDebug(`[${saveId}] 💾 START saveSignature for: "${name}"`);
        
        try {
            // Step 1: Check initialization
            if (!this.isInitialized) {
                this.logDebug(`[${saveId}] ❌ Firebase DB not initialized`);
                return { success: false, error: 'Firebase not initialized' };
            }
            
            // Step 2: Check Firebase auth
            const auth = firebase.auth();
            const currentUser = auth.currentUser;
            
            if (!currentUser) {
                this.logDebug(`[${saveId}] ❌ No Firebase user authenticated`);
                this.logDebug(`[${saveId}] Auth state:`, auth);
                return { success: false, error: 'User not authenticated' };
            }
            
            this.logDebug(`[${saveId}] 👤 Firebase user authenticated:`, {
                uid: currentUser.uid,
                email: currentUser.email,
                displayName: currentUser.displayName
            });
            
            // Step 3: Get user info
            const userId = currentUser.uid;
            const userEmail = currentUser.email;
            const currentDivision = localStorage.getItem('currentDivision') || 'Khusus';
            const currentGender = localStorage.getItem('currentGender') || 'Ikhwan';
            
            this.logDebug(`[${saveId}] 📋 Save details:`, {
                name: name,
                division: currentDivision,
                gender: currentGender,
                userId: userId,
                hasSignature: !!signatureDataUrl,
                keterangan: keterangan
            });
            
            // Step 4: Prepare data
            const signatureData = {
                name: name.trim(),
                division: currentDivision,
                gender: currentGender,
                keterangan: keterangan || '',
                userId: userId,
                userEmail: userEmail,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                localTimestamp: new Date().toISOString(),
                appVersion: '1.0.0'
            };
            
            // Step 5: Handle signature image
            let imageUrl = '';
            if (signatureDataUrl && signatureDataUrl.startsWith('data:image')) {
                try {
                    this.logDebug(`[${saveId}] 📤 Uploading signature image...`);
                    
                    // Convert data URL to blob
                    const blob = this.dataURLtoBlob(signatureDataUrl);
                    
                    // Create filename
                    const timestamp = Date.now();
                    const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
                    const fileName = `signature_${timestamp}_${safeName}.png`;
                    const storagePath = `signatures/${userId}/${currentDivision}/${currentGender}/${fileName}`;
                    
                    this.logDebug(`[${saveId}] Storage path: ${storagePath}`);
                    
                    // Upload to storage
                    const storageRef = this.storage.ref(storagePath);
                    const snapshot = await storageRef.put(blob, {
                        contentType: 'image/png',
                        customMetadata: {
                            userName: name,
                            division: currentDivision,
                            gender: currentGender,
                            userId: userId,
                            uploadTime: new Date().toISOString()
                        }
                    });
                    
                    // Get download URL
                    imageUrl = await snapshot.ref.getDownloadURL();
                    signatureData.signatureUrl = imageUrl;
                    signatureData.hasImage = true;
                    signatureData.imageSize = blob.size;
                    
                    this.logDebug(`[${saveId}] ✅ Image uploaded:`, {
                        url: imageUrl,
                        size: blob.size
                    });
                } catch (storageError) {
                    this.logDebug(`[${saveId}] ❌ Image upload error:`, storageError.message);
                    signatureData.imageError = storageError.message;
                    signatureData.hasImage = false;
                }
            } else {
                signatureData.hasImage = false;
                this.logDebug(`[${saveId}] ⚠️ No signature image to upload`);
            }
            
            // Step 6: Create document ID
            const docId = `${currentDivision}_${currentGender}_${name.replace(/\s+/g, '_')}_${userId}`;
            this.logDebug(`[${saveId}] 📝 Document ID: ${docId}`);
            
            // Step 7: Save to Firestore
            this.logDebug(`[${saveId}] 💾 Saving to Firestore...`);
            
            const docRef = this.db.collection('attendance_data').doc(docId);
            
            // Try to get existing document first
            const existingDoc = await docRef.get();
            if (existingDoc.exists) {
                this.logDebug(`[${saveId}] 📄 Document exists, updating...`);
            } else {
                this.logDebug(`[${saveId}] 📄 Creating new document...`);
            }
            
            // Save/update the document
            await docRef.set(signatureData, { merge: true });
            
            // Verify the save
            const savedDoc = await docRef.get();
            
            this.logDebug(`[${saveId}] ✅ SAVE SUCCESSFUL!`, {
                documentId: docId,
                exists: savedDoc.exists,
                data: savedDoc.data(),
                firestoreId: savedDoc.id,
                path: savedDoc.ref.path
            });
            
            // Also add to a logs collection for debugging
            try {
                await this.db.collection('save_logs').add({
                    ...signatureData,
                    saveId: saveId,
                    docId: docId,
                    success: true,
                    logTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
            } catch (logError) {
                this.logDebug(`[${saveId}] ⚠️ Could not save to logs:`, logError.message);
            }
            
            return { 
                success: true, 
                data: signatureData,
                docId: docId,
                imageUrl: imageUrl
            };
            
        } catch (error) {
            this.logDebug(`[${saveId}] ❌ SAVE FAILED:`, {
                error: error.message,
                code: error.code,
                stack: error.stack
            });
            
            // Log error to Firestore if possible
            try {
                if (this.db) {
                    await this.db.collection('error_logs').add({
                        saveId: saveId,
                        error: error.message,
                        code: error.code,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        name: name,
                        userId: firebase.auth().currentUser?.uid
                    });
                }
            } catch (logError) {
                this.logDebug(`[${saveId}] ❌ Could not log error:`, logError.message);
            }
            
            return { 
                success: false, 
                error: error.message,
                code: error.code,
                saveId: saveId
            };
        }
    }

    async testSave() {
        this.logDebug('🧪 Starting test save...');
        
        const testResult = await this.saveSignature(
            'TEST_USER_' + Date.now(),
            '',
            'TEST_KETERANGAN'
        );
        
        this.logDebug('🧪 Test save result:', testResult);
        return testResult;
    }

    async checkFirestoreRules() {
        try {
            this.logDebug('🔒 Checking Firestore rules...');
            
            // Try to read from a test collection
            const testRead = await this.db.collection('test_permissions').limit(1).get();
            this.logDebug('✅ Read permission: OK');
            
            // Try to write to a test collection
            const testDocRef = this.db.collection('test_permissions').doc('test_write');
            await testDocRef.set({
                test: true,
                timestamp: new Date().toISOString()
            });
            this.logDebug('✅ Write permission: OK');
            
            return { canRead: true, canWrite: true };
        } catch (error) {
            this.logDebug('❌ Permission check failed:', error.message);
            
            // Check for specific permission errors
            if (error.code === 'permission-denied') {
                this.logDebug('🔒 PERMISSION DENIED - Check Firestore rules in Firebase Console');
            }
            
            return { canRead: false, canWrite: false, error: error.message };
        }
    }

    // Helper function
    dataURLtoBlob(dataURL) {
        const arr = dataURL.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        
        return new Blob([u8arr], { type: mime });
    }
}


// Create global instance
window.dbManager = new FirebaseDBManager();

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 DOM loaded - Initializing Firebase DB...');
    
    // Wait for Firebase to load
    let attempts = 0;
    const maxAttempts = 10;
    
    const waitForFirebase = setInterval(async () => {
        attempts++;
        
        if (typeof firebase !== 'undefined' && firebase.apps.length) {
            clearInterval(waitForFirebase);
            
            console.log('✅ Firebase loaded, initializing DB manager...');
            
            try {
                const initialized = await window.dbManager.initialize();
                
                if (initialized) {
                    console.log('✅ Firebase DB ready!');
                    
                    // Check permissions
                    const permissions = await window.dbManager.checkFirestoreRules();
                    console.log('Permissions check:', permissions);
                    
                    // Test save
                    setTimeout(async () => {
                        if (firebase.auth().currentUser) {
                            console.log('🧪 Running test save...');
                            const testResult = await window.dbManager.testSave();
                            console.log('Test save result:', testResult);
                        } else {
                            console.log('⚠️ Not logged in, skipping test save');
                        }
                    }, 2000);
                } else {
                    console.error('❌ Firebase DB initialization failed');
                }
            } catch (error) {
                console.error('❌ Error during initialization:', error);
            }
        } else if (attempts >= maxAttempts) {
            clearInterval(waitForFirebase);
            console.error('❌ Firebase failed to load after', maxAttempts, 'attempts');
        } else {
            console.log(`⏳ Waiting for Firebase... (${attempts}/${maxAttempts})`);
        }
    }, 1000);
});
