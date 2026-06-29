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

  // Edit Modal State
  let editingHabitId = null;
  let editingGoalId = null;
  let toastHideTimers = new WeakMap();
  let confirmResolver = null;

  function normalizeAppData() {
    let changed = false;
    if (!Array.isArray(appData.habits)) {
      appData.habits = [];
      changed = true;
    }
    if (!Array.isArray(appData.goals)) {
      appData.goals = [];
      changed = true;
    }
    if (!Array.isArray(appData.journal)) {
      appData.journal = [];
      changed = true;
    }

    appData.habits.forEach(habit => {
      if (!habit.logs || typeof habit.logs !== 'object') {
        habit.logs = {};
        changed = true;
      }
      if (!Array.isArray(habit.timerSessions)) {
        habit.timerSessions = [];
        changed = true;
      }
      if (habit.timerElapsedSeconds != null) {
        const normalizedElapsed = Number(habit.timerElapsedSeconds);
        if (Number.isFinite(normalizedElapsed) && normalizedElapsed >= 0) {
          if (normalizedElapsed != habit.timerElapsedSeconds) {
            habit.timerElapsedSeconds = normalizedElapsed;
            changed = true;
          }
        } else {
          delete habit.timerElapsedSeconds;
          changed = true;
        }
      }
      if (habit.timerPlannedSeconds != null) {
        const normalizedPlanned = Number(habit.timerPlannedSeconds);
        if (Number.isFinite(normalizedPlanned) && normalizedPlanned > 0) {
          if (normalizedPlanned != habit.timerPlannedSeconds) {
            habit.timerPlannedSeconds = normalizedPlanned;
            changed = true;
          }
        } else {
          delete habit.timerPlannedSeconds;
          changed = true;
        }
      }
    });

    return changed;
  }

  function syncBodyScrollLock() {
    const hasActiveModal = !!document.querySelector('.modal-overlay.active');
    document.body.style.overflow = hasActiveModal ? 'hidden' : '';
  }

  function showToast(message, type = 'info', options = {}) {
    const stack = document.getElementById('toast-stack');
    if (!stack || !message) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`.trim();
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.textContent = message;
    stack.appendChild(toast);

    const duration = Number(options.duration ?? (type === 'error' ? 5200 : 3200));
    const timer = setTimeout(() => {
      toast.remove();
      toastHideTimers.delete(toast);
    }, duration);
    toastHideTimers.set(toast, timer);

    toast.addEventListener('click', () => {
      const activeTimer = toastHideTimers.get(toast);
      if (activeTimer) clearTimeout(activeTimer);
      toast.remove();
      toastHideTimers.delete(toast);
    });
  }

  function confirmAction({ title = 'Confirm action', message = 'Are you sure?', confirmText = 'Confirm', cancelText = 'Cancel', danger = true } = {}) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const messageEl = document.getElementById('confirm-modal-message');
    const confirmBtn = document.getElementById('confirm-approve-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    if (!modal || !titleEl || !messageEl || !confirmBtn || !cancelBtn) return Promise.resolve(false);

    titleEl.textContent = title;
    messageEl.textContent = message;
    confirmBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    confirmBtn.classList.toggle('btn-danger', !!danger);
    confirmBtn.classList.toggle('btn-primary', !danger);

    openModal('confirm-modal');

    return new Promise((resolve) => {
      confirmResolver = resolve;
      cancelBtn.focus();
    });
  }

  function resolveConfirm(result) {
    if (typeof confirmResolver === 'function') {
      const resolver = confirmResolver;
      confirmResolver = null;
      resolver(result);
    }
  }

  // --- INIT ---
  function init() {
    appData = window.AscendStorage.load();
    if (normalizeAppData()) {
      window.AscendStorage.save(appData);
    }
    setupRouting();
    setupEventListeners();
    setupAuthListeners();
    
    // Check for daily reset
    checkDailyReset();
    setupHabitTimerRuntime();
    
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
  let habitTimerInterval = null;
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

  function formatTimer(totalSeconds) {
    const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function parseDurationMinutes(text) {
    const raw = String(text || '').toLowerCase();
    const thaiHour = raw.match(/(\d+(?:\.\d+)?)\s*ชั่วโมง/);
    if (thaiHour) return Number(thaiHour[1]) * 60;
    const thaiMin = raw.match(/(\d+(?:\.\d+)?)\s*นาที/);
    if (thaiMin) return Number(thaiMin[1]);
    const hour = raw.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|hrs|h)\b/);
    if (hour) return Number(hour[1]) * 60;
    const minute = raw.match(/(\d+(?:\.\d+)?)\s*(?:minute|min|mins|m)\b/);
    if (minute) return Number(minute[1]);
    return 0;
  }

  function getHabitDurationMinutes(habit) {
    return Number(habit.timerMinutes) || parseDurationMinutes(habit.name) || 60;
  }

  function isTimedHabit(habit) {
    return habit.habitType === 'timer' || Number(habit.timerMinutes) > 0 || parseDurationMinutes(habit.name) > 0;
  }

  function getRunningTimerRemainingSeconds(habit) {
    if (!habit.timerEndsAt) return 0;
    return Math.max(0, Math.ceil((new Date(habit.timerEndsAt).getTime() - Date.now()) / 1000));
  }

  function ensureHabitTimerSessions(habit) {
    if (!Array.isArray(habit.timerSessions)) habit.timerSessions = [];
    return habit.timerSessions;
  }

  function getHabitElapsedSeconds(habit, nowTs = Date.now()) {
    let elapsed = Number(habit.timerElapsedSeconds) || 0;
    if (habit.timerStartedAt) {
      elapsed += Math.max(0, Math.round((nowTs - new Date(habit.timerStartedAt).getTime()) / 1000));
    }
    return Math.max(0, elapsed);
  }

  function getHabitLastTimerSession(habit) {
    const sessions = ensureHabitTimerSessions(habit);
    return sessions.length > 0 ? sessions[0] : null;
  }

  function getHabitFocusSecondsForDate(habit, dateStr) {
    return ensureHabitTimerSessions(habit)
      .filter(session => session.date === dateStr)
      .reduce((sum, session) => sum + (Number(session.actualSeconds) || 0), 0);
  }

  function formatFocusDuration(totalSeconds) {
    const safeSeconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
    if (safeSeconds >= 3600) {
      const hours = Math.floor(safeSeconds / 3600);
      const minutes = Math.round((safeSeconds % 3600) / 60);
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    if (safeSeconds >= 60) {
      return `${Math.round(safeSeconds / 60)} min`;
    }
    return `${safeSeconds} sec`;
  }

  function formatTimerSessionStatus(status) {
    return status === 'completed' ? 'completed' : 'stopped early';
  }

  function getDailyFocusSummary(dateStr) {
    let totalSeconds = 0;
    let sessionCount = 0;
    let bestSeconds = 0;

    appData.habits.forEach(habit => {
      ensureHabitTimerSessions(habit).forEach(session => {
        if (session.date !== dateStr) return;
        const actualSeconds = Number(session.actualSeconds) || 0;
        totalSeconds += actualSeconds;
        sessionCount += 1;
        if (actualSeconds > bestSeconds) bestSeconds = actualSeconds;
      });
    });

    return { totalSeconds, sessionCount, bestSeconds };
  }

  function clearHabitTimerRuntimeState(habit) {
    delete habit.timerStartedAt;
    delete habit.timerEndsAt;
    delete habit.timerDurationSeconds;
    delete habit.timerPaused;
    delete habit.timerRemainingSeconds;
    delete habit.timerSessionStartedAt;
    delete habit.timerElapsedSeconds;
    delete habit.timerPlannedSeconds;
  }

  function finalizeHabitTimerSession(habit, status, nowTs = Date.now()) {
    const actualSeconds = getHabitElapsedSeconds(habit, nowTs);
    const hadSessionState = !!(habit.timerSessionStartedAt || habit.timerStartedAt || habit.timerRemainingSeconds != null || habit.timerElapsedSeconds != null);
    if (!hadSessionState || actualSeconds <= 0) {
      clearHabitTimerRuntimeState(habit);
      return null;
    }

    const plannedSeconds = Math.max(1, Math.round(Number(habit.timerPlannedSeconds) || Number(habit.timerDurationSeconds) || (getHabitDurationMinutes(habit) * 60)));
    const startedAt = habit.timerSessionStartedAt || habit.timerStartedAt || new Date(nowTs - actualSeconds * 1000).toISOString();
    const endedAt = new Date(nowTs).toISOString();
    const sessions = ensureHabitTimerSessions(habit);
    const session = {
      id: `ts_${nowTs}_${Math.random().toString(36).slice(2, 8)}`,
      startedAt,
      endedAt,
      plannedSeconds,
      actualSeconds,
      status,
      date: endedAt.split('T')[0]
    };

    sessions.unshift(session);
    if (sessions.length > 60) sessions.length = 60;
    clearHabitTimerRuntimeState(habit);
    return session;
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

    const fab = document.getElementById('page-fab');
    if (fab) {
      fab.addEventListener('click', () => {
        const action = fab.getAttribute('data-action');
        if (action === 'add-habit') {
          if (typeof resetHabitFormForCreate === 'function') {
            resetHabitFormForCreate();
          }
          openModal('habit-modal');
        } else if (action === 'add-goal') {
          if (typeof resetGoalFormForCreate === 'function') {
            resetGoalFormForCreate();
          }
          openModal('goal-modal');
        }
      });
    }
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

    // Scroll to top on section change (important for mobile UX)
    window.scrollTo({ top: 0, behavior: 'smooth' });

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

    updatePageFab(sectionId);
  }

  function updatePageFab(sectionId) {
    const fab = document.getElementById('page-fab');
    if (!fab) return;
    if (sectionId === 'habits') {
      fab.hidden = false;
      fab.setAttribute('data-action', 'add-habit');
      fab.setAttribute('aria-label', 'Add habit');
    } else if (sectionId === 'goals') {
      fab.hidden = false;
      fab.setAttribute('data-action', 'add-goal');
      fab.setAttribute('aria-label', 'Add goal');
    } else {
      fab.hidden = true;
      fab.setAttribute('aria-label', 'Add item');
      fab.removeAttribute('data-action');
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

    const focusSummary = getDailyFocusSummary(today);
    const focusTodayEl = document.getElementById('metric-focus-today');
    const focusBestEl = document.getElementById('metric-focus-best');
    const focusBadgeEl = document.getElementById('focus-summary-badge');
    const focusNoteEl = document.getElementById('focus-summary-note');
    if (focusTodayEl) focusTodayEl.textContent = formatFocusDuration(focusSummary.totalSeconds);
    if (focusBestEl) focusBestEl.textContent = formatFocusDuration(focusSummary.bestSeconds);
    if (focusBadgeEl) focusBadgeEl.textContent = `${focusSummary.sessionCount} session${focusSummary.sessionCount === 1 ? '' : 's'}`;
    if (focusNoteEl) {
      focusNoteEl.textContent = focusSummary.sessionCount > 0
        ? `You focused ${formatFocusDuration(focusSummary.totalSeconds)} across ${focusSummary.sessionCount} session${focusSummary.sessionCount === 1 ? '' : 's'} today.`
        : 'No focus sessions logged yet.';
    }

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
      document.getElementById('empty-add-habit-btn').addEventListener('click', () => {
        resetHabitFormForCreate();
        openModal('habit-modal');
      });
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
          <div class="week-dot-mini ${dotClass}" data-date="${date}" title="${formatDateFriendly(date)}">
            ${dayLetter}
          </div>
        `;
      });

      card.innerHTML = `
        <div class="habit-header">
          <div class="habit-title-area">
            <span class="habit-card-title">${habit.name}</span>
            <span class="habit-meta">${habit.category || 'Personal'}${habit.linkedGoalId && getGoalTitle(habit.linkedGoalId) ? ' · 🎯 ' + getGoalTitle(habit.linkedGoalId) : ''}</span>
          </div>
          <div class="habit-actions">
            <button class="checkin-btn ${(habit.logs && habit.logs[today]) ? 'checked' : ''}" data-id="${habit.id}" title="Check in" aria-label="${(habit.logs && habit.logs[today]) ? 'Mark habit incomplete' : 'Mark habit complete'}: ${escapeAttribute(habit.name)}">
              ✓
            </button>
            <button class="action-icon-btn edit-btn" title="Edit habit" aria-label="Edit habit ${escapeAttribute(habit.name)}" data-id="${habit.id}">✎</button>
            <button class="action-icon-btn delete-btn" title="Delete habit" aria-label="Delete habit ${escapeAttribute(habit.name)}" data-id="${habit.id}">×</button>
          </div>
        </div>
        <div class="habit-compact-row">
          <div class="habit-stat-inline"><b>${habit.streak || 0}</b><span>d streak</span></div>
          <div class="habit-stat-inline"><b>${habit.maxStreak || 0}</b><span>best</span></div>
          <div class="habit-stat-inline"><b>${totalLogged}</b><span>total</span></div>
          <div class="habit-week-mini">
            ${weekDotsHtml}
          </div>
        </div>
        ${buildHabitTimerHtml(habit, today)}
      `;

      card.querySelectorAll('.week-dot-mini').forEach(dot => {
        const d = dot.getAttribute('data-date');
        if (d <= today) {
          dot.addEventListener('click', () => {
            toggleHabitCompletion(habit.id, d);
          });
        }
      });

      card.querySelector('.edit-btn').addEventListener('click', () => {
        openHabitEditor(habit.id);
      });

      const checkinBtn = card.querySelector('.checkin-btn');
      if (checkinBtn) {
        checkinBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleHabitCompletion(habit.id, today);
        });
      }

      const timerStartBtn = card.querySelector('.timer-start-btn');
      if (timerStartBtn) {
        timerStartBtn.addEventListener('click', () => {
          const remaining = Number(habit.timerRemainingSeconds);
          if (!habit.timerEndsAt && remaining > 0) {
            startHabitTimer(habit.id, { fromRemaining: true });
          } else {
            startHabitTimer(habit.id);
          }
        });
      }

      const timerPauseBtn = card.querySelector('.timer-pause-btn');
      if (timerPauseBtn) {
        timerPauseBtn.addEventListener('click', () => {
          if (habit.timerPaused) {
            startHabitTimer(habit.id, { fromRemaining: true });
          } else {
            pauseHabitTimer(habit.id);
          }
        });
      }

      const timerStopBtn = card.querySelector('.timer-stop-btn');
      if (timerStopBtn) {
        timerStopBtn.addEventListener('click', () => stopHabitTimer(habit.id));
      }

      const timerResetBtn = card.querySelector('.timer-reset-btn');
      if (timerResetBtn) {
        timerResetBtn.addEventListener('click', () => resetHabitTimer(habit.id));
      }

      card.querySelector('.delete-btn').addEventListener('click', async () => {
        const approved = await confirmAction({
          title: 'Delete habit?',
          message: 'Are you sure you want to delete this habit? All log history will be deleted.',
          confirmText: 'Delete habit'
        });
        if (approved) {
          deleteHabit(habit.id);
          showToast('Habit deleted.', 'success');
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
      document.getElementById('empty-add-goal-btn').addEventListener('click', () => {
        resetGoalFormForCreate();
        openModal('goal-modal');
      });
      return;
    }

    appData.goals.forEach(goal => {
      const card = document.createElement('div');
      card.className = 'card goal-card';
      
      const milestones = Array.isArray(goal.milestones) ? goal.milestones : [];
      const totalMilestones = milestones.length;
      const completedMilestones = milestones.filter(m => m.completed).length;
      
      let progressPercent = 0;
      if (totalMilestones > 0) {
        progressPercent = Math.round((completedMilestones / totalMilestones) * 100);
      } else if (goal.status === 'completed') {
        progressPercent = 100;
      }

      const today = getTodayStr();
      const isOverdue = goal.targetDate < today && goal.status !== 'completed';
      const linkedHabits = appData.habits.filter(h => h.linkedGoalId === goal.id);
      const linkedHabitsHtml = linkedHabits.length > 0
        ? linkedHabits.map(h => {
            const doneToday = h.logs && h.logs[today];
            return `<div class="linked-routine-item ${doneToday ? 'completed' : ''}">
              <span>${doneToday ? '✅' : '⬜'} ${h.name}</span>
              <span>${h.streak || 0}d streak</span>
            </div>`;
          }).join('')
        : '<div class="linked-routine-empty">No linked routines yet</div>';

      let milestonesHtml = '';
      milestones.forEach(m => {
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
            <div class="goal-badges">
              <span class="badge ${goal.status === 'completed' ? 'badge-success' : 'badge-primary'}">${goal.status}</span>
              <span class="badge badge-secondary">${goal.category || 'General'}</span>
              ${isOverdue ? '<span class="badge badge-danger">Overdue</span>' : ''}
            </div>
            <span class="goal-card-title">${goal.title}</span>
          </div>
          <div class="goal-actions">
            <button class="checkin-btn ${goal.status === 'completed' ? 'checked' : ''}" data-id="${goal.id}" title="${goal.status === 'completed' ? 'Reopen' : 'Complete'}" aria-label="${goal.status === 'completed' ? 'Reopen goal' : 'Complete goal'}: ${escapeAttribute(goal.title)}">
              ${goal.status === 'completed' ? '↺' : '✓'}
            </button>
            <button class="action-icon-btn edit-btn" title="Edit goal" aria-label="Edit goal ${escapeAttribute(goal.title)}" data-id="${goal.id}">✎</button>
            <button class="action-icon-btn delete-btn" title="Delete goal" aria-label="Delete goal ${escapeAttribute(goal.title)}" data-id="${goal.id}">×</button>
          </div>
        </div>

        <div class="goal-progress-section">
          <div class="progress-bar-bg thin">
            <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
          </div>
          <div class="goal-progress-meta">
            <span>${completedMilestones}/${totalMilestones} milestones${totalMilestones > 0 ? ' · ' + progressPercent + '%' : ''}</span>
            <span>📅 ${goal.targetDate || 'No limit'}</span>
          </div>
        </div>

        ${linkedHabits.length > 0 ? `
          <div class="goal-routines-mini">
            ${linkedHabits.map(h => {
              const doneToday = h.logs && h.logs[today];
              return `<span class="routine-pill ${doneToday ? 'done' : ''}">${doneToday ? '✓' : '○'} ${h.name}</span>`;
            }).join('')}
          </div>
        ` : ''}

        ${totalMilestones > 0 ? `
          <div class="goal-milestones-mini">
            ${milestones.map(m => `<span class="milestone-pill ${m.completed ? 'done' : ''}" data-milestone-id="${m.id}" data-goal-id="${goal.id}">${m.completed ? '✓' : '○'} ${m.title}</span>`).join('')}
          </div>
        ` : ''}
      `;

      card.querySelectorAll('.milestone-pill').forEach(el => {
        el.addEventListener('click', () => {
          const mId = el.getAttribute('data-milestone-id');
          toggleMilestone(goal.id, mId);
        });
      });

      const goalCheckinBtn = card.querySelector('.goal-actions .checkin-btn');
      if (goalCheckinBtn) {
        goalCheckinBtn.addEventListener('click', () => {
          completeGoal(goal.id);
        });
      }

      card.querySelector('.edit-btn').addEventListener('click', () => {
        openGoalEditor(goal.id);
      });

      card.querySelector('.delete-btn').addEventListener('click', async () => {
        const approved = await confirmAction({
          title: 'Delete goal?',
          message: 'Are you sure you want to delete this goal and its milestones?',
          confirmText: 'Delete goal'
        });
        if (approved) {
          deleteGoal(goal.id);
          showToast('Goal deleted.', 'success');
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

  function requestTimerNotificationPermission() {
    if (!('Notification' in window)) return Promise.resolve('unsupported');
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    if (Notification.permission === 'denied') return Promise.resolve('denied');
    return Notification.requestPermission();
  }

  function notifyTimerComplete(habit) {
    const message = `${habit.name} is complete. Nice work!`;
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Timer complete', { body: message });
    }
    showToast(`Timer complete: ${habit.name}`, 'success', { duration: 5000 });
  }

  function refreshTimerViews() {
    const activeSection = document.querySelector('.page-section.active')?.id;
    if (activeSection === 'habits-section') renderHabits();
    if (activeSection === 'dashboard-section') renderDashboard();
  }

  function updateHabitTimerDisplay() {
    if (!Array.isArray(appData.habits)) return;
    appData.habits.forEach(habit => {
      if (!isTimedHabit(habit)) return;
      const node = document.querySelector(`[data-timer-habit-id="${habit.id}"]`);
      if (!node) return;
      const completedToday = !!(habit.logs && habit.logs[getTodayStr()]);
      if (habit.timerEndsAt) {
        const remaining = getRunningTimerRemainingSeconds(habit);
        const isPaused = !!habit.timerPaused;
        node.textContent = isPaused
          ? `Paused · ${formatTimer(remaining)} left`
          : `Running · ${formatTimer(remaining)} left`;
      } else if (habit.timerRemainingSeconds != null) {
        node.textContent = `Paused · ${formatTimer(habit.timerRemainingSeconds)} left`;
      } else if (completedToday) {
        node.textContent = 'Completed today';
      } else {
        const durationMinutes = getHabitDurationMinutes(habit);
        node.textContent = `${Number(durationMinutes.toFixed(2))} min focus timer`;
      }
    });
  }

  function completeTimedHabit(habit, shouldNotify = true) {
    finalizeHabitTimerSession(habit, 'completed');
    if (!habit.logs) habit.logs = {};
    habit.logs[getTodayStr()] = true;
    habit.updatedAt = new Date().toISOString();
    saveAndSync();
    updateAllStreaks();
    if (shouldNotify) notifyTimerComplete(habit);
    refreshTimerViews();
  }

  function checkHabitTimers() {
    let changed = false;
    appData.habits.forEach(habit => {
      if (habit.timerEndsAt && !habit.timerPaused && Date.now() >= new Date(habit.timerEndsAt).getTime()) {
        completeTimedHabit(habit, true);
        changed = true;
      }
    });
    if (changed) refreshTimerViews();
    else updateHabitTimerDisplay();
  }

  function setupHabitTimerRuntime() {
    checkHabitTimers();
    clearInterval(habitTimerInterval);
    habitTimerInterval = setInterval(checkHabitTimers, 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkHabitTimers();
    });
    window.addEventListener('focus', checkHabitTimers);
  }

  async function startHabitTimer(habitId, { fromRemaining = false } = {}) {
    const habit = appData.habits.find(h => h.id === habitId);
    if (!habit) return;
    await requestTimerNotificationPermission();
    habit.habitType = 'timer';
    habit.timerMinutes = getHabitDurationMinutes(habit);
    let durationSeconds;
    if (fromRemaining && Number(habit.timerRemainingSeconds) > 0) {
      durationSeconds = Math.max(1, Math.round(habit.timerRemainingSeconds));
    } else {
      durationSeconds = Math.max(1, Math.round(getHabitDurationMinutes(habit) * 60));
      habit.timerElapsedSeconds = 0;
      habit.timerSessionStartedAt = null;
    }
    const now = Date.now();
    if (!fromRemaining || !habit.timerSessionStartedAt) {
      habit.timerSessionStartedAt = new Date(now).toISOString();
    }
    habit.timerPlannedSeconds = Math.max(1, Math.round(getHabitDurationMinutes(habit) * 60));
    habit.timerStartedAt = new Date(now).toISOString();
    habit.timerEndsAt = new Date(now + durationSeconds * 1000).toISOString();
    habit.timerDurationSeconds = habit.timerPlannedSeconds;
    delete habit.timerPaused;
    delete habit.timerRemainingSeconds;
    habit.updatedAt = new Date().toISOString();
    saveAndSync();
    renderHabits();
  }

  function pauseHabitTimer(habitId) {
    const habit = appData.habits.find(h => h.id === habitId);
    if (!habit || !habit.timerEndsAt || habit.timerPaused) return;
    const remaining = getRunningTimerRemainingSeconds(habit);
    habit.timerElapsedSeconds = getHabitElapsedSeconds(habit);
    habit.timerRemainingSeconds = remaining;
    habit.timerPaused = true;
    delete habit.timerStartedAt;
    delete habit.timerEndsAt;
    habit.updatedAt = new Date().toISOString();
    saveAndSync();
    renderHabits();
  }

  function stopHabitTimer(habitId) {
    const habit = appData.habits.find(h => h.id === habitId);
    if (!habit) return;
    finalizeHabitTimerSession(habit, 'stopped');
    habit.updatedAt = new Date().toISOString();
    saveAndSync();
    renderHabits();
  }

  function resetHabitTimer(habitId) {
    const habit = appData.habits.find(h => h.id === habitId);
    if (!habit) return;
    finalizeHabitTimerSession(habit, 'stopped');
    habit.updatedAt = new Date().toISOString();
    saveAndSync();
    renderHabits();
  }

  function buildHabitTimerHtml(habit, today) {
    if (!isTimedHabit(habit)) return '';
    const completedToday = !!(habit.logs && habit.logs[today]);
    const isRunning = !!habit.timerEndsAt;
    const isPaused = !!habit.timerPaused;
    const isHeld = isPaused || (habit.timerRemainingSeconds != null && !isRunning);
    const remaining = isRunning
      ? getRunningTimerRemainingSeconds(habit)
      : (Number(habit.timerRemainingSeconds) || 0);
    const durationMinutes = getHabitDurationMinutes(habit);
    const todayFocusSeconds = getHabitFocusSecondsForDate(habit, today);
    const lastSession = getHabitLastTimerSession(habit);
    const sessionSummaryParts = [];
    if (todayFocusSeconds > 0) sessionSummaryParts.push(`Today ${formatFocusDuration(todayFocusSeconds)}`);
    if (lastSession) sessionSummaryParts.push(`Last ${formatFocusDuration(lastSession.actualSeconds)} ${formatTimerSessionStatus(lastSession.status)}`);
    const sessionSummaryHtml = sessionSummaryParts.length > 0
      ? `<div class="habit-timer-session-summary">${sessionSummaryParts.join(' • ')}</div>`
      : '';
    const statusText = isRunning
      ? (isPaused ? `Paused · ${formatTimer(remaining)} left` : `Running · ${formatTimer(remaining)} left`)
      : isHeld
        ? `Paused · ${formatTimer(remaining)} left`
        : completedToday
          ? 'Completed today'
          : `${Number(durationMinutes.toFixed(2))} min focus timer`;
    const startLabel = isRunning
      ? (isPaused ? 'Resume' : 'Running…')
      : isHeld
        ? 'Resume'
        : completedToday
          ? 'Start again'
          : 'Start timer';
    return `
      <div class="habit-timer-panel ${isRunning ? (isPaused ? 'paused' : 'running') : (isHeld ? 'paused' : '')} ${completedToday ? 'completed' : ''}">
        <div class="habit-timer-meta">
          <span class="habit-timer-label">Timer</span>
          <span class="habit-timer-time" data-timer-habit-id="${habit.id}">${statusText}</span>
        </div>
        <div class="habit-timer-actions">
          <button class="btn btn-primary timer-start-btn" data-id="${habit.id}" aria-label="${startLabel} timer for ${escapeAttribute(habit.name)}">${startLabel}</button>
          ${isRunning || isHeld ? `<button class="btn btn-secondary timer-pause-btn" data-id="${habit.id}" aria-label="${isRunning && !isPaused ? 'Pause' : 'Resume'} timer for ${escapeAttribute(habit.name)}">${isRunning && !isPaused ? 'Pause' : 'Resume'}</button>` : ''}
          ${isRunning || isHeld ? `<button class="btn btn-ghost timer-stop-btn" data-id="${habit.id}" aria-label="Stop timer for ${escapeAttribute(habit.name)}">Stop</button>` : ''}
          ${isRunning || isHeld ? `<button class="btn btn-ghost timer-reset-btn" data-id="${habit.id}" aria-label="Reset timer for ${escapeAttribute(habit.name)}">Reset</button>` : ''}
        </div>
        ${sessionSummaryHtml}
      </div>
    `;
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

    if (goal.status === 'completed') {
      goal.status = 'active';
    } else {
      goal.status = 'completed';
      if (Array.isArray(goal.milestones)) {
        goal.milestones.forEach(m => m.completed = true);
      }
    }

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
      modal.setAttribute('aria-hidden', 'false');
      syncBodyScrollLock();
    }
  }

  function setHabitModalMode(mode) {
    const title = document.querySelector('#habit-modal .modal-title');
    const submitBtn = document.querySelector('#habit-form button[type="submit"]');
    if (title) title.textContent = mode === 'edit' ? 'Edit Habit' : 'Define New Habit';
    if (submitBtn) submitBtn.textContent = mode === 'edit' ? 'Save Habit' : 'Create Habit';
  }

  function setGoalModalMode(mode) {
    const title = document.querySelector('#goal-modal .modal-title');
    const submitBtn = document.querySelector('#goal-form button[type="submit"]');
    if (title) title.textContent = mode === 'edit' ? 'Edit Goal' : 'Set New Goal';
    if (submitBtn) submitBtn.textContent = mode === 'edit' ? 'Save Goal' : 'Create Goal';
  }

  function escapeAttribute(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function getGoalTitle(goalId) {
    const goal = appData.goals.find(g => g.id === goalId);
    return goal ? goal.title : '';
  }

  function populateHabitGoalSelect(selectedGoalId = '') {
    const select = document.getElementById('habit-goal-link-input');
    if (!select) return;
    const options = ['<option value="">No linked goal</option>'].concat(
      appData.goals.map(goal => `<option value="${escapeAttribute(goal.id)}">${escapeAttribute(goal.title)}</option>`)
    );
    select.innerHTML = options.join('');
    select.value = selectedGoalId || '';
  }

  function updateHabitDurationVisibility() {
    const typeInput = document.getElementById('habit-type-input');
    const durationGroup = document.getElementById('habit-duration-group');
    if (!typeInput || !durationGroup) return;
    durationGroup.style.display = typeInput.value === 'timer' ? 'block' : 'none';
  }

  function resetHabitFormForCreate() {
    editingHabitId = null;
    const form = document.getElementById('habit-form');
    if (form) form.reset();
    populateHabitGoalSelect('');
    const typeInput = document.getElementById('habit-type-input');
    const durationInput = document.getElementById('habit-duration-input');
    if (typeInput) typeInput.value = 'checkin';
    if (durationInput) durationInput.value = 60;
    updateHabitDurationVisibility();
    setHabitModalMode('create');
  }

  function resetGoalFormForCreate() {
    editingGoalId = null;
    const form = document.getElementById('goal-form');
    if (form) form.reset();
    const container = document.getElementById('milestone-inputs-container');
    if (container) {
      container.innerHTML = `
        <input type="text" class="form-control milestone-input-field" placeholder="Milestone 1 title" style="margin-bottom:8px;">
      `;
    }
    setGoalModalMode('create');
  }

  function openHabitEditor(habitId) {
    const habit = appData.habits.find(h => h.id === habitId);
    if (!habit) return;
    editingHabitId = habitId;
    document.getElementById('habit-name-input').value = habit.name || '';
    document.getElementById('habit-category-input').value = habit.category || '';
    populateHabitGoalSelect(habit.linkedGoalId || '');
    const typeInput = document.getElementById('habit-type-input');
    const durationInput = document.getElementById('habit-duration-input');
    if (typeInput) typeInput.value = isTimedHabit(habit) ? 'timer' : 'checkin';
    if (durationInput) durationInput.value = getHabitDurationMinutes(habit);
    updateHabitDurationVisibility();
    setHabitModalMode('edit');
    openModal('habit-modal');
  }

  function openGoalEditor(goalId) {
    const goal = appData.goals.find(g => g.id === goalId);
    if (!goal) return;
    editingGoalId = goalId;
    document.getElementById('goal-title-input').value = goal.title || '';
    document.getElementById('goal-desc-input').value = goal.description || '';
    document.getElementById('goal-category-input').value = goal.category || '';
    document.getElementById('goal-date-input').value = goal.targetDate || '';

    const container = document.getElementById('milestone-inputs-container');
    const milestones = Array.isArray(goal.milestones) ? goal.milestones : [];
    if (container) {
      container.innerHTML = milestones.length > 0
        ? milestones.map((m, index) => `
          <input type="text" class="form-control milestone-input-field" data-existing-id="${escapeAttribute(m.id)}" data-completed="${m.completed ? 'true' : 'false'}" value="${escapeAttribute(m.title)}" placeholder="Milestone ${index + 1} title" style="margin-bottom:8px;">
        `).join('')
        : `<input type="text" class="form-control milestone-input-field" placeholder="Milestone 1 title" style="margin-bottom:8px;">`;
    }

    setGoalModalMode('edit');
    openModal('goal-modal');
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
      if (id === 'habit-modal') {
        editingHabitId = null;
        setHabitModalMode('create');
      }
      if (id === 'goal-modal') {
        editingGoalId = null;
        setGoalModalMode('create');
      }
      if (id === 'confirm-modal') {
        resolveConfirm(false);
      }
      syncBodyScrollLock();
    }
  }

  function setupEventListeners() {
    // 1. Sidebar Profile tap -> Opens Login modal if Guest
    const profileCard = document.getElementById('sidebar-profile-card');
    if (profileCard) {
      profileCard.addEventListener('click', () => {
        const isConfigured = window.AscendStorage.isFirebaseConfigured();
        if (!isConfigured) {
          showToast('Please configure your Firebase database in Settings first.', 'warning');
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
      addHabitBtn.addEventListener('click', () => {
        resetHabitFormForCreate();
        openModal('habit-modal');
      });
    }

    const habitForm = document.getElementById('habit-form');
    const habitTypeInput = document.getElementById('habit-type-input');
    if (habitTypeInput) {
      habitTypeInput.addEventListener('change', updateHabitDurationVisibility);
      updateHabitDurationVisibility();
    }
    if (habitForm) {
      habitForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('habit-name-input').value;
        const category = document.getElementById('habit-category-input').value;
        const linkedGoalId = document.getElementById('habit-goal-link-input').value;
        const habitType = document.getElementById('habit-type-input').value;
        const timerMinutes = Math.max(0.01, Number(document.getElementById('habit-duration-input').value) || 60);
        
        if (!name) return;

        if (editingHabitId) {
          const habit = appData.habits.find(h => h.id === editingHabitId);
          if (!habit) return;
          habit.name = name;
          habit.category = category || 'Personal';
          habit.linkedGoalId = linkedGoalId;
          habit.habitType = habitType;
          if (habitType === 'timer') {
            habit.timerMinutes = timerMinutes;
          } else {
            delete habit.timerMinutes;
            clearHabitTimerRuntimeState(habit);
          }
          habit.updatedAt = new Date().toISOString();
          editingHabitId = null;
        } else {
          const newHabit = {
            id: 'h_' + Date.now(),
            name: name,
            category: category || 'Personal',
            linkedGoalId: linkedGoalId,
            habitType: habitType,
            ...(habitType === 'timer' ? { timerMinutes: timerMinutes } : {}),
            streak: 0,
            maxStreak: 0,
            logs: {},
            timerSessions: [],
            createdAt: new Date().toISOString()
          };

          appData.habits.push(newHabit);
        }

        saveAndSync();
        updateAllStreaks();
        
        habitForm.reset();
        setHabitModalMode('create');
        closeModal('habit-modal');
        renderHabits();
      });
    }

    // 3. Goals Actions
    const addGoalBtn = document.getElementById('add-goal-btn');
    if (addGoalBtn) {
      addGoalBtn.addEventListener('click', () => {
        resetGoalFormForCreate();
        openModal('goal-modal');
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
              id: input.dataset.existingId || `m_${Date.now()}_${index}`,
              title: input.value.trim(),
              completed: input.dataset.completed === 'true'
            });
          }
        });

        if (editingGoalId) {
          const goal = appData.goals.find(g => g.id === editingGoalId);
          if (!goal) return;
          goal.title = title;
          goal.description = desc;
          goal.category = category || 'General';
          goal.targetDate = deadline || '';
          goal.milestones = milestones;
          goal.updatedAt = new Date().toISOString();
          editingGoalId = null;
        } else {
          const newGoal = {
            id: 'g_' + Date.now(),
            title: title,
            description: desc,
            category: category || 'General',
            status: 'active',
            targetDate: deadline || '',
            milestones: milestones,
            createdAt: new Date().toISOString()
          };

          appData.goals.push(newGoal);
        }

        saveAndSync();
        
        goalForm.reset();
        setGoalModalMode('create');
        closeModal('goal-modal');
        renderGoals();
      });
    }

    // Modal close triggers
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const overlay = btn.closest('.modal-overlay');
        if (overlay?.id) closeModal(overlay.id);
      });
    });

    // Tap outside modal to close (mobile-friendly UX)
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          closeModal(overlay.id);
        }
      });
    });

    const confirmApproveBtn = document.getElementById('confirm-approve-btn');
    if (confirmApproveBtn) {
      confirmApproveBtn.addEventListener('click', () => {
        resolveConfirm(true);
        closeModal('confirm-modal');
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const activeModal = document.querySelector('.modal-overlay.active');
        if (activeModal?.id) closeModal(activeModal.id);
      }
    });

    // 4. Profile Settings Form
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        appData.profile.name = document.getElementById('profile-name-input').value.trim() || 'Achiever';
        appData.profile.title = document.getElementById('profile-title-input').value.trim() || 'Growth';
        
        saveAndSync();
        showToast('Profile saved successfully.', 'success');
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
          showToast(result.message, 'success', { duration: 1200 });
          setTimeout(() => window.location.reload(), 700);
        } else {
          showToast(result.error, 'error', { duration: 5200 });
        }
      });
    }

    const clearFbBtn = document.getElementById('clear-firebase-btn');
    if (clearFbBtn) {
      clearFbBtn.addEventListener('click', async () => {
        const approved = await confirmAction({
          title: 'Disconnect Firebase?',
          message: 'Disconnect Firebase cloud sync? You will return to Guest offline mode.',
          confirmText: 'Disconnect'
        });
        if (approved) {
          window.AscendStorage.saveFirebaseConfig('');
          showToast('Firebase disconnected. Reloading...', 'success', { duration: 1200 });
          setTimeout(() => window.location.reload(), 700);
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
        const approved = await confirmAction({
          title: 'Log out?',
          message: 'Log out from your Cloud Sync Account?',
          confirmText: 'Log out'
        });
        if (approved) {
          await window.AscendStorage.logout();
          showToast('Logged out. Returning to local guest database.', 'success', { duration: 1200 });
          setTimeout(() => window.location.reload(), 700);
        }
      });
    }

    const generateApiTokenBtn = document.getElementById('generate-api-token-btn');
    if (generateApiTokenBtn) {
      generateApiTokenBtn.addEventListener('click', async () => {
        const statusEl = document.getElementById('firestore-sync-status');
        const panel = document.getElementById('api-token-panel');
        const output = document.getElementById('api-token-output');
        const user = firebase.auth().currentUser;

        if (!user) {
          if (statusEl) {
            statusEl.className = 'sync-status error';
            statusEl.textContent = 'Please sign in before generating an API token.';
          }
          return;
        }

        generateApiTokenBtn.disabled = true;
        generateApiTokenBtn.textContent = 'Generating...';

        try {
          const firebaseConfig = JSON.parse(window.AscendStorage.getFirebaseConfig());
          const idToken = await user.getIdToken(true);
          const payload = window.AscendApiToken.buildTemporaryApiTokenPayload({
            uid: user.uid,
            email: user.email,
            idToken,
            projectId: firebaseConfig.projectId
          });

          output.value = window.AscendApiToken.formatTemporaryApiTokenForCopy(payload);
          panel.style.display = 'block';
          if (statusEl) {
            statusEl.className = 'sync-status success';
            statusEl.textContent = `✓ Temporary API token generated. Expires at ${new Date(payload.expiresAt).toLocaleTimeString()}.`;
          }
        } catch (err) {
          if (statusEl) {
            statusEl.className = 'sync-status error';
            statusEl.textContent = `✗ API token generation failed: ${err.message}`;
          }
        } finally {
          generateApiTokenBtn.disabled = false;
          generateApiTokenBtn.textContent = 'Generate API Token';
        }
      });
    }

    const copyApiTokenBtn = document.getElementById('copy-api-token-btn');
    if (copyApiTokenBtn) {
      copyApiTokenBtn.addEventListener('click', async () => {
        const output = document.getElementById('api-token-output');
        if (!output || !output.value) return;

        try {
          await navigator.clipboard.writeText(output.value);
          copyApiTokenBtn.textContent = 'Copied!';
          showToast('Temporary API token copied.', 'success');
          setTimeout(() => { copyApiTokenBtn.textContent = 'Copy API Token'; }, 1200);
        } catch (err) {
          output.select();
          document.execCommand('copy');
          copyApiTokenBtn.textContent = 'Copied!';
          showToast('Temporary API token copied.', 'success');
          setTimeout(() => { copyApiTokenBtn.textContent = 'Copy API Token'; }, 1200);
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
          showToast('Successfully synced with your Firebase Firestore cloud account!', 'success');
        } else {
          showToast('Sync failed: ' + res.error, 'error', { duration: 5200 });
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
            showToast('Welcome back! Successfully logged in.', 'success');
          } else {
            await window.AscendStorage.registerEmail(email, password);
            showToast('Welcome! Your account has been registered successfully.', 'success');
          }
          closeModal('auth-modal');
        } catch (err) {
          showToast('Authentication error: ' + err.message, 'error', { duration: 5200 });
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
        showToast('Backup export started.', 'success');
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
            showToast('Backup data successfully imported!', 'success');
            updateAllStreaks();
            navigate('dashboard');
          } else {
            showToast(`Import failed: ${result.error}`, 'error', { duration: 5200 });
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
