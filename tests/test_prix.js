const { chromium } = require('playwright');
const fs=require('fs');
const A='0xB56847BB0B29789f306c86A5c1c9B1BBE493A7aE';   // 35 AZTEC ≈ 0,49 $, sous le seuil
const HOSTS=['https://mainnet.base.org','https://base-rpc.publicnode.com',
 'https://ethereum-rpc.publicnode.com','https://cloudflare-eth.com',
 'https://mainnet.optimism.io','https://optimism-rpc.publicnode.com'];
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
let fails=0; const check=(l,c,d)=>{if(!c)fails++;console.log(c?'  ok   ':' FAIL  ',l,c?'':'\n         '+(d||''));};
async function essai(html,label){
  const b=await chromium.launch({...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),args:['--no-sandbox']});
  const page=await b.newPage();
  await page.route(u=>HOSTS.some(h=>u.href.startsWith(h)), async r=>{
    const q=r.request();
    if(q.method()==='OPTIONS') return r.fulfill({status:204,headers:CORS});
    try{ const res=await fetch(q.url(),{method:'POST',
      headers:{'Content-Type':'application/json','User-Agent':'curl/8.5.0'},body:q.postData()});
      r.fulfill({status:200,headers:{...CORS,'Content-Type':'application/json'},body:await res.text()});
    }catch(e){ r.fulfill({status:502,headers:CORS,body:'{}'}); }});
  await page.route('https://bacbacta.github.io/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
  await page.route('**fonts.g**',r=>r.abort());
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/',{waitUntil:'load'});
  await page.waitForTimeout(900);
  await page.fill('#addr',A); await page.click('#go');
  const t0=Date.now(); let txt='';
  while(Date.now()-t0<60000){ txt=await page.locator('#out').innerText().catch(()=> '');
    if(/re-read live|Nothing credited/.test(txt)) break; await page.waitForTimeout(1200); }
  await page.waitForTimeout(500);
  const sonde = await page.evaluate(() => ({
    prixAztec: prixDe('0xA27EC0006e59f245217Ff08CD52A7E8b169E62D2'),
    valorise1000: 1000 * (prixDe('0xA27EC0006e59f245217Ff08CD52A7E8b169E62D2') || 0),
    fmt: Object.fromEntries([0, 1, 35, 100, 35.5, 0.5, 0.018594, 1234.5].map(n => [String(n), fmtAmt(n)])),
  })).catch(() => ({}));
  const r={...sonde, txt,
    total:await page.locator('#out .total .big').innerText().catch(()=>'?'),
    sous:await page.locator('#out .chain-head .amt').allInnerTexts().catch(()=>[]),
    tok:await page.locator('#out .pos .tok').allInnerTexts().catch(()=>[]),
    usd:await page.locator('#out .pos .usd').allInnerTexts().catch(()=>[])};
  console.log(`   [${label}] total ${r.total} · sous ${JSON.stringify(r.sous)} · ligne ${JSON.stringify(r.tok)} ${JSON.stringify(r.usd)}`);
  await b.close(); return r;
}
(async()=>{
  /* Ce test portait sur un solde onchain vivant (35 AZTEC à cette adresse).
     Quelqu'un les a réclamés — c'est le registre qui fonctionne, pas une
     régression — et le test cassait. Les deux correctifs se prouvent sans
     dépendre d'un solde : la fonction de prix et le formatage sont dans la
     page, et la seule chose qu'on demande au direct, c'est qu'aucune ligne
     ne reste sans valorisation, quel que soit le montant du jour. */
  console.log('adresse :', A, '(position AZTEC, absente de l\'instantané)\n');

  const apres = await essai(fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8'),'corrigé');

  check('prixDe() valorise AZTEC depuis l\'instantané entier',
    apres.prixAztec > 0.001 && apres.prixAztec < 1, 'prix=' + apres.prixAztec);
  check('un montant entier ne garde pas de point décimal orphelin',
    apres.fmt['35'] === '35' && apres.fmt['1'] === '1' && apres.fmt['100'] === '100',
    JSON.stringify(apres.fmt));
  check('les décimales utiles sont conservées',
    apres.fmt['35.5'] === '35.5' && apres.fmt['0.018594'] === '0.018594', JSON.stringify(apres.fmt));
  check('la valorisation d\'une position suit le prix du jeton',
    Math.abs(apres.prixAztec * 1000 - apres.valorise1000) < 0.01,
    `prix=${apres.prixAztec} · 1000 jetons valorisés ${apres.valorise1000}`);
  check('aucune ligne laissée sans prix à l\'écran',
    apres.usd.every(u => /^\$/.test(u.trim())), JSON.stringify(apres.usd));
  check('l\'intitulé n\'annonce pas « déjà réclamé » à tort',
    apres.usd.length === 0 || !/Already claimed/i.test(apres.txt));
  console.log(fails===0?'\nTOUS LES TESTS PASSENT':`\n${fails} ÉCHEC(S)`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
