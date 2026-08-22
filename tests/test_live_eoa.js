const { chromium } = require('playwright');
const fs = require('fs');

const LIVE = 'https://bacbacta.github.io/unclaimed-onchain/';
const html = fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'));
const T = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'targets.json'),'utf8'));
const SIGNER = '0x000000000000000000000000000000000000bEEF';
const RPCS = ['https://mainnet.base.org','https://base-rpc.publicnode.com'];

let fails = 0;
const check = (label, cond, detail) => {
  if (!cond) fails++;
  console.log(cond ? '  ok   ' : ' FAIL  ', label, cond ? '' : '\n         ' + (detail || ''));
};

async function rpcCall(method, params) {
  for (const url of RPCS) {
    try {
      const r = await fetch(url, { method:'POST',
        headers:{'Content-Type':'application/json','User-Agent':'curl/8.5.0'},
        body: JSON.stringify({jsonrpc:'2.0',id:1,method,params:params||[]}) });
      const j = await r.json();
      if (j.result !== undefined) return j.result;
      if (j.error) throw new Error(j.error.message);
    } catch (e) { if (url === RPCS[RPCS.length-1]) throw e; }
  }
}

async function session() {
  const browser = await chromium.launch({
    ...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}), args:['--no-sandbox'] });
  const page = await browser.newPage();
  const log = [], sent = [];

  // pont vers la vraie chaîne Base ; seule la signature est simulée
  await page.exposeFunction('__bridge', async (method, params) => {
    log.push({ method, params });
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [SIGNER];
    if (method === 'eth_chainId') return '0x2105';
    if (method === 'wallet_switchEthereumChain') return null;
    if (method === 'eth_sendTransaction') { sent.push(params[0]); return '0x' + 'ab'.repeat(32); }
    return await rpcCall(method, params);            // eth_call, eth_getCode → RPC réel
  });
  await page.addInitScript(() => {
    window.ethereum = { isMetaMask:true, on:()=>{}, removeListener:()=>{},
      request: ({ method, params }) => window.__bridge(method, params || []) };
  });
  await page.route('https://bacbacta.github.io/**', r =>
    r.fulfill({ status:200, contentType:'text/html; charset=utf-8', body: html }));
  await page.route('**fonts.g**', r => r.abort());

  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(LIVE, { waitUntil:'load' });
  await page.waitForTimeout(900);
  return { browser, page, log, sent, errs };
}

const outText = p => p.locator('#out').innerText().catch(()=> '');
async function search(page, addr) {
  await page.fill('#addr', addr); await page.click('#go'); await page.waitForTimeout(700);
}
const codeCalls = (log, addr) => log.filter(e =>
  e.method === 'eth_getCode' && e.params[0].toLowerCase() === addr.toLowerCase()).length;

/* Attendre 3,5 à 4 s « le pire cas » après chaque clic coûtait 39 s par tour.
   On sonde la condition propre à chaque scénario. Là où la vérification doit
   ne RIEN produire, on attend son achèvement réel plutôt qu'une absence, qui
   n'arrive jamais. */
async function attendre(cond, ms = 25000, quoi = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await cond()) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  console.log('  \u26a0 sondage \u00e9puis\u00e9 apr\u00e8s ' + ms + ' ms : ' + quoi);
  return false;
}

(async () => {
  console.log('cible :', LIVE, '— RPC réel : mainnet.base.org\n');

  /* ── 1. Bénéficiaire EOA réel, position en ETH natif ────────── */
  console.log('1. Bénéficiaire EOA réel (Zora, ETH natif) —', T.zoraEoa.addr);
  {
    const { browser, page, log, errs } = await session();
    await search(page, T.zoraEoa.addr);
    await page.locator('#out button', { hasText:'Verify live' }).first().click();
    await attendre(async () => (await outText(page)).includes('is a regular wallet'), 25000, 'regular wallet');
    const txt = await outText(page);
    check('eth_getCode appelé sur le bénéficiaire', codeCalls(log, T.zoraEoa.addr) >= 1,
      JSON.stringify(log.map(e=>e.method)));
    check('message « regular wallet » affiché', txt.includes('is a regular wallet'), txt.slice(-260));
    check('aucun avertissement contrat', !txt.includes('is a contract'));
    check('solde réel lu depuis le contrat (non nul)',
      txt.includes('real balance confirmed'), txt.slice(-300));
    check('aucune erreur JavaScript', errs.length === 0, errs.join(' | '));
    await browser.close();
  }

  /* ── 2. Bénéficiaire contrat réel, position en ETH natif ────── */
  console.log('\n2. Bénéficiaire contrat réel (Zora, ETH natif) —', T.zoraContract.addr);
  {
    const { browser, page, log } = await session();
    await search(page, T.zoraContract.addr);
    const btn = page.locator('#out button', { hasText:'Verify live' }).first();
    await btn.click();
    await attendre(async () => (await outText(page)).includes('is a contract'), 25000, 'is a contract');
    let txt = await outText(page);
    check('eth_getCode appelé sur le bénéficiaire', codeCalls(log, T.zoraContract.addr) >= 1);
    check('avertissement « is a contract » affiché', txt.includes('is a contract'), txt.slice(-320));
    check('aucun message « regular wallet »', !txt.includes('is a regular wallet'));

    const before = codeCalls(log, T.zoraContract.addr);
    const appelsAvant = log.length;
    await btn.click();
    /* Attendre 4 s pour constater une absence est à la fois lent et faible :
       on attend que la re-vérification ait bel et bien tourné (de nouveaux
       appels RPC), puis on constate qu'aucun n'était un eth_getCode. */
    await attendre(async () => log.length > appelsAvant, 25000, 'seconde vérification');
    check('résultat mémorisé : pas de second eth_getCode',
      codeCalls(log, T.zoraContract.addr) === before, `avant=${before} après=${codeCalls(log, T.zoraContract.addr)}`);
    await browser.close();
  }

  /* ── 3. Position ERC-20 seule : aucun contrôle ──────────────── */
  console.log('\n3. Position ERC-20 seule (Clanker) — contrôle attendu : aucun');
  for (const key of ['clankerContract','clankerEoa']) {
    const { browser, page, log } = await session();
    await search(page, T[key].addr);
    await page.locator('#out button', { hasText:'Verify live' }).first().click();
    await attendre(async () => /Balances re-read|real balance confirmed|already claimed|did not answer/i
      .test(await outText(page)), 25000, 'fin de la vérification');
    const txt = await outText(page);
    check(`${key} → aucun eth_getCode émis`, codeCalls(log, T[key].addr) === 0,
      JSON.stringify(log.map(e=>e.method)));
    check(`${key} → aucun message sur le type de compte`,
      !txt.includes('is a contract') && !txt.includes('is a regular wallet'), txt.slice(-240));
    await browser.close();
  }

  /* ── 4. Garde-fou au retrait ────────────────────────────────── */
  console.log('\n4. Garde-fou : ETH natif vers un contrat réel');
  {
    const { browser, page, sent } = await session();
    await search(page, T.zoraContract.addr);
    const btn = page.locator('#out button', { hasText:'Deliver to' }).first();
    await btn.click();
    await attendre(async () => (await outText(page)).includes('sends native ETH'), 25000, 'avertissement natif');
    let txt = await outText(page);
    check('1er clic → avertissement, rien envoyé',
      txt.includes('sends native ETH') && sent.length === 0, `envoyées=${sent.length} | ${txt.slice(-240)}`);
    await btn.click();
    await attendre(async () => sent.length === 1, 25000, 'transaction envoyée');
    check('2e clic → transaction construite et signée', sent.length === 1, `envoyées=${sent.length}`);
    if (sent.length) {
      const tx = sent[0], benef = T.zoraContract.addr.slice(2).toLowerCase();
      check('calldata = withdrawFor(bénéficiaire, 0)',
        tx.data.startsWith('0xdb518db2') && tx.data.includes(benef), tx.data);
      check('le signataire n\'apparaît pas dans le calldata', !tx.data.includes('beef'), tx.data);
      check('aucun champ value', tx.value === undefined, JSON.stringify(tx));
    }
    await browser.close();
  }
  {
    const { browser, page, sent } = await session();
    await search(page, T.zoraEoa.addr);
    await page.locator('#out button', { hasText:'Deliver to' }).first().click();
    await attendre(async () => sent.length === 1, 25000, 'transaction envoyée');
    const txt = await outText(page);
    check('bénéficiaire EOA → envoi direct, aucun avertissement',
      sent.length === 1 && !txt.includes('sends native ETH'), `envoyées=${sent.length}`);
    await browser.close();
  }
  {
    const { browser, page, sent } = await session();
    await search(page, T.clankerContract.addr);
    await page.locator('#out button', { hasText:'Deliver to' }).first().click();
    await attendre(async () => sent.length === 1, 25000, 'transaction envoyée');
    check('contrat mais ERC-20 → envoi direct, aucun avertissement', sent.length === 1,
      `envoyées=${sent.length}`);
    await browser.close();
  }

  /* ── 5. EOA délégué EIP-7702 ────────────────────────────────── */
  if (T.delegated) {
    console.log('\n5. EOA délégué EIP-7702 (position native) —', T.delegated.addr);
    const { browser, page, log, sent } = await session();
    await search(page, T.delegated.addr);
    await page.locator('#out button', { hasText:'Verify live' }).first().click();
    await attendre(async () => (await outText(page)).includes('delegates its code'), 25000, 'délégation 7702');
    const txt = await outText(page);
    check('eth_getCode appelé', codeCalls(log, T.delegated.addr) >= 1);
    check('reconnu comme portefeuille délégué, pas comme contrat',
      txt.includes('delegates its code') && !txt.includes('is a contract'), txt.slice(-320));
    check('adresse du délégué affichée',
      txt.includes(T.delegated.target.slice(0,6)), txt.slice(-320));
    await page.locator('#out button', { hasText:'Deliver to' }).first().click();
    await attendre(async () => sent.length === 1, 25000, 'transaction envoyée');
    const txt2 = await outText(page);
    check('aucun garde-fou : envoi direct',
      sent.length === 1 && !txt2.includes('sends native ETH'), `envoyées=${sent.length}`);
    await browser.close();
  }

  console.log(fails === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${fails} ÉCHEC(S)`);
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
