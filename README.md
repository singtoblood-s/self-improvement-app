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
- **🔒 Private Local Data**: All data is saved directly on your browser storage (IndexedDB/LocalStorage). Zero bytes are sent to third parties unless you turn on Gist sync.
- **💾 Import/Export Backups**: Easily download a `.json` backup file of all your data directly to your computer to prevent loss.
- **☁️ Gist Cloud Sync**: Input a GitHub Token and automatically sync data securely to a private GitHub Gist, allowing you to load your dashboard on other PCs, phones, or tablets.

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
5. Do *not* initialize it with a README, `.gitignore`, or license. Click **Create repository**.

### Step 2: Push Your Code to GitHub
Open Git Bash, Command Prompt, or PowerShell in the project directory (`C:\Users\USER\Desktop\self-improvement-app`) and run:
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
7. Wait 1-2 minutes. Refresh the page, and you will see a message: *"Your site is live at `https://<your-username>.github.io/self-improvement-app/`"*.

---

## Setting up GitHub Gist Sync (Multi-Device Sync)

Since GitHub Pages serves static files, your browser data won't automatically sync between your PC and phone. To solve this, we built a secure Gist sync engine:

1. Go to **Settings** in your GitHub Profile -> **Developer Settings** -> **Personal Access Tokens** -> **Tokens (classic)**.
2. Click **Generate new token (classic)**.
3. Name it (e.g. `Ascend App Sync`) and check the **`gist`** checkbox.
4. Click **Generate token** and copy it (you will only see it once!).
5. Open your hosted Ascend web app, go to **Settings**, paste the token in the token input field, and click **Save Sync Settings**.
6. Click **Sync Now**. A private Gist will be created automatically, and your Gist ID will populate.
7. To access this data from another device, just open the app on that device, go to settings, paste your **token** and **Gist ID**, and click **Pull Data**.
