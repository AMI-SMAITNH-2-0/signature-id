// firebase-integration.js - SIMPLIFIED
class FirebaseIntegration {
  constructor() {
    this.ready = false;
    this.init();
  }
  
  async init() {
    console.log("🔧 Initializing Firebase integration...");
    
    // Wait for Firebase
    await this.waitForFirebase();
    
    // Setup event listeners
    this.setupListeners();
    
    // Setup UI
    this.setupUI();
    
    this.ready = true;
    console.log("✅ Firebase integration ready");
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