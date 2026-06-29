// Ascend Analytics Manager
const AscendAnalytics = {
  charts: {},

  // Helper: Get past 7 dates
  getPast7Dates() {
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  },

  // Helper: Get weekday label
  getWeekdayLabel(dateStr) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const d = new Date(dateStr);
    return days[d.getDay()];
  },

  // Helper: Map mood to score
  moodToScore(mood) {
    switch (mood) {
      case 'excellent': return 5;
      case 'good': return 4;
      case 'neutral': return 3;
      case 'bad': return 2;
      case 'awful': return 1;
      default: return 0;
    }
  },

  // Main render function
  render(data) {
    // Prevent errors if Chart.js is not loaded yet
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js is not loaded.');
      return;
    }

    this.renderHabitsChart(data);
    this.renderGoalsChart(data);
    this.renderMoodChart(data);
  },

  // 1. Habit Completion Rates (Last 7 Days)
  renderHabitsChart(data) {
    const canvas = document.getElementById('habitsChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const past7Days = this.getPast7Dates();
    const labels = past7Days.map(date => this.getWeekdayLabel(date));
    const completionRates = [];

    past7Days.forEach(date => {
      if (data.habits.length === 0) {
        completionRates.push(0);
        return;
      }
      
      let completedCount = 0;
      data.habits.forEach(habit => {
        if (habit.logs && habit.logs[date]) {
          completedCount++;
        }
      });
      
      const rate = Math.round((completedCount / data.habits.length) * 100);
      completionRates.push(rate);
    });

    if (this.charts.habits) {
      this.charts.habits.destroy();
    }

    this.charts.habits = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Completion %',
          data: completionRates,
          backgroundColor: 'rgba(6, 182, 212, 0.45)',
          borderColor: '#06b6d4',
          borderWidth: 2,
          borderRadius: 6,
          hoverBackgroundColor: 'rgba(6, 182, 212, 0.75)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Completed ${ctx.raw}% of habits`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#94a3b8' }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8' }
          }
        }
      }
    });
  },

  // 2. Goal Status Distribution
  renderGoalsChart(data) {
    const canvas = document.getElementById('goalsChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    let active = 0;
    let completed = 0;

    data.goals.forEach(goal => {
      if (goal.status === 'completed') {
        completed++;
      } else {
        active++;
      }
    });

    if (this.charts.goals) {
      this.charts.goals.destroy();
    }

    // Handle empty state gracefully
    if (active === 0 && completed === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    this.charts.goals = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Active', 'Completed'],
        datasets: [{
          data: [active, completed],
          backgroundColor: ['rgba(139, 92, 246, 0.55)', 'rgba(16, 185, 129, 0.55)'],
          borderColor: ['#8b5cf6', '#10b981'],
          borderWidth: 1.5,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#94a3b8', font: { family: 'Inter' } }
          }
        },
        cutout: '70%'
      }
    });
  },

  // 3. Mood Tracker Trend (Last 7 Entries)
  renderMoodChart(data) {
    const canvas = document.getElementById('moodChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Get last 7 journal entries with mood, sorted chronologically
    const sortedJournal = [...data.journal]
      .filter(entry => entry.mood)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-7);

    if (sortedJournal.length === 0) {
      return;
    }

    const labels = sortedJournal.map(entry => {
      const parts = entry.date.split('-');
      return `${parts[1]}/${parts[2]}`; // MM/DD
    });
    
    const moodScores = sortedJournal.map(entry => this.moodToScore(entry.mood));

    if (this.charts.mood) {
      this.charts.mood.destroy();
    }

    const moodNames = ['', 'Awful 😢', 'Bad 🙁', 'Neutral 😐', 'Good 🙂', 'Excellent 😁'];

    this.charts.mood = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Mood level',
          data: moodScores,
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#8b5cf6',
          pointBorderColor: '#ffffff',
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Mood: ${moodNames[ctx.raw]}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            min: 1,
            max: 5,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#94a3b8',
              stepSize: 1,
              callback: (val) => moodNames[val] ? moodNames[val].split(' ')[0] : ''
            }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8' }
          }
        }
      }
    });
  }
};

window.AscendAnalytics = AscendAnalytics;
