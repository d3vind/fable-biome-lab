import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = '/home/user/fable-biome-lab';
export const SHOTS = ROOT + '/.build/shots';
export const PORT = +(process.env.PORT || 8137);

export function serve(port = PORT) {
  return new Promise((res) => {
    const s = http.createServer((req, r) => {
      const u = (req.url || '/').split('?')[0];
      const f = path.join(ROOT, u === '/' ? 'index.html' : u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
      r.writeHead(200, { 'content-type': path.extname(f) === '.html' ? 'text/html' : 'application/octet-stream', 'cache-control': 'no-store' });
      r.end(fs.readFileSync(f));
    });
    s.listen(port, '127.0.0.1', () => res(s));
  });
}
export async function browser() {
  return chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
           '--disable-dev-shm-usage', '--no-sandbox', '--hide-scrollbars',
           '--autoplay-policy=no-user-gesture-required', '--mute-audio',
           '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
           '--disable-background-timer-throttling', '--disable-ipc-flooding-protection',
           '--disable-background-networking', '--disable-component-update', '--disable-sync',
           '--no-first-run', '--no-default-browser-check', '--disable-default-apps',
           '--metrics-recording-only', '--enable-precise-memory-info',
           '--disable-features=Translate,OptimizationHints,MediaRouter'],
  });
}
export async function page(br, { w = 1152, h = 648, url }) {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const logs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  p.on('requestfailed', (r) => logs.push('requestfailed: ' + r.url()));
  p.logs = logs;
  await p.goto(url.replace('8137', String(PORT)), { waitUntil: 'load' });
  return p;
}
export async function start(p, { timeout = 300000 } = {}) {
  await p.click('#go');
  await p.waitForFunction('window.__ctl && window.__ctl.ready()', null, { timeout });
  await p.waitForTimeout(600);
}
export const proof = (p) => p.evaluate(() => window.__proof);
export async function shot(p, name) {
  await p.screenshot({ path: SHOTS + '/' + name + '.png', timeout: 300000 });
}
