const { chromium } = require('playwright');
const fs = require('fs');
const html = fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'), 'utf8');
/* Bornes de la page sous test : le lanceur peut les raccourcir (DELAIS) pour
   ne pas payer trois minutes d'attente réelle par scénario. */
const D = Object.assign({rpc:20000, prompt:180000, slow:4000, guet:10000},
  JSON.parse(process.env.DELAIS || '{}'));
const ADDR = '0x7229BaceEb5ed0ba32e862FF794C59C1950c926a';   // Zora / Base
let fails = 0;
const check = (l,c,d)=>{ if(!c) fails++; console.log(c?'  ok   ':' FAIL  ', l, c?'':'\n         '+(d||'')); };

async function run(mode) {
  const browser = await chromium.launch({
    ...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}), args:['--no-sandbox'] });
  const page = await browser.newPage();
  await page.addInitScript((m) => {
    const never = () => new Promise(() => {});               // ne se résout jamais
    window.ethereum = { isMetaMask:true, on:()=>{}, removeListener:()=>{},
      request: ({method, params}) => {
        if (m === 'muet') return never();                     // wallet totalement muet
        if (method === 'eth_chainId') return Promise.resolve('0x2105');
        if (method === 'eth_accounts') return Promise.resolve([]);   // verrouillé / non connecté
        if (m === 'verrouille') return never();               // tout le reste reste en attente
        if (method === 'eth_requestAccounts') return Promise.reject(Object.assign(new Error('User rejected'), {code:4001}));
        return never();
      } };
  }, mode);
  await page.route('https://bacbacta.github.io/**', r =>
    r.fulfill({status:200, contentType:'text/html; charset=utf-8', body:html}));
  await page.route('**fonts.g**', r => r.abort());
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/', {waitUntil:'load'});
  await page.waitForTimeout(700);
  await page.fill('#addr', ADDR); await page.click('#go'); await page.waitForTimeout(600);
  await page.locator('#out button', {hasText:'Verify live'}).first().click();
  return { browser, page };
}

(async () => {
  const LIMITE = D.rpc + 6000;   // la borne RPC, plus une marge
  console.log('scénario A — wallet totalement muet (aucune réponse)');
  {
    const { browser, page } = await run('muet');
    const t0 = Date.now();
    let txt = '';
    while (Date.now() - t0 < LIMITE) {
      txt = await page.locator('#out').innerText().catch(()=> '');
      if (/did not answer|No account is connected/.test(txt)) break;
      await page.waitForTimeout(Math.min(1000, D.rpc / 4));
    }
    const dt = ((Date.now()-t0)/1000).toFixed(1);
    check(`sort de l'attente en ${dt}s au lieu de se figer`, /did not answer/.test(txt), txt.slice(-260));
    check('le message figé « Reading real balances… » a disparu',
      !/Reading real balances…$/.test(txt.trim()), txt.slice(-160));
    await browser.close();
  }

  console.log('\nscénario B — wallet verrouillé (eth_accounts vide, puis silence)');
  {
    const { browser, page } = await run('verrouille');
    const t0 = Date.now(); let txt='';
    while (Date.now() - t0 < D.prompt + 20000) {
      txt = await page.locator('#out').innerText().catch(()=> '');
      if (/did not answer|No account is connected/.test(txt)) break;
      await page.waitForTimeout(Math.min(2000, D.prompt / 4));
    }
    check('une demande de connexion est bien émise puis bornée',
      /did not answer|No account is connected/.test(txt), txt.slice(-260));
    await browser.close();
  }

  console.log('\nscénario C — connexion refusée par l\'utilisateur');
  {
    const { browser, page } = await run('refus');
    await page.waitForTimeout(3000);
    const txt = await page.locator('#out').innerText().catch(()=> '');
    check('le refus est signalé immédiatement, sans blocage',
      /User rejected|rejected|refus/i.test(txt), txt.slice(-240));
    await browser.close();
  }

  console.log(fails===0 ? '\nTOUS LES TESTS PASSENT' : `\n${fails} ÉCHEC(S)`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
