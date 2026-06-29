# Ascend - Self-Improvement Dashboard App

Ascend is a premium, offline-first personal growth companion designed to help you track habits, define goals, map out milestones, record reflections, and analyze your progress with detailed charts.

All files are hosted statically, meaning the app runs entirely in your web browser with zero server setup!

---

## Features

- **📊 Dashboard Summary**: Get a snapshot of today's habit completion rates, active goals, and streaks, along with a daily quote.
- **✓ Habit Checklist**: Manage daily routines with a weekly completion grid, streak multipliers, and daily reset rules.
- **🧭 Goals & Milestones**: Setup long-term goals with nested milestones, dynamic completion percentage calculation, and deadline warning indicators.
- **📝 Reflection Journal**: Log daily thoughts, write reflections, and monitor your mood trends with interactive icons.
- **📈 Analytics Graphs**: Visual statistics powered by Chart.js (Weekly Habit check-in rate, Goals active vs. completed, and 30-day Mood trend lines).
- **🔒 Private Local Data**: All data is saved directly on your browser storage (IndexedDB/LocalStorage). Zero bytes are sent to third parties unless you turn on Firebase sync.
- **💾 Import/Export Backups**: Easily download a `.json` backup file of all your data directly to your computer to prevent loss.
- **☁️ Firebase Cloud Sync**: Built-in authentication (Email & Password) and Firestore integration to sync data securely across your PC and smartphone instantly.

---

## How to Run Locally

You can open the app directly without hosting:
1. Double-click the [index.html](index.html) file inside the project directory.
2. Bookmark it in your browser for easy access!

---

## How to Deploy to GitHub Pages (Open Online)

To access your personal self-improvement app from any device over the internet, you can host it for free on **GitHub Pages**:

### Step 1: Create a GitHub Repository
1. Go to [github.com](https://github.com) and log in.
2. Click the **New** button to create a new repository.
3. Give it a name (e.g., `self-improvement-app`).
4. Set it as **Public** (required for free GitHub Pages hosting).
5. Click **Create repository**.

### Step 2: Push Your Code to GitHub
Open Git Bash, Command Prompt, or PowerShell in the project directory (`D:\Desktop\self-improvement-app`) and run:
```bash
# Initialize git repository
git init

# Add all files
git add .

# Create initial commit
git commit -m "First commit of Ascend app"

# Rename default branch to main
git branch -M main

# Add remote URL (replace <your-username> and <your-repo-name> with yours)
git remote add origin https://github.com/<your-username>/self-improvement-app.git

# Push code to GitHub
git push -u origin main
```

### Step 3: Enable GitHub Pages
1. Go to your repository page on GitHub.
2. Click on the **Settings** tab.
3. In the left sidebar, click on **Pages** (under the "Code and automation" section).
4. Under **Build and deployment**, select **Deploy from a branch** as the source.
5. In the **Branch** dropdown, select **main** and set the folder to `/ (root)`.
6. Click **Save**.
7. Wait 1-2 minutes. Refresh the page, and your site is live!

---

## Setting up Firebase Cloud Sync (Multi-Device Sync)

The application has the owner's Firebase config pre-configured inside `js/storage.js` as the default connection parameters.

To start syncing data between your PC and smartphone:
1. Open the hosted Ascend web app in your browser on both devices.
2. On your **PC**, click on the **Guest Mode** profile card in the bottom-left sidebar (or navigate to Settings).
3. Click **Sign In / Register** and click **Register here** to create your sync account using an email and password.
4. Once registered, your local guest data will automatically migrate and upload to Firestore.
5. On your **Smartphone**, open settings/profile card, click **Sign In / Register**, and log in using the same email and password.
6. The app will pull your database state, and sync all edits automatically in the background (debounced to save database write counts).
