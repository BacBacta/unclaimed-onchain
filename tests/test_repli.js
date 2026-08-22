/* Prouver que le repli Ethereum existe VRAIMENT : on coupe le premier
   endpoint et la lecture doit aboutir quand même, par le second. */
const { chromium } = require('playwright');
const fs = require('fs');
const html = fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'), 'utf8');
const ADDR = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const CORS = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const TOUS = ['mainnet.base.org','base-rpc.publicnode.com','ethereum-rpc.publicnode.com',
  'eth.drpc.org','mainnet.optimism.io','optimism-rpc.publicnode.com'];

async function essai(coupes, libelle) {
  const b = await chromium.launch({ ...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}), args:['--no-sandbox'] });
  const page = await b.newPage();
  const touches = new Set();
  await page.route(u => TOUS.some(h => u.host === h), async route => {
    const q = route.request(); const host = new URL(q.url()).host;
    if (q.method() === 'OPTIONS') return route.fulfill({status:204, headers:CORS});
    if (coupes.includes(host)) return route.fulfill({status:503, headers:CORS, body:'{}'});
    touches.add(host);
    try { const r = await fetch(q.url(), {method:'POST', headers:{'Content-Type':'application/json'}, body:q.postData()});
      route.fulfill({status:200, headers:{...CORS,'Content-Type':'application/json'}, body:await r.text()});
    } catch { route.fulfill({status:502, headers:CORS, body:'{}'}); }
  });
  await page.route('**bacbacta.github.io**', r => r.fulfill({status:200, contentType:'text/html; charset=utf-8', body:html}));
  await page.route('**fonts.g**', r => r.abort());
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/', {waitUntil:'load'});
  await page.fill('#addr', ADDR); await page.click('#go');
  const t0 = Date.now(); let txt = '';
  while (Date.now()-t0 < 60000) {
    txt = await page.locator('#out').innerText().catch(()=> '');
    if (/re-read live|not re-read|Nothing credited/.test(txt)) break;
    await page.waitForTimeout(200);
  }
  const relu = /re-read live from the contracts just now/.test(txt);
  const signale = /not re-read/.test(txt);
  console.log(`${libelle.padEnd(46)} ${relu ? 'RELU EN DIRECT' : signale ? 'repli instantané, signalé' : '???'}`
    + `  · endpoints réellement joints : ${[...touches].join(', ') || 'aucun'}`);
  await b.close();
  return { relu, signale };
}

let fails = 0;
const check = (l, c, d) => { if (!c) fails++; console.log(c ? '  ok   ' : ' FAIL  ', l, c ? '' : '\n         ' + (d || '')); };

(async () => {
  const a = await essai([], 'tout disponible');
  const b = await essai(['ethereum-rpc.publicnode.com'], 'premier endpoint Ethereum coupé');
  const c = await essai(['ethereum-rpc.publicnode.com','eth.drpc.org'], 'les deux endpoints Ethereum coupés');
  console.log();
  /* Avec les deux endpoints Ethereum coupés, Base et Optimism restent relus :
     la page affiche donc « re-read live » ET « not re-read — Ethereum
     unreachable ». C'est la dégradation honnête attendue, pas un échec. */
  check('tout disponible → lecture en direct, rien de signalé', a.relu && !a.signale, JSON.stringify(a));
  check('premier endpoint Ethereum coupé → le second prend le relais', b.relu, JSON.stringify(b));
  check('le repli n\'est pas silencieusement dégradé', !b.signale, JSON.stringify(b));
  check('les deux coupés → Ethereum signalée non relue', c.signale, JSON.stringify(c));
  check('les deux coupés → les autres chaînes restent relues', c.relu, JSON.stringify(c));
  console.log(fails === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${fails} ÉCHEC(S)`);
  process.exit(fails === 0 ? 0 : 1);
})();
