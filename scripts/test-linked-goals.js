const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto('http://127.0.0.1:8765/?linked-goal-test=' + Date.now(), { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('ascend_self_improvement_data', JSON.stringify({
      profile: { name: 'Tester', title: 'Test' },
      habits: [],
      goals: [{
        id: 'g_lang',
        title: 'Speak English Fluently',
        description: 'Practice English speaking',
        category: 'Language',
        status: 'active',
        targetDate: '',
        milestones: [],
        createdAt: new Date().toISOString()
      }],
      journal: [],
      settings: { firebaseConfigStr: '', autoSync: true, lastSynced: '' }
    }));
  });
  await page.reload({ waitUntil: 'networkidle' });

  await page.click('.nav-item[data-section="habits"]', { force: true });
  await page.click('#add-habit-btn');
  assert.strictEqual(await page.locator('#habit-goal-link-input').count(), 1, 'habit form should expose a linked goal selector');
  await page.fill('#habit-name-input', 'Speak English 1 hour');
  await page.fill('#habit-category-input', 'Language');
  await page.selectOption('#habit-goal-link-input', 'g_lang');
  await page.click('#habit-form button[type="submit"]');
  await page.waitForTimeout(150);

  assert.strictEqual(await page.locator('.habit-card:has-text("Linked Goal: Speak English Fluently")').count(), 1, 'habit card should show linked goal');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ascend_self_improvement_data')));
  assert.strictEqual(stored.habits[0].linkedGoalId, 'g_lang', 'habit should persist linkedGoalId');

  await page.click('.nav-item[data-section="goals"]', { force: true });
  await page.waitForTimeout(150);
  assert.strictEqual(await page.locator('.goal-card:has-text("Routines")').count(), 1, 'goal card should show linked routines section');
  assert.strictEqual(await page.locator('.goal-card:has-text("Speak English 1 hour")').count(), 1, 'goal card should list linked habit');

  await page.click('.nav-item[data-section="habits"]', { force: true });
  await page.click('.habit-card:has-text("Speak English 1 hour") .edit-btn');
  assert.strictEqual(await page.locator('#habit-goal-link-input').inputValue(), 'g_lang', 'edit form should preserve linked goal');

  assert.deepStrictEqual(errors, [], 'browser errors: ' + errors.join('\n'));
  await browser.close();
  console.log('linked goal routine flow passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
