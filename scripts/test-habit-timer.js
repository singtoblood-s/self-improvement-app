const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.addInitScript(() => {
    window.__notifications = [];
    class MockNotification {
      static permission = 'granted';
      static requestPermission = () => Promise.resolve('granted');
      constructor(title, options = {}) {
        window.__notifications.push({ title, body: options.body || '' });
      }
    }
    Object.defineProperty(window, 'Notification', { value: MockNotification, configurable: true });
  });

  await page.goto('http://127.0.0.1:8765/?habit-timer-test=' + Date.now(), { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('ascend_self_improvement_data'));
  await page.reload({ waitUntil: 'networkidle' });

  await page.click('.nav-item[data-section="habits"]', { force: true });
  await page.click('#add-habit-btn');
  await page.fill('#habit-name-input', 'Timer Habit');
  await page.selectOption('#habit-type-input', 'timer');
  await page.fill('#habit-duration-input', '0.02');
  await page.click('#habit-form button[type="submit"]');
  await page.waitForTimeout(150);

  assert.strictEqual(await page.locator('.habit-card:has-text("Timer Habit") .timer-start-btn').count(), 1, 'timed habit should show a start timer button');
  await page.click('.habit-card:has-text("Timer Habit") .timer-start-btn');
  await page.waitForTimeout(1800);

  const result = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('ascend_self_improvement_data'));
    const habit = data.habits.find(h => h.name === 'Timer Habit');
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
    return {
      completedToday: !!habit.logs?.[today],
      timerRunning: !!habit.timerEndsAt,
      notifications: window.__notifications,
      cardText: document.querySelector('.habit-card:has(.habit-card-title)')?.innerText || '',
      timerCardText: [...document.querySelectorAll('.habit-card')].find(card => card.innerText.includes('Timer Habit'))?.innerText || ''
    };
  });

  assert.strictEqual(result.completedToday, true, 'timer should mark the habit complete when time is up');
  assert.strictEqual(result.timerRunning, false, 'timer fields should clear after completion');
  assert.ok(result.notifications.some(n => n.title.includes('Timer complete') && n.body.includes('Timer Habit')), 'timer completion should trigger a notification');
  assert.match(result.timerCardText, /Completed today/, 'card should show completed timer state');
  assert.deepStrictEqual(errors, [], 'browser errors: ' + errors.join('\n'));

  await browser.close();
  console.log('habit timer flow passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
