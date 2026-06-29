const { chromium, devices } = require('playwright');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(devices['iPhone 12']);
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto('http://127.0.0.1:8765/?progress-ring-test=' + Date.now(), { waitUntil: 'networkidle' });

  const ring = await page.evaluate(() => {
    const svg = document.querySelector('.progress-ring-svg');
    const fg = document.querySelector('#dash-progress-circle');
    const bg = document.querySelector('.progress-ring-circle-bg');
    const svgBox = svg.getBoundingClientRect();
    const fgBox = fg.getBoundingClientRect();
    const bgBox = bg.getBoundingClientRect();
    return {
      viewBox: svg.getAttribute('viewBox'),
      svg: { width: svgBox.width, height: svgBox.height },
      fg: { left: fgBox.left, right: fgBox.right, top: fgBox.top, bottom: fgBox.bottom },
      bg: { left: bgBox.left, right: bgBox.right, top: bgBox.top, bottom: bgBox.bottom }
    };
  });

  assert.strictEqual(ring.viewBox, '0 0 140 140', 'progress SVG needs viewBox so mobile CSS scaling does not clip the circle');
  assert.ok(ring.fg.right <= ring.svg.width + ring.fg.left + 1, 'foreground ring should fit inside scaled SVG viewport');
  assert.deepStrictEqual(errors, [], 'browser errors: ' + errors.join('\n'));

  await browser.close();
  console.log('mobile progress ring test passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
