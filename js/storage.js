// Ascend Storage Manager
const STORAGE_KEY = 'ascend_self_improvement_data';

const DEFAULT_DATA = {
  profile: {
    name: 'User',
    title: 'Self Improvement Journey'
  },
  habits: [
    {
      id: 'h1',
      name: 'Read 10 Pages',
      category: 'Mind',
      streak: 0,
      maxStreak: 0,
      logs: {}, // Format: { "YYYY-MM-DD": true }
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
      status: 'active', // active, completed
      targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
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
      mood: 'excellent', // excellent, good, neutral, bad, awful
      content: 'Welcome to Ascend! Today is the start of a new chapter. I will use this space to track my daily reflections and plan my future self.'
    }
  ],
  settings: {
    githubToken: '',
    gistId: '',
    autoSync: false,
    lastSynced: ''
  }
};

const AscendStorage = {
  // Load entire database
  load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this.save(DEFAULT_DATA);
      return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
    try {
      const data = JSON.parse(raw);
      // Ensure all root structures exist in case of updates
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

  // Save entire database
  save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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

  // --- GITHUB GIST SYNC ---
  async syncWithGist(data) {
    const { githubToken, gistId } = data.settings;
    if (!githubToken) {
      return { success: false, error: 'GitHub Token is missing. Configure in settings.' };
    }

    const payload = {
      description: 'Ascend Self-Improvement App Sync Data',
      public: false,
      files: {
        'ascend_db.json': {
          content: JSON.stringify(data, null, 2)
        }
      }
    };

    const headers = {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };

    try {
      // 1. Create a new Gist if Gist ID is not set
      if (!gistId) {
        const response = await fetch('https://api.github.com/gists', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.statusText}`);
        }

        const result = await response.json();
        data.settings.gistId = result.id;
        data.settings.lastSynced = new Date().toISOString();
        this.save(data);
        return { success: true, action: 'created', gistId: result.id, lastSynced: data.settings.lastSynced };
      }

      // 2. Update existing Gist
      const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload)
      });

      if (response.status === 404) {
        // Gist was deleted on GitHub, clear Gist ID and retry to create a new one
        data.settings.gistId = '';
        this.save(data);
        return this.syncWithGist(data);
      }

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      data.settings.lastSynced = new Date().toISOString();
      this.save(data);
      return { success: true, action: 'updated', lastSynced: data.settings.lastSynced };

    } catch (error) {
      console.error('Gist Sync error:', error);
      return { success: false, error: error.message };
    }
  },

  // Pull data from existing Gist ID
  async pullFromGist(githubToken, gistId) {
    if (!githubToken || !gistId) {
      return { success: false, error: 'Token or Gist ID missing.' };
    }

    const headers = {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json'
    };

    try {
      const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        throw new Error(`Gist not found. Status: ${response.status}`);
      }

      const result = await response.json();
      const dbFile = result.files['ascend_db.json'];
      if (!dbFile || !dbFile.content) {
        throw new Error('Gist does not contain ascend_db.json file.');
      }

      const incomingData = JSON.parse(dbFile.content);
      // Retain token and gistId settings from browser
      incomingData.settings.githubToken = githubToken;
      incomingData.settings.gistId = gistId;
      incomingData.settings.lastSynced = new Date().toISOString();
      
      this.save(incomingData);
      return { success: true, data: incomingData };

    } catch (error) {
      console.error('Gist Pull error:', error);
      return { success: false, error: error.message };
    }
  }
};
window.AscendStorage = AscendStorage;
