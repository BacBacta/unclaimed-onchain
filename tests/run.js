#!/usr/bin/env node
/* Lanceur de la batterie : les suites sont indépendantes, on les fait courir
   en parallèle plutôt qu'à la queue leu leu. Durée = la plus lente, pas la somme. */
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');

try { require.resolve('playwright'); }
catch { console.error("playwright est absent — `npm install` dans tests/ d'abord."); process.exit(2); }

/* Les suites laissent Playwright résoudre son navigateur, sauf si CHROME est
   posé. Sur une image où seul un Chromium complet est présent (pas le
   headless shell attendu), on le trouve ici une fois pour toutes. */
function chercherChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const racine = process.env.PLAYWRIGHT_BROWSERS_PATH || '';
  if (!racine || !fs.existsSync(racine)) return '';
  for (const d of fs.readdirSync(racine).filter(d => d.startsWith('chromium-')).sort().reverse()) {
    const c = path.join(racine, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(c)) return c;
  }
  return '';
}
const CHROME = chercherChrome();

/* Les suites attendent plus qu'elles ne calculent, donc deux fois le nombre
   de cœurs est le bon point : mesuré ici sur 4 cœurs, 4 → 131 s, 6 → 117 s,
   8 → 107 s, 12 → 125 s et instable. Au-delà elles se privent mutuellement
   de CPU et les sondages commencent à expirer. */
const PAR = +(process.env.PAR || Math.min(12, Math.max(4, 2 * (require('os').cpus().length || 4))));
const SOURCE = process.env.PAGE || path.join(__dirname, '..', 'index.html');

/* Prouver qu'une borne de temps existe n'oblige pas à l'attendre en vrai :
   RAPIDE=1 sert une page dont les délais sont raccourcis (window.__delais),
   ce qui retire ~5 minutes d'attente pure à la batterie. Aucun fichier de
   test n'a à le savoir — ils lisent tous PAGE. */
const RAPIDE = process.env.RAPIDE !== '0';
/* On ne raccourcit pas la fenêtre de guet d'une injection tardive : elle ne
   coûte qu'une trentaine de secondes cumulées, et la réduire mettrait les
   scénarios « le wallet arrive après la recherche » en course avec elle. */
const DELAIS = { rpc: 1500, prompt: 2500, slow: 400 };
const PAGE = (() => {
  if (!RAPIDE) return SOURCE;
  const src = fs.readFileSync(SOURCE, 'utf8');
  const inj = `<script>window.__delais=${JSON.stringify(DELAIS)}<\/script>\n`;
  const i = src.indexOf('</head>');
  if (i < 0) throw new Error('pas de </head> dans ' + SOURCE);
  // écrite hors du dépôt : c'est un artefact de test, pas une version du site
  const out = path.join(os.tmpdir(), 'unclaimed-rapide.html');
  fs.writeFileSync(out, src.slice(0, i) + inj + src.slice(i));
  return out;
})();
const filtre = process.argv.slice(2).filter(a => !a.startsWith('-'));
const suites = fs.readdirSync(__dirname).filter(f => /^test_.*\.js$/.test(f))
  .filter(f => !filtre.length || filtre.some(x => f.includes(x))).sort();

const res = [];
let idx = 0, t0 = Date.now();

function une(f) {
  return new Promise(done => {
    const d0 = Date.now();
    const p = spawn('node', [path.join(__dirname, f)], {
      // les suites qui doivent laisser expirer un délai lisent les mêmes bornes
      env: { ...process.env, PAGE, TEST_URL, CHROME, DELAIS: JSON.stringify(RAPIDE ? DELAIS : {}) },
      stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', c => out += c);
    p.stderr.on('data', c => out += c);
    const tue = setTimeout(() => p.kill('SIGKILL'), 15 * 60000);
    p.on('close', code => {
      clearTimeout(tue);
      const s = Math.round((Date.now() - d0) / 1000);
      const nOk = (out.match(/^\s+ok\s/gm) || []).length;
      const nKo = (out.match(/^\s*FAIL\s/gm) || []).length;
      const alertes = out.match(/^\s*⚠ .*$/gm) || [];
      res.push({ f, code, s, nOk, nKo, out, alertes });
      // certaines suites tranchent par leur code de sortie sans compter d'assertions
      const compte = nOk || nKo ? `${nOk} ok${nKo ? ', ' + nKo + ' FAIL' : ''}` : 'verdict par code de sortie';
      console.log(`${code === 0 ? '  ✓' : '  ✗'} ${f.padEnd(24)} ${String(s).padStart(4)}s  ${compte}`
        + (alertes.length ? `  ⚠ ${alertes.length} sondage(s) épuisé(s)` : ''));
      done();
    });
  });
}

/* Un serveur local sert la même page aux suites qui veulent une vraie origine
   (TEST_URL) : plus rien ne sort sur le réseau pour aller chercher le HTML. */
let TEST_URL = process.env.TEST_URL || '';
let srv = null;
async function servir() {
  if (TEST_URL) return;
  const body = fs.readFileSync(PAGE);
  srv = http.createServer((q, r) => {
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length });
    r.end(q.method === 'HEAD' ? undefined : body);
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  TEST_URL = `http://127.0.0.1:${srv.address().port}/unclaimed-onchain/`;
}

(async () => {
  await servir();
  console.log(`${suites.length} suites, ${PAR} en parallèle, page = ${PAGE}`
    + (RAPIDE ? `  (délais raccourcis ${JSON.stringify(DELAIS)})` : '  (délais réels)') + '\n');
  await Promise.all(Array.from({ length: PAR }, async () => {
    while (idx < suites.length) await une(suites[idx++]);
  }));
  const mur = Math.round((Date.now() - t0) / 1000);
  const cumul = res.reduce((a, r) => a + r.s, 0);
  const ko = res.filter(r => r.code !== 0);
  console.log(`\n${mur}s au mur, ${cumul}s cumulés (×${(cumul / mur).toFixed(1)})`);
  console.log([...res].sort((a, b) => b.s - a.s).slice(0, 5)
    .map(r => `   ${String(r.s).padStart(4)}s ${r.f}`).join('\n'));
  if (ko.length) {
    console.log(`\n${ko.length} SUITE(S) EN ÉCHEC\n`);
    for (const r of ko) {
      console.log('══ ' + r.f + ' ' + '═'.repeat(40));
      console.log(r.out.split('\n').filter(l => /FAIL|FATAL|ÉCHEC/.test(l)).slice(0, 20).join('\n'));
    }
    if (srv) srv.close();
    process.exit(1);
  }
  console.log('\nBATTERIE VERTE');
  if (srv) srv.close();
})();
