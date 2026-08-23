/* Sert index.html avec exactement les en-têtes de vercel.json, puis parcourt
   la page en écoutant les violations CSP. Une directive trop stricte casse
   sans bruit : c'est le navigateur qu'il faut interroger, pas la config. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const RACINE = process.env.RACINE || path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(RACINE + '/vercel.json', 'utf8'));
const ENTETES = Object.fromEntries(cfg.headers[0].headers.map(h => [h.key, h.value]));

const HOSTS = ['mainnet.base.org','base-rpc.publicnode.com','ethereum-rpc.publicnode.com',
  'eth.drpc.org','mainnet.optimism.io','optimism-rpc.publicnode.com'];
const CORS = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type',
  'Access-Control-Allow-Methods':'POST,OPTIONS'};

const srv = http.createServer((q, r) => {
  const f = q.url === '/' ? '/index.html' : q.url.split('?')[0];
  const p = path.join(RACINE, f);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('nope'); }
  const type = f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
  r.writeHead(200, { ...ENTETES, 'Content-Type': type });
  r.end(fs.readFileSync(p));
});

let fails = 0;
const check = (l, c, d) => { if (!c) fails++; console.log(c ? '  ok   ' : ' FAIL  ', l, c ? '' : '\n         ' + (d || '')); };

(async () => {
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const b = await chromium.launch({ ...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}), args: ['--no-sandbox'] });
  const page = await b.newPage();
  const violations = [], erreurs = [];
  page.on('console', m => { const t = m.text();
    if (/Content Security Policy|Refused to/i.test(t)) violations.push(t.slice(0, 190)); });
  page.on('pageerror', e => erreurs.push(String(e.message).slice(0, 140)));
  await page.route(u => HOSTS.some(h => u.host === h), async route => {
    const q = route.request();
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    try { const x = await fetch(q.url(), { method:'POST', headers:{'Content-Type':'application/json'}, body:q.postData() });
      route.fulfill({ status:200, headers:{...CORS,'Content-Type':'application/json'}, body: await x.text() });
    } catch (e) { route.fulfill({ status:502, headers:CORS, body:'{}' }); }
  });

  /* Le bac à sable coupe Google Fonts : sans substitut, on ne saurait pas si
     c'est la CSP ou le réseau qui bloque. On sert donc une vraie feuille et une
     vraie police à ces deux origines — la CSP est évaluée avant l'interception,
     donc un blocage se verrait quand même. */
  const woff = Buffer.from(
    'd09GMgABAAAAAAKAAA0AAAAABegAAAIoAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAABmAAgg' +
    'QIEQgKgVSBQwsIAAE2AiQDGAQgBYUeB1obBcgOI7LNbUlUJPX3l+Tu+X9tPOaZUdvptKUj' +
    'x4kQQ5UvBAAAAAAAAAAAAAD//w==', 'base64');
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({
    status: 200, headers: {'Content-Type':'text/css','Access-Control-Allow-Origin':'*'},
    body: "@font-face{font-family:'Manrope';src:url(https://fonts.gstatic.com/s/x.woff2) format('woff2');font-display:swap}" }));
  await page.route('https://fonts.gstatic.com/**', r => r.fulfill({
    status: 200, headers: {'Content-Type':'font/woff2','Access-Control-Allow-Origin':'*'}, body: woff }));

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  check('la page charge sans violation CSP', violations.length === 0, violations.join(' | '));

  // recherche + balayage live : c'est connect-src qui est en jeu
  await page.fill('#addr', '0x6BAb38eD8e3c942DCC287bE471D651055B615c7E');
  await page.click('#go');
  let t0 = Date.now(), txt = '';
  while (Date.now()-t0 < 60000) { txt = await page.locator('#out').innerText().catch(()=> '');
    if (/re-read live|Nothing credited|not re-read/.test(txt)) break; await page.waitForTimeout(200); }
  check('connect-src laisse passer les six RPC (soldes relus)', /re-read live/.test(txt), txt.slice(0,220));

  // flux d'activité : eth_getLogs, même origine de destination
  await page.click('#activitylink');
  t0 = Date.now();
  while (Date.now()-t0 < 60000 && !(await page.locator('#activitypanel .hrow').count())) await page.waitForTimeout(200);
  const nAct = await page.locator('#activitypanel .hrow').count();
  check('le flux d\'activité se remplit (eth_getLogs)', nAct > 0, 'lignes=' + nAct);

  // QR : SVG inline, img-src / style-src en jeu
  await page.evaluate(() => { document.getElementById('tip').style.display = 'block';
    donProposer([{proto:'v1',chainId:8453,token:'0x'+'e'.repeat(40),symbol:'ETH',amount:1,dec:18,brut:'1000000000000000000'}]); });
  await page.waitForTimeout(400);
  check('le QR s\'affiche (SVG inline)', await page.locator('#donzone .donqr svg').count() === 1);

  // polices : style-src / font-src
  const feuilles = await page.evaluate(() => [...document.styleSheets]
    .map(s => { try { return { href: s.href, regles: s.cssRules.length }; }
                catch (e) { return { href: s.href, regles: 'inaccessible' }; } })
    .filter(s => s.href && /fonts\.googleapis/.test(s.href)));
  check('style-src accepte la feuille Google Fonts', feuilles.length === 1, JSON.stringify(feuilles));
  const req = [];
  page.on('request', r => { if (/gstatic/.test(r.url())) req.push(r.url()); });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);

  /* Une CSP qui ne bloque rien ne prouve rien. On vérifie qu'elle refuse bien
     une destination non déclarée — c'est là tout son intérêt ici : elle rend
     opposable la promesse « on ne parle qu'à ces six endpoints ». */
  const attendus = violations.length;
  const fuite = await page.evaluate(async () => {
    try { await fetch('https://exemple-non-declare.test/collecte', {method:'POST', body:'x'});
          return 'PASSÉE'; } catch (e) { return 'refusée'; }
  });
  await page.waitForTimeout(300);
  check('une destination non déclarée est refusée', fuite === 'refusée', 'résultat=' + fuite);
  check('le navigateur enregistre bien la violation', violations.length > attendus);
  const nonScript = violations.filter(v => !/exemple-non-declare/.test(v));

  check('aucune erreur JavaScript', erreurs.length === 0, JSON.stringify(erreurs));
  check('aucune violation non voulue', nonScript.length === 0, [...new Set(nonScript)].join('\n         '));
  await b.close(); srv.close();
  console.log(fails === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${fails} ÉCHEC(S)`);
  process.exit(fails === 0 ? 0 : 1);
})();
