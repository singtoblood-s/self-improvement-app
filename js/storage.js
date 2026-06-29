// Ascend Storage & Firebase Manager
const STORAGE_KEY = 'ascend_self_improvement_data';
const FB_CONFIG_KEY = 'ascend_firebase_config';

const DEFAULT_DATA = {
  profile: { name: 'User', title: 'Self Improvement Journey' },
  habits: [
    {
      id: 'h1',
      name: 'Read 10 Pages',
      category: 'Mind',
      streak: 0,
      maxStreak: 0,
      logs: {},
      createdAt: new Date().toISOString()
    },
    {
      id: 'h2',
      name: 'Exercise for 20 mins',
      category: 'Health',
      streak: 0,
      maxStreak: 0,
      logs: {},
      createdAt: new Date().toISOString()
    },
    {
      id: 'h3',
      name: 'Drink 2.5L Water',
      category: 'Health',
      streak: 0,
      maxStreak: 0,
      logs: {},
      createdAt: new Date().toISOString()
    }
  ],
  goals: [
    {
      id: 'g1',
      title: 'Establish a Growth Mindset',
      description: 'Read regularly and develop healthy routines to maximize focus.',
      category: 'Mindset',
      status: 'active',
      targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      milestones: [
        { id: 'm1', title: 'Complete 10-day reading streak', completed: false },
        { id: 'm2', title: 'Log progress in journal for 7 days', completed: false },
        { id: 'm3', title: 'Plan weekly roadmap', completed: false }
      ],
      createdAt: new Date().toISOString()
    }
  ],
  journal: [
    {
      date: new Date().toISOString().split('T')[0],
      mood: 'excellent',
      content: 'Welcome to Ascend! Today is the start of a new chapter. I will use this space to track my daily reflections and plan my future self.'
    }
  ],
  settings: {
    firebaseConfigStr: '',
    autoSync: true,
    lastSynced: ''
  }
};

let db = null;
let auth = null;
let firebaseInitialized = false;

// Initialize Firebase if config exists
function initFirebase() {
  const savedConfig = localStorage.getItem(FB_CONFIG_KEY);
  if (savedConfig) {
    try {
      const config = JSON.parse(savedConfig);
      // Prevent initializing multiple times
      if (firebase.apps.length === 0) {
        firebase.initializeApp(config);
      }
      db = firebase.firestore();
      auth = firebase.auth();
      firebaseInitialized = true;
      console.log('Firebase initialized successfully.');
    } catch (e) {
      console.error('Failed to initialize Firebase with saved config:', e);
    }
  }
}

initFirebase();

const AscendStorage = {
  // Load entire database from local storage
  load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this.save(DEFAULT_DATA);
      return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
    try {
      const data = JSON.parse(raw);
      return {
        profile: data.profile || DEFAULT_DATA.profile,
        habits: data.habits || [],
        goals: data.goals || [],
        journal: data.journal || [],
        settings: data.settings || DEFAULT_DATA.settings
      };
    } catch (e) {
      console.error('Error parsing stored data. Resetting to default.', e);
      return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
  },

  // Save database to local storage
  save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },

  // Save Firebase Config JSON
  saveFirebaseConfig(configStr) {
    if (!configStr.trim()) {
      localStorage.removeItem(FB_CONFIG_KEY);
      return { success: true, message: 'Firebase configuration removed.' };
    }
    try {
      // Gracefully handle JavaScript object notation (unquoted keys, single quotes, trailing commas)
      let formatted = configStr.trim();
      
      // If it doesn't start with a brace, wrap it (in case they copied just the content)
      if (!formatted.startsWith('{')) {
        formatted = '{' + formatted + '}';
      }
      
      formatted = formatted
        // Replace unquoted key names with double-quoted keys
        .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
        // Replace single quotes with double quotes
        .replace(/'/g, '"')
        // Remove trailing commas before closing braces
        .replace(/,\s*([}\]])/g, '$1');

      const parsed = JSON.parse(formatted);
      if (!parsed.apiKey || !parsed.projectId) {
        throw new Error('Config missing core parameters (apiKey or projectId).');
      }
      localStorage.setItem(FB_CONFIG_KEY, JSON.stringify(parsed));
      return { success: true, message: 'Config saved! Reloading to apply...' };
    } catch (e) {
      return { success: false, error: 'Invalid configuration format: ' + e.message };
    }
  },

  getFirebaseConfig() {
    const raw = localStorage.getItem(FB_CONFIG_KEY);
    return raw ? JSON.stringify(JSON.parse(raw), null, 2) : '';
  },

  isFirebaseConfigured() {
    return firebaseInitialized;
  },

  // Export database to a downloaded JSON file
  exportToFile(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ascend_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Import database from JSON string
  importFromString(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.habits && data.goals && data.journal && data.profile) {
        this.save(data);
        return { success: true, data };
      }
      return { success: false, error: 'Invalid file format. Missing core fields.' };
    } catch (e) {
      return { success: false, error: 'Failed to parse JSON file.' };
    }
  },

  // --- FIRESTORE METHODS ---
  async syncToFirestore(uid, data) {
    if (!firebaseInitialized || !db) {
      return { success: false, error: 'Firebase is not initialized.' };
    }
    try {
      const payload = {
        profile: data.profile,
        habits: data.habits,
        goals: data.goals,
        journal: data.journal,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.collection('users').doc(uid).set(payload, { merge: true });
      data.settings.lastSynced = new Date().toISOString();
      this.save(data);
      return { success: true, lastSynced: data.settings.lastSynced };
    } catch (e) {
      console.error('Firestore save failed:', e);
      return { success: false, error: e.message };
    }
  },

  async loadFromFirestore(uid) {
    if (!firebaseInitialized || !db) {
      return { success: false, error: 'Firebase is not initialized.' };
    }
    try {
      const doc = await db.collection('users').doc(uid).get();
      if (doc.exists) {
        const cloudData = doc.data();
        const local = this.load();
        
        // Merge cloud data but retain local settings
        const merged = {
          profile: cloudData.profile || local.profile,
          habits: cloudData.habits || local.habits,
          goals: cloudData.goals || local.goals,
          journal: cloudData.journal || local.journal,
          settings: local.settings
        };
        this.save(merged);
        return { success: true, data: merged };
      }
      return { success: false, error: 'No cloud database document found for this user.' };
    } catch (e) {
      console.error('Firestore load failed:', e);
      return { success: false, error: e.message };
    }
  },

  // --- AUTH HOOKS ---
  async registerEmail(email, password) {
    if (!firebaseInitialized || !auth) {
      throw new Error('Firebase is not configured.');
    }
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    return cred.user;
  },

  async loginEmail(email, password) {
    if (!firebaseInitialized || !auth) {
      throw new Error('Firebase is not configured.');
    }
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return cred.user;
  },

  async logout() {
    if (!firebaseInitialized || !auth) return;
    await auth.signOut();
  },

  onAuthStateChanged(callback) {
    if (!firebaseInitialized || !auth) return null;
    return auth.onAuthStateChanged(callback);
  }
};

window.AscendStorage = AscendStorage;
