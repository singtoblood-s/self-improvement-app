// Ascend Application Controller (Firebase Edition)
document.addEventListener('DOMContentLoaded', () => {
  // --- STATE ---
  let appData = {
    profile: { name: 'User', title: 'Self Improvement' },
    habits: [],
    goals: [],
    journal: [],
    settings: { firebaseConfigStr: '', autoSync: true, lastSynced: '' }
  };

  // Current active journal entry date
  let selectedJournalDate = getTodayStr();
  
  // Auth Modal State: 'signin' or 'signup'
  let authMode = 'signin';

  // --- INIT ---
  function init() {
    appData = window.AscendStorage.load();
    setupRouting();
    setupEventListeners();
    setupAuthListeners();
    
    // Check for daily reset
    checkDailyReset();
    
    // Render current view
    navigate('dashboard');
  }

  // --- AUTH LISTENERS & BINDINGS ---
  function setupAuthListeners() {
    const isConfigured = window.AscendStorage.isFirebaseConfigured();
    const authCard = document.getElementById('firebase-auth-card');
    
    if (!isConfigured) {
      if (authCard) authCard.style.display = 'none';
      updateSidebarAuthUI(null);
      return;
    }

    if (authCard) authCard.style.display = 'block';

    // Listen to Firebase Auth state changes
    window.AscendStorage.onAuthStateChanged(async (user) => {
      updateSidebarAuthUI(user);
      updateSettingsAuthUI(user);

      if (user) {
        // Auto-pull from Firestore on sign-in
        const statusEl = document.getElementById('firestore-sync-status');
        if (statusEl) {
          statusEl.className = 'sync-status';
          statusEl.textContent = 'Syncing data with Firestore...';
        }
        
        const result = await window.AscendStorage.loadFromFirestore(user.uid);
        if (result.success) {
          appData = result.data;
          updateAllStreaks();
          
          // Refresh the current active view with fresh cloud data
          const activeItem = document.querySelector('.nav-item.active');
          if (activeItem) {
            navigate(activeItem.getAttribute('data-section'));
          }
          if (statusEl) {
            statusEl.className = 'sync-status success';
            statusEl.textContent = '✓ Cloud data loaded successfully.';
          }
        } else {
          // If no cloud data exists (new account), upload current local storage to Firestore
          console.log('No cloud data, uploading local guest database...');
          await window.AscendStorage.syncToFirestore(user.uid, appData);
          if (statusEl) {
            statusEl.className = 'sync-status success';
            statusEl.textContent = '✓ Local data uploaded to your new cloud account.';
          }
        }
      }
    });
  }

  function updateSidebarAuthUI(user) {
    const avatar = document.getElementById('sidebar-avatar');
    const name = document.getElementById('sidebar-name');
    const title = document.getElementById('sidebar-title');

    if (user) {
      avatar.textContent = user.email.substring(0, 2).toUpperCase();
      avatar.style.background = 'var(--secondary-gradient)';
      name.textContent = appData.profile.name || 'User';
      title.textContent = user.email;
    } else {
      avatar.textContent = 'G';
      avatar.style.background = 'rgba(255, 255, 255, 0.05)';
      name.textContent = 'Guest Mode';
      title.textContent = 'Tap to Cloud Sync';
    }
  }

  function updateSettingsAuthUI(user) {
    const loggedOutDiv = document.getElementById('auth-logged-out-state');
    const loggedInDiv = document.getElementById('auth-logged-in-state');
    const emailSpan = document.getElementById('logged-in-email');

    if (user) {
      if (loggedOutDiv) loggedOutDiv.style.display = 'none';
      if (loggedInDiv) loggedInDiv.style.display = 'block';
      if (emailSpan) emailSpan.textContent = user.email;
    } else {
      if (loggedOutDiv) loggedOutDiv.style.display = 'block';
      if (loggedInDiv) loggedInDiv.style.display = 'none';
    }
  }

  // --- SAVE & AUTO SYNC FIRESTORE ---
  let firestoreSyncTimeout = null;
  function saveAndSync() {
    window.AscendStorage.save(appData);
    
    // Auto-sync with Firestore if logged in
    const isConfigured = window.AscendStorage.isFirebaseConfigured();
    if (isConfigured) {
      const user = firebase.auth().currentUser;
      if (user && appData.settings.autoSync) {
        const statusEl = document.getElementById('firestore-sync-status');
        if (statusEl) {
          statusEl.className = 'sync-status';
          statusEl.textContent = 'Syncing...';
        }
        
        // Debounce Firestore writes to prevent spamming updates during typing/quick clicks
        clearTimeout(firestoreSyncTimeout);
        firestoreSyncTimeout = setTimeout(() => {
          window.AscendStorage.syncToFirestore(user.uid, appData).then(res => {
            if (res.success) {
              if (statusEl) {
                statusEl.className = 'sync-status success';
                statusEl.textContent = `✓ Auto-synced with Cloud at ${new Date().toLocaleTimeString()}`;
              }
            } else {
              if (statusEl) {
                statusEl.className = 'sync-status error';
                statusEl.textContent = `✗ Sync failed: ${res.error}`;
              }
            }
          });
        }, 1500);
      }
    }
  }

  // --- DATE HELPERS ---
  function getTodayStr() {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  }

  function getPreviousDateStr(dateStr, offsetDays = 1) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - offsetDays);
    return d.toISOString().split('T')[0];
  }

  function formatDateFriendly(dateStr) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', options);
  }

  function getCurrentWeekDates() {
    const today = new Date();
    const day = today.getDay();
    const dayAdjusted = day === 0 ? 7 : day;
    const diff = today.getDate() - dayAdjusted + 1;
    const monday = new Date(today.setDate(diff));
    
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      weekDates.push(d.toISOString().split('T')[0]);
    }
    return weekDates;
  }

  // --- ROUTING (SPA) ---
  function setupRouting() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const sectionId = item.getAttribute('data-section');
        navigate(sectionId);
      });
    });
  }

  function navigate(sectionId) {
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.getAttribute('data-section') === sectionId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    document.querySelectorAll('.page-section').forEach(section => {
      if (section.id === `${sectionId}-section`) {
        section.classList.add('active');
      } else {
        section.classList.remove('active');
      }
    });

    if (sectionId === 'dashboard') {
      renderDashboard();
    } else if (sectionId === 'habits') {
      renderHabits();
    } else if (sectionId === 'goals') {
      renderGoals();
    } else if (sectionId === 'journal') {
      renderJournal();
    } else if (sectionId === 'analytics') {
      renderAnalytics();
    } else if (sectionId === 'settings') {
      populateSettingsForm();
    }
  }

  // --- AUTO STREAK CALCULATOR ---
  function calculateStreak(logs, todayStr) {
    let streak = 0;
    let checkDate = todayStr;
    
    if (logs[checkDate]) {
      streak++;
    } else {
      checkDate = getPreviousDateStr(todayStr);
      if (!logs[checkDate]) {
        return 0;
      }
      streak++;
    }

    while (true) {
      checkDate = getPreviousDateStr(checkDate);
      if (logs[checkDate]) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  function updateAllStreaks() {
    const today = getTodayStr();
    appData.habits.forEach(habit => {
      if (!habit.logs) habit.logs = {};
      habit.streak = calculateStreak(habit.logs, today);
      if (habit.streak > (habit.maxStreak || 0)) {
        habit.maxStreak = habit.streak;
      }
    });
    saveAndSync();
  }

  let lastCheckedDate = getTodayStr();
  function checkDailyReset() {
    const today = getTodayStr();
    if (today !== lastCheckedDate) {
      lastCheckedDate = today;
      updateAllStreaks();
      ensureTodayJournalLog();
      if (document.getElementById('dashboard-section').classList.contains('active')) {
        renderDashboard();
      }
    }
  }
  setInterval(checkDailyReset, 30000);

  function ensureTodayJournalLog() {
    const today = getTodayStr();
    const exists = appData.journal.some(j => j.date === today);
    if (!exists) {
      appData.journal.push({
        date: today,
        mood: '',
        content: ''
      });
      saveAndSync();
    }
  }

  // --- RENDER FUNCTIONS ---

  // 1. Dashboard
  function renderDashboard() {
    const today = getTodayStr();
    
    // Profile Sidebar render
    const isConfigured = window.AscendStorage.isFirebaseConfigured();
    const user = isConfigured ? firebase.auth().currentUser : null;
    updateSidebarAuthUI(user);
    
    document.getElementById('dash-date').textContent = formatDateFriendly(today);
    document.getElementById('user-greeting').textContent = `Keep going, ${appData.profile.name || 'Achiever'}!`;

    const totalHabits = appData.habits.length;
    let completedHabits = 0;
    appData.habits.forEach(h => {
      if (h.logs && h.logs[today]) completedHabits++;
    });

    const completionRate = totalHabits > 0 ? Math.round((completedHabits / totalHabits) * 100) : 0;
    const activeGoals = appData.goals.filter(g => g.status === 'active').length;

    let highestStreak = 0;
    appData.habits.forEach(h => {
      if (h.streak > highestStreak) highestStreak = h.streak;
    });

    document.getElementById('metric-habits-rate').textContent = `${completionRate}%`;
    document.getElementById('metric-goals-active').textContent = activeGoals;
    document.getElementById('metric-highest-streak').textContent = `${highestStreak} days`;

    const circle = document.getElementById('dash-progress-circle');
    if (circle) {
      const radius = 60;
      const circumference = 2 * Math.PI * radius;
      circle.style.strokeDasharray = `${circumference} ${circumference}`;
      const offset = circumference - (completionRate / 100) * circumference;
      circle.style.strokeDashoffset = offset;
      document.getElementById('dash-progress-text').textContent = `${completionRate}%`;
    }

    const quickListContainer = document.getElementById('quick-habits-list');
    quickListContainer.innerHTML = '';

    if (appData.habits.length === 0) {
      quickListContainer.innerHTML = `
        <div class="empty-state" style="padding: 20px;">
          <div class="empty-state-title">No habits configured</div>
          <button class="btn btn-primary btn-sm" id="dash-create-habit-btn" style="margin-top: 10px;">+ Add Habit</button>
        </div>
      `;
      document.getElementById('dash-create-habit-btn').addEventListener('click', () => navigate('habits'));
      return;
    }

    appData.habits.forEach(habit => {
      const isCompleted = habit.logs && habit.logs[today];
      const div = document.createElement('div');
      div.className = `quick-habit-item ${isCompleted ? 'completed' : ''}`;
      div.innerHTML = `
        <div class="quick-habit-left">
          <div class="checkbox-custom" data-id="${habit.id}">
            <i class="lucide-check" style="font-size: 0.85rem; width: 14px; height: 14px;"></i>
          </div>
          <span class="quick-habit-name">${habit.name}</span>
        </div>
        <span class="badge ${isCompleted ? 'badge-success' : 'badge-primary'}">${habit.streak}d streak</span>
      `;

      div.querySelector('.checkbox-custom').addEventListener('click', () => {
        toggleHabitCompletion(habit.id, today);
      });

      quickListContainer.appendChild(div);
    });

    renderQuickMoodPicker();
  }

  function renderQuickMoodPicker() {
    const today = getTodayStr();
    let todayJournal = appData.journal.find(j => j.date === today);
    if (!todayJournal) {
      ensureTodayJournalLog();
      todayJournal = appData.journal.find(j => j.date === today);
    }

    const currentMood = todayJournal ? todayJournal.mood : '';
    const moodBtns = document.querySelectorAll('.mood-picker-card .mood-btn');
    
    moodBtns.forEach(btn => {
      const moodVal = btn.getAttribute('data-mood');
      if (moodVal === currentMood) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }

      btn.onclick = () => {
        moodBtns.forEach(b => b.classList.remove('active'));
        if (todayJournal) {
          if (todayJournal.mood === moodVal) {
            todayJournal.mood = '';
          } else {
            todayJournal.mood = moodVal;
            btn.classList.add('active');
          }
          saveAndSync();
          updateAllStreaks();
          renderDashboard();
        }
      };
    });
  }

  // 2. Habits Page
  function renderHabits() {
    const container = document.getElementById('habits-grid');
    container.innerHTML = '';

    if (appData.habits.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <i class="lucide-sparkles"></i>
          <div class="empty-state-title">Let's build new routines</div>
          <div class="empty-state-desc">Define things you want to practice every day. Track your consistency over the week.</div>
          <button class="btn btn-primary" id="empty-add-habit-btn">+ Add Your First Habit</button>
        </div>
      `;
      document.getElementById('empty-add-habit-btn').addEventListener('click', () => openModal('habit-modal'));
      return;
    }

    const weekDates = getCurrentWeekDates();
    const today = getTodayStr();

    appData.habits.forEach(habit => {
      const card = document.createElement('div');
      card.className = 'card habit-card';
      
      const totalLogged = Object.keys(habit.logs || {}).filter(k => habit.logs[k]).length;
      
      let weekDotsHtml = '';
      weekDates.forEach(date => {
        const isCompleted = habit.logs && habit.logs[date];
        const isFuture = date > today;
        const isToday = date === today;
        const dateObj = new Date(date + 'T00:00:00');
        const dayLetter = dateObj.toLocaleDateString('en-US', { weekday: 'narrow' });
        
        let dotClass = '';
        if (isCompleted) dotClass = 'completed';
        else if (isFuture) dotClass = 'future';
        else if (!isCompleted && !isToday) dotClass = 'missed';

        weekDotsHtml += `
          <div class="week-day-col">
            <span class="week-day-lbl">${dayLetter}</span>
            <div class="week-day-dot ${dotClass}" data-date="${date}" title="${formatDateFriendly(date)}">
              ${isCompleted ? '✓' : ''}
            </div>
          </div>
        `;
      });

      card.innerHTML = `
        <div class="habit-header">
          <div class="habit-title-area">
            <span class="habit-category">${habit.category || 'Personal'}</span>
            <span class="habit-card-title">${habit.name}</span>
          </div>
          <div class="habit-actions">
            <button class="action-icon-btn delete-btn" title="Delete Habit" data-id="${habit.id}">
              🗑
            </button>
          </div>
        </div>
        <div class="habit-stats-row">
          <div class="habit-stat">
            <span class="habit-stat-val">${habit.streak || 0}d</span>
            <span class="habit-stat-lbl">Streak</span>
          </div>
          <div class="habit-stat">
            <span class="habit-stat-val">${habit.maxStreak || 0}d</span>
            <span class="habit-stat-lbl">Best</span>
          </div>
          <div class="habit-stat">
            <span class="habit-stat-val">${totalLogged}</span>
            <span class="habit-stat-lbl">Total</span>
          </div>
        </div>
        <div>
          <div class="week-tracker-label">Weekly Check-in</div>
          <div class="week-tracker-row">
            ${weekDotsHtml}
          </div>
        </div>
      `;

      card.querySelectorAll('.week-day-dot').forEach(dot => {
        const d = dot.getAttribute('data-date');
        if (d <= today) {
          dot.addEventListener('click', () => {
            toggleHabitCompletion(habit.id, d);
          });
        }
      });

      card.querySelector('.delete-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this habit? All log history will be deleted.')) {
          deleteHabit(habit.id);
        }
      });

      container.appendChild(card);
    });
  }

  // 3. Goals Page
  function renderGoals() {
    const container = document.getElementById('goals-grid');
    container.innerHTML = '';

    if (appData.goals.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <i class="lucide-compass"></i>
          <div class="empty-state-title">Chart your roadmap</div>
          <div class="empty-state-desc">Set milestones and deadlines for your career, fitness, or mindset goals.</div>
          <button class="btn btn-primary" id="empty-add-goal-btn">+ Add Your First Goal</button>
        </div>
      `;
      document.getElementById('empty-add-goal-btn').addEventListener('click', () => openModal('goal-modal'));
      return;
    }

    appData.goals.forEach(goal => {
      const card = document.createElement('div');
      card.className = 'card goal-card';
      
      const totalMilestones = goal.milestones.length;
      const completedMilestones = goal.milestones.filter(m => m.completed).length;
      
      let progressPercent = 0;
      if (totalMilestones > 0) {
        progressPercent = Math.round((completedMilestones / totalMilestones) * 100);
      } else if (goal.status === 'completed') {
        progressPercent = 100;
      }

      const today = getTodayStr();
      const isOverdue = goal.targetDate < today && goal.status !== 'completed';

      let milestonesHtml = '';
      goal.milestones.forEach(m => {
        milestonesHtml += `
          <div class="milestone-item ${m.completed ? 'completed' : ''}" data-milestone-id="${m.id}">
            <div class="milestone-checkbox">✓</div>
            <span>${m.title}</span>
          </div>
        `;
      });

      card.innerHTML = `
        <div class="goal-top">
          <div class="goal-title-area">
            <div style="display:flex; gap: 8px; align-items:center;">
              <span class="badge ${goal.status === 'completed' ? 'badge-success' : 'badge-primary'}">
                ${goal.status.toUpperCase()}
              </span>
              <span class="badge badge-secondary">${goal.category || 'General'}</span>
            </div>
            <span class="goal-card-title" style="margin-top:8px;">${goal.title}</span>
            <span class="goal-card-desc">${goal.description || 'No description provided.'}</span>
          </div>
          <button class="action-icon-btn delete-btn" title="Delete Goal" data-id="${goal.id}">
            🗑
          </button>
        </div>
        
        <div class="goal-progress-section">
          <div class="goal-progress-meta">
            <span>Milestones (${completedMilestones}/${totalMilestones})</span>
            <span class="goal-progress-percent">${progressPercent}%</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
          </div>
        </div>

        <div class="goal-milestones-list">
          ${milestonesHtml}
        </div>

        <div class="goal-dates">
          <div class="goal-date-target ${isOverdue ? 'badge badge-danger' : ''}" style="border:none; padding:0;">
            📅 Deadline: ${goal.targetDate || 'No limit'}
          </div>
          ${goal.status !== 'completed' ? `
            <button class="btn btn-secondary btn-icon" id="complete-goal-btn-${goal.id}" title="Mark Complete" style="width:30px; height:30px; border-radius:50%; padding:0; display:flex; align-items:center; justify-content:center;">
              ✓
            </button>
          ` : ''}
        </div>
      `;

      card.querySelectorAll('.milestone-item').forEach(el => {
        el.addEventListener('click', () => {
          const mId = el.getAttribute('data-milestone-id');
          toggleMilestone(goal.id, mId);
        });
      });

      const completeBtn = card.querySelector(`#complete-goal-btn-${goal.id}`);
      if (completeBtn) {
        completeBtn.addEventListener('click', () => {
          completeGoal(goal.id);
        });
      }

      card.querySelector('.delete-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this goal and its milestones?')) {
          deleteGoal(goal.id);
        }
      });

      container.appendChild(card);
    });
  }

  // 4. Journal Page
  function renderJournal() {
    const listContainer = document.getElementById('journal-history-list');
    listContainer.innerHTML = '';

    const sortedEntries = [...appData.journal].sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedEntries.forEach(entry => {
      const item = document.createElement('div');
      item.className = `journal-history-item card ${entry.date === selectedJournalDate ? 'active' : ''}`;
      
      const moodEmojis = {
        excellent: '😁',
        good: '🙂',
        neutral: '😐',
        bad: '🙁',
        awful: '😢'
      };

      const moodSymbol = entry.mood ? moodEmojis[entry.mood] : '📝';
      const previewText = entry.content ? entry.content.substring(0, 60) + (entry.content.length > 60 ? '...' : '') : 'No entry written...';

      item.innerHTML = `
        <div class="journal-history-header">
          <span class="journal-history-date">${formatDateFriendly(entry.date).split(',')[1].trim()}</span>
          <span class="journal-history-mood">${moodSymbol}</span>
        </div>
        <div class="journal-history-preview">${previewText}</div>
      `;

      item.addEventListener('click', () => {
        selectedJournalDate = entry.date;
        renderJournal();
      });

      listContainer.appendChild(item);
    });

    let activeEntry = appData.journal.find(j => j.date === selectedJournalDate);
    if (!activeEntry) {
      activeEntry = { date: selectedJournalDate, mood: '', content: '' };
    }

    document.getElementById('editor-date').textContent = formatDateFriendly(selectedJournalDate);
    const textarea = document.getElementById('journal-editor-textarea');
    textarea.value = activeEntry.content || '';

    const editorMoodBtns = document.querySelectorAll('.editor-mood-selector .mood-btn');
    editorMoodBtns.forEach(btn => {
      const mVal = btn.getAttribute('data-mood');
      if (mVal === activeEntry.mood) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }

      btn.onclick = () => {
        editorMoodBtns.forEach(b => b.classList.remove('active'));
        if (activeEntry.mood === mVal) {
          activeEntry.mood = '';
        } else {
          activeEntry.mood = mVal;
          btn.classList.add('active');
        }
        
        saveCurrentJournalState(activeEntry);
      };
    });

    textarea.oninput = () => {
      activeEntry.content = textarea.value;
      saveCurrentJournalState(activeEntry);
    };
  }

  function saveCurrentJournalState(activeEntry) {
    const idx = appData.journal.findIndex(j => j.date === activeEntry.date);
    if (idx !== -1) {
      appData.journal[idx] = activeEntry;
    } else {
      appData.journal.push(activeEntry);
    }
    saveAndSync();
    
    const activeItem = document.querySelector('.journal-history-item.active .journal-history-preview');
    if (activeItem) {
      const text = activeEntry.content;
      activeItem.textContent = text ? text.substring(0, 60) + (text.length > 60 ? '...' : '') : 'No entry written...';
    }
    const activeMoodItem = document.querySelector('.journal-history-item.active .journal-history-mood');
    if (activeMoodItem) {
      const moodEmojis = { excellent: '😁', good: '🙂', neutral: '😐', bad: '🙁', awful: '😢' };
      activeMoodItem.textContent = activeEntry.mood ? moodEmojis[activeEntry.mood] : '📝';
    }
  }

  // 5. Analytics Page
  function renderAnalytics() {
    window.AscendAnalytics.render(appData);
  }

  // --- ACTIONS (MUTATORS) ---

  function toggleHabitCompletion(habitId, dateStr) {
    const habit = appData.habits.find(h => h.id === habitId);
    if (!habit) return;

    if (!habit.logs) habit.logs = {};
    habit.logs[dateStr] = !habit.logs[dateStr];
    
    saveAndSync();
    updateAllStreaks();

    const activeSection = document.querySelector('.page-section.active').id;
    if (activeSection === 'dashboard-section') {
      renderDashboard();
    } else if (activeSection === 'habits-section') {
      renderHabits();
    }
  }

  function toggleMilestone(goalId, milestoneId) {
    const goal = appData.goals.find(g => g.id === goalId);
    if (!goal) return;

    const milestone = goal.milestones.find(m => m.id === milestoneId);
    if (!milestone) return;

    milestone.completed = !milestone.completed;

    const allCompleted = goal.milestones.every(m => m.completed);
    if (allCompleted && goal.status !== 'completed') {
      goal.status = 'completed';
    } else if (!allCompleted && goal.status === 'completed') {
      goal.status = 'active';
    }

    saveAndSync();
    renderGoals();
  }

  function completeGoal(goalId) {
    const goal = appData.goals.find(g => g.id === goalId);
    if (!goal) return;

    goal.status = 'completed';
    goal.milestones.forEach(m => m.completed = true);

    saveAndSync();
    renderGoals();
  }

  function deleteHabit(habitId) {
    appData.habits = appData.habits.filter(h => h.id !== habitId);
    saveAndSync();
    renderHabits();
  }

  function deleteGoal(goalId) {
    appData.goals = appData.goals.filter(g => g.id !== goalId);
    saveAndSync();
    renderGoals();
  }

  // --- MODAL & FORM LISTENERS ---

  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.add('active');
    }
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove('active');
    }
  }

  function setupEventListeners() {
    // 1. Sidebar Profile tap -> Opens Login modal if Guest
    const profileCard = document.getElementById('sidebar-profile-card');
    if (profileCard) {
      profileCard.addEventListener('click', () => {
        const isConfigured = window.AscendStorage.isFirebaseConfigured();
        if (!isConfigured) {
          alert('Please configure your Firebase Database in Settings first.');
          navigate('settings');
          return;
        }
        const user = firebase.auth().currentUser;
        if (!user) {
          openAuthModal();
        } else {
          navigate('settings');
        }
      });
    }

    // 2. Habits Actions
    const addHabitBtn = document.getElementById('add-habit-btn');
    if (addHabitBtn) {
      addHabitBtn.addEventListener('click', () => openModal('habit-modal'));
    }

    const habitForm = document.getElementById('habit-form');
    if (habitForm) {
      habitForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('habit-name-input').value;
        const category = document.getElementById('habit-category-input').value;
        
        if (!name) return;

        const newHabit = {
          id: 'h_' + Date.now(),
          name: name,
          category: category || 'Personal',
          streak: 0,
          maxStreak: 0,
          logs: {},
          createdAt: new Date().toISOString()
        };

        appData.habits.push(newHabit);
        saveAndSync();
        updateAllStreaks();
        
        habitForm.reset();
        closeModal('habit-modal');
        renderHabits();
      });
    }

    // 3. Goals Actions
    const addGoalBtn = document.getElementById('add-goal-btn');
    if (addGoalBtn) {
      addGoalBtn.addEventListener('click', () => {
        openModal('goal-modal');
        const container = document.getElementById('milestone-inputs-container');
        container.innerHTML = `
          <input type="text" class="form-control milestone-input-field" placeholder="Milestone 1 title" style="margin-bottom:8px;">
        `;
      });
    }

    const addMilestoneInputBtn = document.getElementById('add-milestone-input-btn');
    if (addMilestoneInputBtn) {
      addMilestoneInputBtn.addEventListener('click', () => {
        const container = document.getElementById('milestone-inputs-container');
        const count = container.querySelectorAll('input').length + 1;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control milestone-input-field';
        input.placeholder = `Milestone ${count} title`;
        input.style.marginBottom = '8px';
        container.appendChild(input);
      });
    }

    const goalForm = document.getElementById('goal-form');
    if (goalForm) {
      goalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = document.getElementById('goal-title-input').value;
        const desc = document.getElementById('goal-desc-input').value;
        const category = document.getElementById('goal-category-input').value;
        const deadline = document.getElementById('goal-date-input').value;

        if (!title) return;

        const milestoneInputs = document.querySelectorAll('.milestone-input-field');
        const milestones = [];
        milestoneInputs.forEach((input, index) => {
          if (input.value.trim()) {
            milestones.push({
              id: `m_${Date.now()}_${index}`,
              title: input.value.trim(),
              completed: false
            });
          }
        });

        const newGoal = {
          id: 'g_' + Date.now(),
          title: title,
          description: desc,
          category: category || 'General',
          status: 'active',
          targetDate: deadline || getTodayStr(),
          milestones: milestones,
          createdAt: new Date().toISOString()
        };

        appData.goals.push(newGoal);
        saveAndSync();
        
        goalForm.reset();
        closeModal('goal-modal');
        renderGoals();
      });
    }

    // Modal close triggers
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        closeModal('habit-modal');
        closeModal('goal-modal');
        closeModal('auth-modal');
      });
    });

    // 4. Profile Settings Form
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        appData.profile.name = document.getElementById('profile-name-input').value.trim() || 'Achiever';
        appData.profile.title = document.getElementById('profile-title-input').value.trim() || 'Growth';
        
        saveAndSync();
        alert('Profile saved successfully!');
        renderDashboard();
      });
    }

    // 5. Firebase Settings Form
    const fbConfigForm = document.getElementById('firebase-config-form');
    if (fbConfigForm) {
      fbConfigForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const jsonStr = document.getElementById('firebase-config-input').value.trim();
        const result = window.AscendStorage.saveFirebaseConfig(jsonStr);
        if (result.success) {
          alert(result.message);
          window.location.reload(); // Reload page to reinitialize Firebase with new config
        } else {
          alert(result.error);
        }
      });
    }

    const clearFbBtn = document.getElementById('clear-firebase-btn');
    if (clearFbBtn) {
      clearFbBtn.addEventListener('click', () => {
        if (confirm('Disconnect Firebase cloud sync? You will return to Guest offline mode.')) {
          window.AscendStorage.saveFirebaseConfig('');
          alert('Firebase disconnected. Reloading...');
          window.location.reload();
        }
      });
    }

    // 6. Auth settings panel listeners
    const openAuthBtn = document.getElementById('open-auth-modal-btn');
    if (openAuthBtn) {
      openAuthBtn.addEventListener('click', () => openAuthModal());
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        if (confirm('Log out from your Cloud Sync Account?')) {
          await window.AscendStorage.logout();
          alert('Logged out! Returning to local guest database.');
          window.location.reload();
        }
      });
    }

    const syncNowBtn = document.getElementById('sync-firestore-now-btn');
    if (syncNowBtn) {
      syncNowBtn.addEventListener('click', async () => {
        const user = firebase.auth().currentUser;
        if (!user) return;
        syncNowBtn.disabled = true;
        syncNowBtn.textContent = 'Syncing...';
        const res = await window.AscendStorage.syncToFirestore(user.uid, appData);
        syncNowBtn.disabled = false;
        syncNowBtn.textContent = 'Sync Data Now';
        if (res.success) {
          alert('Successfully synced with your Firebase Firestore cloud account!');
        } else {
          alert('Sync failed: ' + res.error);
        }
      });
    }

    // 7. Auth Modal Form Handling
    const authForm = document.getElementById('auth-form');
    if (authForm) {
      authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email-input').value.trim();
        const password = document.getElementById('auth-password-input').value;
        const submitBtn = document.getElementById('auth-submit-btn');

        if (!email || !password) return;

        submitBtn.disabled = true;
        submitBtn.textContent = authMode === 'signin' ? 'Signing In...' : 'Registering...';

        try {
          if (authMode === 'signin') {
            await window.AscendStorage.loginEmail(email, password);
            alert('Welcome back! Successfully logged in.');
          } else {
            await window.AscendStorage.registerEmail(email, password);
            alert('Welcome! Your account has been registered successfully.');
          }
          closeModal('auth-modal');
        } catch (err) {
          alert('Authentication Error: ' + err.message);
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = authMode === 'signin' ? 'Sign In' : 'Register';
        }
      });
    }

    const authToggleLink = document.getElementById('auth-toggle-link');
    if (authToggleLink) {
      authToggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        toggleAuthMode();
      });
    }

    // 8. JSON backup imports/exports
    const exportBtn = document.getElementById('export-backup-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        window.AscendStorage.exportToFile(appData);
      });
    }

    const importInput = document.getElementById('import-file-input');
    if (importInput) {
      importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          const result = window.AscendStorage.importFromString(event.target.result);
          if (result.success) {
            appData = result.data;
            alert('Backup data successfully imported!');
            updateAllStreaks();
            navigate('dashboard');
          } else {
            alert(`Import failed: ${result.error}`);
          }
        };
        reader.readAsText(file);
      });
    }
  }

  function openAuthModal() {
    authMode = 'signin';
    document.getElementById('auth-modal-title').textContent = 'Sign In to Ascend';
    document.getElementById('auth-submit-btn').textContent = 'Sign In';
    document.getElementById('auth-toggle-msg').innerHTML = `Don't have an account? <a href="#" id="auth-toggle-link" style="color: var(--primary); font-weight:600; text-decoration:none;">Register here</a>`;
    
    // Bind toggle link again since innerHTML rewrote it
    document.getElementById('auth-toggle-link').onclick = (e) => {
      e.preventDefault();
      toggleAuthMode();
    };
    
    openModal('auth-modal');
  }

  function toggleAuthMode() {
    const title = document.getElementById('auth-modal-title');
    const btn = document.getElementById('auth-submit-btn');
    const msg = document.getElementById('auth-toggle-msg');

    if (authMode === 'signin') {
      authMode = 'signup';
      title.textContent = 'Register Ascend Account';
      btn.textContent = 'Register';
      msg.innerHTML = `Already have an account? <a href="#" id="auth-toggle-link" style="color: var(--primary); font-weight:600; text-decoration:none;">Sign In here</a>`;
    } else {
      authMode = 'signin';
      title.textContent = 'Sign In to Ascend';
      btn.textContent = 'Sign In';
      msg.innerHTML = `Don't have an account? <a href="#" id="auth-toggle-link" style="color: var(--primary); font-weight:600; text-decoration:none;">Register here</a>`;
    }

    document.getElementById('auth-toggle-link').onclick = (e) => {
      e.preventDefault();
      toggleAuthMode();
    };
  }

  function populateSettingsForm() {
    document.getElementById('profile-name-input').value = appData.profile.name || '';
    document.getElementById('profile-title-input').value = appData.profile.title || '';
    
    const isConfigured = window.AscendStorage.isFirebaseConfigured();
    if (isConfigured) {
      document.getElementById('firebase-config-input').value = window.AscendStorage.getFirebaseConfig();
    } else {
      document.getElementById('firebase-config-input').value = '';
    }
  }

  init();
});
