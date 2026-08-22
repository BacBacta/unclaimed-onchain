const { chromium } = require('playwright');
const fs=require('fs');
const html=fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8');
const ACC='0x63c11dbe6a2c33b14993e6000b9d5ae17277f34f';
const D = Object.assign({rpc:20000, prompt:180000, slow:4000}, JSON.parse(process.env.DELAIS || '{}'));
let fails=0; const check=(l,c,d)=>{if(!c)fails++;console.log(c?'  ok   ':' FAIL  ',l,c?'':'\n         '+(d||''));};
async function run(mode){
  const b=await chromium.launch({...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),args:['--no-sandbox']});
  const page=await b.newPage();
  await page.addInitScript(([acc,m])=>{
    let chain = m==='dejaBase' ? '0x2105' : '0x1';
    window.ethereum={isMetaMask:true,on:()=>{},removeListener:()=>{},
      request:({method})=>{
        if(method==='eth_accounts'||method==='eth_requestAccounts') return Promise.resolve([acc]);
        if(method==='eth_chainId') return Promise.resolve(chain);
        if(method==='wallet_switchEthereumChain'){
          if(m==='fenetrePerdue') return new Promise(()=>{});     // MetaMask/Firefox : fenêtre jamais vue
          if(m==='reseauAbsent') return Promise.reject(Object.assign(new Error('Unrecognized chain'),{code:4902}));
          chain='0x2105'; return Promise.resolve(null);
        }
        if(method==='eth_call') return Promise.resolve('0x'+'0'.repeat(63)+'5');
        if(method==='eth_getCode') return Promise.resolve('0x');
        return Promise.resolve(null);
      }};
  },[ACC,mode]);
  await page.route('https://bacbacta.github.io/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
  await page.route('**fonts.g**',r=>r.abort());
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/',{waitUntil:'load'});
  await page.waitForTimeout(700);
  await page.fill('#addr','0x7229BaceEb5ed0ba32e862FF794C59C1950c926a');
  await page.click('#go'); await page.waitForTimeout(700);
  await page.locator('#out button',{hasText:'Verify live'}).first().click();
  /* Le message d'attente n'existe qu'entre le clic et l'expiration de
     PROMPT_MS : on l'échantillonne pendant qu'il est en vol, plutôt qu'à
     un instant fixe qui dépend de la valeur de la borne. */
  const t0=Date.now(); let tot='', totMs=Infinity, attente='', txt='';
  const AVANT_BORNE = Math.min(D.prompt - 400, 7200);   // encore en attente
  const FIN = Math.min(D.prompt, 20000) + 4000;         // après expiration
  while (Date.now()-t0 < FIN) {
    txt = await page.locator('#out').innerText().catch(()=> '');
    if (!tot && /on another network/.test(txt)) { tot=txt; totMs=Date.now()-t0; }
    if (Date.now()-t0 < AVANT_BORNE) attente = txt;
    if (/Balances re-read|not configured in your wallet/.test(txt)) break;
    await page.waitForTimeout(250);
  }
  await b.close(); return {tot, totMs, attente, txt};
}
(async()=>{
  console.log('A — wallet sur Ethereum, fenêtre de changement jamais vue (votre cas)');
  const A=await run('fenetrePerdue'); let t=A.attente;   // état pendant l'attente
  check('annonce immédiatement le changement de réseau demandé', /on another network/.test(t), t.slice(-320));
  check('nomme le réseau visé', /switch to Base/.test(t), t.slice(-320));
  check('indique où trouver la fenêtre en attente', /waiting there/.test(t), t.slice(-320));
  check('propose de basculer soi-même', /switch to Base yourself/.test(t), t.slice(-320));
  check('message affiché sans attendre', A.totMs < 2500, 'apparu après ' + A.totMs + ' ms');
  check('le message précis n\'est pas écrasé par le générique',
    !/queued behind another one/.test(t), t.slice(-320));

  console.log('\nB — wallet sur Ethereum, changement accepté');
  t=(await run('accepte')).txt;
  check('la lecture aboutit après bascule', /Balances re-read/.test(t), t.slice(-260));

  console.log('\nC — wallet déjà sur Base');
  t=(await run('dejaBase')).txt;
  check('aucune demande de changement', !/on another network/.test(t), t.slice(-260));
  check('lecture directe', /Balances re-read/.test(t), t.slice(-260));

  console.log('\nD — réseau Base absent du wallet');
  t=(await run('reseauAbsent')).txt;
  check('signale le réseau manquant', /not configured in your wallet/.test(t), t.slice(-260));
  console.log(fails===0?'\nTOUS LES TESTS PASSENT':`\n${fails} ÉCHEC(S)`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
