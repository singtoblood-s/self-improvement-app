const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  page.on('dialog', dialog => dialog.accept());
  await page.goto('http://127.0.0.1:8765/?crud-update-test=' + Date.now(), { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('ascend_self_improvement_data'));
  await page.reload({ waitUntil: 'networkidle' });

  // Habit create -> update -> delete
  await page.click('.nav-item[data-section="habits"]', { force: true });
  await page.click('#add-habit-btn');
  await page.fill('#habit-name-input', 'CRUD Habit');
  await page.fill('#habit-category-input', 'Test');
  await page.click('#habit-form button[type="submit"]');
  await page.waitForTimeout(150);
  assert.strictEqual(await page.locator('.habit-card-title', { hasText: 'CRUD Habit' }).count(), 1, 'habit create failed');

  await page.click('.habit-card:has-text("CRUD Habit") .edit-btn');
  await page.fill('#habit-name-input', 'CRUD Habit Edited');
  await page.fill('#habit-category-input', 'Edited');
  await page.click('#habit-form button[type="submit"]');
  await page.waitForTimeout(150);
  assert.strictEqual(await page.locator('.habit-card-title', { hasText: 'CRUD Habit Edited' }).count(), 1, 'habit update failed');

  await page.click('.habit-card:has-text("CRUD Habit Edited") .delete-btn');
  await page.waitForTimeout(150);
  assert.strictEqual(await page.locator('.habit-card-title', { hasText: 'CRUD Habit Edited' }).count(), 0, 'habit delete failed');

  // Goal create -> update -> delete
  await page.click('.nav-item[data-section="goals"]', { force: true });
  await page.click('#add-goal-btn');
  await page.fill('#goal-title-input', 'CRUD Goal');
  await page.fill('#goal-desc-input', 'Original desc');
  await page.fill('#goal-category-input', 'Test');
  await page.click('#goal-form button[type="submit"]');
  await page.waitForTimeout(150);
  assert.strictEqual(await page.locator('.goal-card-title', { hasText: 'CRUD Goal' }).count(), 1, 'goal create failed');

  await page.click('.goal-card:has-text("CRUD Goal") .edit-btn');
  await page.fill('#goal-title-input', 'CRUD Goal Edited');
  await page.fill('#goal-desc-input', 'Edited desc');
  await page.fill('#goal-category-input', 'Edited');
  await page.click('#goal-form button[type="submit"]');
  await page.waitForTimeout(150);
  assert.strictEqual(await page.locator('.goal-card-title', { hasText: 'CRUD Goal Edited' }).count(), 1, 'goal update failed');

  await page.click('.goal-card:has-text("CRUD Goal Edited") .delete-btn');
  await page.waitForTimeout(150);
  assert.strictEqual(await page.locator('.goal-card-title', { hasText: 'CRUD Goal Edited' }).count(), 0, 'goal delete failed');

  assert.deepStrictEqual(errors, [], 'browser errors: ' + errors.join('\n'));
  await browser.close();
  console.log('CRUD update flow passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
