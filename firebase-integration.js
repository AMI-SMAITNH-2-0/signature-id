// firebase-integration.js - SIMPLIFIED
class FirebaseIntegration {
  constructor() {
    this.ready = false;
    this.init();
  }
  
  // Update the init method in FirebaseSyncListener class
async init() {
    console.log('🔄 Initializing Firebase Sync Listener...');
    
    // Wait for Firebase to be ready
    await this.waitForFirebase();
    
    // Start listening for changes
    this.startListening();
    
    // Start periodic sync
    this.startPeriodicSync();
    
    // AUTO-PULL DATA IMMEDIATELY
    await this.autoPullOnStart();
    
    console.log('✅ Firebase Sync Listener initialized');
  }
  
  async autoPullOnStart() {
    console.log('🚀 Auto-pulling data on startup...');
    
    // Check if we should auto-pull (only if online and Firebase is available)
    if (!navigator.onLine) {
      console.log('📴 Offline - skipping auto-pull');
      return;
    }
    
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
      console.log('📴 Firebase not available - skipping auto-pull');
      return;
    }
    
    try {
      // Get current division and gender
      const currentDivision = localStorage.getItem('currentDivision') || 'Khusus';
      const currentGender = localStorage.getItem('currentGender') || 'Ikhwan';
      
      console.log(`📥 Auto-pulling data for ${currentDivision}_${currentGender}...`);
      
      // Pull data immediately
      await this.pullDivisionData(currentDivision, currentGender);
      
      console.log('✅ Auto-pull completed');
      
      // Show notification
      showNotification('Data synchronized from cloud', 'success');
      
    } catch (error) {
      console.error('❌ Auto-pull failed:', error);
      showNotification('Auto-sync failed. Please check connection.', 'error');
    }
  }
  
  async waitForFirebase() {
    return new Promise((resolve) => {
      const check = () => {
        if (window.firebaseServices && window.dbManager) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }
  
  setupListeners() {
    // Listen for sync updates
    window.addEventListener('syncDataUpdate', (event) => {
      this.handleUpdate(event.detail);
    });
  }
  
  handleUpdate(detail) {
    console.log('📡 Update received:', detail.type);
    
    // Update localStorage
    localStorage.setItem(detail.type, JSON.stringify(detail.data));
    
    // Dispatch specific event
    switch (detail.type) {
      case 'attendanceNames':
        window.dispatchEvent(new CustomEvent('namesUpdated', { detail }));
        break;
      case 'reportTitles':
        window.dispatchEvent(new CustomEvent('titlesUpdated', { detail }));
        break;
      case 'attendanceInfo':
        window.dispatchEvent(new CustomEvent('infoUpdated', { detail }));
        break;
      case 'signatures':
        window.dispatchEvent(new CustomEvent('signaturesUpdated', { detail }));
        break;
    }
  }
  
  // Save data helper
  async saveData(type, data) {
    if (window.dbManager) {
      return await window.dbManager.saveData(type, data);
    }
    return { success: false, error: 'No DB manager' };
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.firebaseIntegration = new FirebaseIntegration();
});
