// Ascend Application Controller
document.addEventListener('DOMContentLoaded', () => {
  // --- STATE ---
  let appData = {
    profile: { name: 'User', title: 'Self Improvement' },
    habits: [],
    goals: [],
    journal: [],
    settings: { githubToken: '', gistId: '', autoSync: false }
  };

  // Current active journal entry date
  let selectedJournalDate = getTodayStr();

  // --- INIT ---
  function init() {
    appData = window.AscendStorage.load();
    setupRouting();
    setupEventListeners();
    
    // Auto populate settings inputs
    populateSettingsForm();
    
    // Check for daily reset
    checkDailyReset();
    
    // Render current view
    navigate('dashboard');
  }

  // --- DATE HELPERS ---
  function getTodayStr() {
    // Return local date string YYYY-MM-DD
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
    const day = today.getDay(); // 0 is Sun, 1 is Mon...
    // Adjust Sunday to be 7, Monday to be 1
    const dayAdjusted = day === 0 ? 7 : day;
    const diff = today.getDate() - dayAdjusted + 1; // start from Monday
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
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.getAttribute('data-section') === sectionId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Toggle active section
    document.querySelectorAll('.page-section').forEach(section => {
      if (section.id === `${sectionId}-section`) {
        section.classList.add('active');
      } else {
        section.classList.remove('active');
      }
    });

    // Render logic per view
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
    
    // If completed today, count it
    if (logs[checkDate]) {
      streak++;
    } else {
      // If not completed today, check if yesterday was completed to maintain streak
      checkDate = getPreviousDateStr(todayStr);
      if (!logs[checkDate]) {
        return 0; // Streak broken
      }
      streak++;
    }

    // Keep checking backwards
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
    window.AscendStorage.save(appData);
  }

  // Check if daily reset is needed (tab was left open)
  let lastCheckedDate = getTodayStr();
  function checkDailyReset() {
    const today = getTodayStr();
    if (today !== lastCheckedDate) {
      lastCheckedDate = today;
      updateAllStreaks();
      // Auto save journal log template if none exists
      ensureTodayJournalLog();
      if (document.getElementById('dashboard-section').classList.contains('active')) {
        renderDashboard();
      }
    }
  }
  // Check reset every 30 seconds
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
      window.AscendStorage.save(appData);
    }
  }

  // --- RENDER FUNCTIONS ---

  // 1. Dashboard
  function renderDashboard() {
    const today = getTodayStr();
    
    // Update user profile info in sidebar
    document.querySelector('.profile-name').textContent = appData.profile.name || 'Achiever';
    document.querySelector('.profile-title').textContent = appData.profile.title || 'Growth Mode';
    document.querySelector('.avatar').textContent = (appData.profile.name || 'U').substring(0, 2).toUpperCase();
    
    // Update Greeting & Date
    document.getElementById('dash-date').textContent = formatDateFriendly(today);
    document.getElementById('user-greeting').textContent = `Keep going, ${appData.profile.name || 'Achiever'}!`;

    // Metrics calculation
    const totalHabits = appData.habits.length;
    let completedHabits = 0;
    appData.habits.forEach(h => {
      if (h.logs && h.logs[today]) completedHabits++;
    });

    const completionRate = totalHabits > 0 ? Math.round((completedHabits / totalHabits) * 100) : 0;
    
    // Active Goals
    const activeGoals = appData.goals.filter(g => g.status === 'active').length;

    // Highest Streak
    let highestStreak = 0;
    appData.habits.forEach(h => {
      if (h.streak > highestStreak) highestStreak = h.streak;
    });

    // Update metric numbers
    document.getElementById('metric-habits-rate').textContent = `${completionRate}%`;
    document.getElementById('metric-goals-active').textContent = activeGoals;
    document.getElementById('metric-highest-streak').textContent = `${highestStreak} days`;

    // Render SVG Progress Ring
    const circle = document.getElementById('dash-progress-circle');
    if (circle) {
      const radius = 60;
      const circumference = 2 * Math.PI * radius;
      circle.style.strokeDasharray = `${circumference} ${circumference}`;
      const offset = circumference - (completionRate / 100) * circumference;
      circle.style.strokeDashoffset = offset;
      document.getElementById('dash-progress-text').textContent = `${completionRate}%`;
    }

    // Render Quick Habit Checklist
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

      // Handle quick toggle
      div.querySelector('.checkbox-custom').addEventListener('click', () => {
        toggleHabitCompletion(habit.id, today);
      });

      quickListContainer.appendChild(div);
    });

    // Render Quick Mood Selector
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

      // Add click handler
      btn.onclick = () => {
        moodBtns.forEach(b => b.classList.remove('active'));
        if (todayJournal) {
          if (todayJournal.mood === moodVal) {
            todayJournal.mood = ''; // Toggle off
          } else {
            todayJournal.mood = moodVal;
            btn.classList.add('active');
          }
          window.AscendStorage.save(appData);
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
      
      // Calculate completion %
      const totalLogged = Object.keys(habit.logs || {}).filter(k => habit.logs[k]).length;
      
      // Generate week dots
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

      // Event listeners for week dots
      card.querySelectorAll('.week-day-dot').forEach(dot => {
        const d = dot.getAttribute('data-date');
        if (d <= today) {
          dot.addEventListener('click', () => {
            toggleHabitCompletion(habit.id, d);
          });
        }
      });

      // Event listener for delete
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
      
      // Calculate progress
      const totalMilestones = goal.milestones.length;
      const completedMilestones = goal.milestones.filter(m => m.completed).length;
      
      let progressPercent = 0;
      if (totalMilestones > 0) {
        progressPercent = Math.round((completedMilestones / totalMilestones) * 100);
      } else if (goal.status === 'completed') {
        progressPercent = 100;
      }

      // Check if goal deadline is overdue
      const today = getTodayStr();
      const isOverdue = goal.targetDate < today && goal.status !== 'completed';

      // Milestones html list
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

      // Event listener for milestones checkbox
      card.querySelectorAll('.milestone-item').forEach(el => {
        el.addEventListener('click', () => {
          const mId = el.getAttribute('data-milestone-id');
          toggleMilestone(goal.id, mId);
        });
      });

      // Event listener for complete entire goal button
      const completeBtn = card.querySelector(`#complete-goal-btn-${goal.id}`);
      if (completeBtn) {
        completeBtn.addEventListener('click', () => {
          completeGoal(goal.id);
        });
      }

      // Event listener for delete goal
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

    // Sort entries newest first
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

    // Populate active editor card
    let activeEntry = appData.journal.find(j => j.date === selectedJournalDate);
    if (!activeEntry) {
      activeEntry = { date: selectedJournalDate, mood: '', content: '' };
    }

    document.getElementById('editor-date').textContent = formatDateFriendly(selectedJournalDate);
    const textarea = document.getElementById('journal-editor-textarea');
    textarea.value = activeEntry.content || '';

    // Setup mood selector buttons in editor
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
        
        // Auto-save entry state
        saveCurrentJournalState(activeEntry);
      };
    });

    // Handle typing auto-save
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
    window.AscendStorage.save(appData);
    
    // Partially update historical preview card text on the sidebar
    // to avoid full re-render flickering
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

  // Toggling habits completion
  function toggleHabitCompletion(habitId, dateStr) {
    const habit = appData.habits.find(h => h.id === habitId);
    if (!habit) return;

    if (!habit.logs) habit.logs = {};
    
    // Toggle completion log
    habit.logs[dateStr] = !habit.logs[dateStr];
    
    // Save, update streaks, and re-render
    window.AscendStorage.save(appData);
    updateAllStreaks();

    const activeSection = document.querySelector('.page-section.active').id;
    if (activeSection === 'dashboard-section') {
      renderDashboard();
    } else if (activeSection === 'habits-section') {
      renderHabits();
    }
  }

  // Toggling goal milestones
  function toggleMilestone(goalId, milestoneId) {
    const goal = appData.goals.find(g => g.id === goalId);
    if (!goal) return;

    const milestone = goal.milestones.find(m => m.id === milestoneId);
    if (!milestone) return;

    milestone.completed = !milestone.completed;

    // If all milestones completed, ask to mark goal as complete
    const allCompleted = goal.milestones.every(m => m.completed);
    if (allCompleted && goal.status !== 'completed') {
      goal.status = 'completed';
    } else if (!allCompleted && goal.status === 'completed') {
      goal.status = 'active'; // revert back
    }

    window.AscendStorage.save(appData);
    renderGoals();
  }

  function completeGoal(goalId) {
    const goal = appData.goals.find(g => g.id === goalId);
    if (!goal) return;

    goal.status = 'completed';
    // Complete all milestones
    goal.milestones.forEach(m => m.completed = true);

    window.AscendStorage.save(appData);
    renderGoals();
  }

  function deleteHabit(habitId) {
    appData.habits = appData.habits.filter(h => h.id !== habitId);
    window.AscendStorage.save(appData);
    renderHabits();
  }

  function deleteGoal(goalId) {
    appData.goals = appData.goals.filter(g => g.id !== goalId);
    window.AscendStorage.save(appData);
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
    // Habits Actions
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
        window.AscendStorage.save(appData);
        updateAllStreaks();
        
        habitForm.reset();
        closeModal('habit-modal');
        renderHabits();
      });
    }

    // Goals Actions
    const addGoalBtn = document.getElementById('add-goal-btn');
    if (addGoalBtn) {
      addGoalBtn.addEventListener('click', () => {
        openModal('goal-modal');
        // Clear dynamically added milestones inputs
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

        // Gather milestones
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
        window.AscendStorage.save(appData);
        
        goalForm.reset();
        closeModal('goal-modal');
        renderGoals();
      });
    }

    // Modal Close Triggers
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        closeModal('habit-modal');
        closeModal('goal-modal');
      });
    });

    // Profile Settings Form
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        appData.profile.name = document.getElementById('profile-name-input').value.trim() || 'Achiever';
        appData.profile.title = document.getElementById('profile-title-input').value.trim() || 'Growth';
        
        window.AscendStorage.save(appData);
        alert('Profile saved successfully!');
        
        // Render to apply profile changes in UI sidebar
        renderDashboard();
      });
    }

    // JSON Import/Export Actions
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

    // GitHub Gist Settings Form
    const syncForm = document.getElementById('sync-form');
    if (syncForm) {
      syncForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        appData.settings.githubToken = document.getElementById('github-token-input').value.trim();
        appData.settings.gistId = document.getElementById('gist-id-input').value.trim();
        appData.settings.autoSync = document.getElementById('auto-sync-checkbox').checked;

        window.AscendStorage.save(appData);
        alert('Sync settings saved.');
      });
    }

    // Sync Now Trigger
    const syncNowBtn = document.getElementById('sync-now-btn');
    const syncStatusEl = document.getElementById('sync-status-msg');

    if (syncNowBtn) {
      syncNowBtn.addEventListener('click', async () => {
        syncNowBtn.disabled = true;
        syncNowBtn.textContent = 'Syncing...';
        syncStatusEl.className = 'sync-status';
        syncStatusEl.textContent = 'Contacting GitHub...';

        const result = await window.AscendStorage.syncWithGist(appData);
        syncNowBtn.disabled = false;
        syncNowBtn.textContent = 'Sync Now';

        if (result.success) {
          syncStatusEl.className = 'sync-status success';
          syncStatusEl.textContent = `✓ Synced successfully! ${result.gistId ? 'Gist Created: ' + result.gistId : 'Gist Updated'}`;
          document.getElementById('gist-id-input').value = appData.settings.gistId;
        } else {
          syncStatusEl.className = 'sync-status error';
          syncStatusEl.textContent = `✗ Sync failed: ${result.error}`;
        }
      });
    }

    // Pull Now Trigger (Import from Gist)
    const pullNowBtn = document.getElementById('pull-now-btn');
    if (pullNowBtn) {
      pullNowBtn.addEventListener('click', async () => {
        const token = document.getElementById('github-token-input').value.trim();
        const gistId = document.getElementById('gist-id-input').value.trim();

        if (!token || !gistId) {
          alert('Please enter your GitHub Token and Gist ID first.');
          return;
        }

        if (confirm('Pulling from Gist will overwrite your current browser data. Do you wish to proceed?')) {
          pullNowBtn.disabled = true;
          pullNowBtn.textContent = 'Pulling...';
          const result = await window.AscendStorage.pullFromGist(token, gistId);
          pullNowBtn.disabled = false;
          pullNowBtn.textContent = 'Pull Data';

          if (result.success) {
            appData = result.data;
            alert('Data pulled and restored successfully from GitHub Gist!');
            updateAllStreaks();
            navigate('dashboard');
          } else {
            alert(`Failed to pull: ${result.error}`);
          }
        }
      });
    }
  }

  function populateSettingsForm() {
    document.getElementById('profile-name-input').value = appData.profile.name || '';
    document.getElementById('profile-title-input').value = appData.profile.title || '';
    document.getElementById('github-token-input').value = appData.settings.githubToken || '';
    document.getElementById('gist-id-input').value = appData.settings.gistId || '';
    document.getElementById('auto-sync-checkbox').checked = appData.settings.autoSync || false;
  }

  // Run app
  init();
});
