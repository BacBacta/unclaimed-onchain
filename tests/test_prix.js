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
  const r={txt,
    total:await page.locator('#out .total .big').innerText().catch(()=>'?'),
    sous:await page.locator('#out .chain-head .amt').allInnerTexts().catch(()=>[]),
    tok:await page.locator('#out .pos .tok').allInnerTexts().catch(()=>[]),
    usd:await page.locator('#out .pos .usd').allInnerTexts().catch(()=>[])};
  console.log(`   [${label}] total ${r.total} · sous ${JSON.stringify(r.sous)} · ligne ${JSON.stringify(r.tok)} ${JSON.stringify(r.usd)}`);
  await b.close(); return r;
}
(async()=>{
  console.log('adresse :', A, '(35 AZTEC ≈ 0,49 $, absente de l\'instantané)\n');
  /* AVANT=live.html rejoue le bug sur les octets déployés — utile une fois,
     inutile à chaque tour : la non-régression, c'est la page d'après. */
  const avant = process.env.AVANT ? await essai(fs.readFileSync(process.env.AVANT,'utf8'),'en ligne') : null;
  const apres=await essai(fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8'),'corrigé');
  console.log();
  if (avant) {
    check('bug reproduit : total à zéro sur la version en ligne', /\$0\.00/.test(avant.total), avant.total);
    check('bug reproduit : point décimal orphelin', avant.tok.some(t=>/\d\.\s|\d\.$/.test(t)), JSON.stringify(avant.tok));
  }
  check('après correctif : le montant s\'écrit « 35 AZTEC »',
    apres.tok.some(t=>/^35 AZTEC$/.test(t.trim())), JSON.stringify(apres.tok));
  check('après correctif : la ligne est valorisée (~0,49 $)',
    apres.usd.some(u=>/^\$0\.4\d$/.test(u.trim())), JSON.stringify(apres.usd));
  check('après correctif : le total n\'est plus nul', !/\$0\.00/.test(apres.total), apres.total);
  check('après correctif : le sous-total de chaîne suit', apres.sous.some(x=>/\$0\.4\d/.test(x)), JSON.stringify(apres.sous));
  check('l\'intitulé n\'annonce pas « déjà réclamé »', !/Already claimed/i.test(apres.txt));
  console.log(fails===0?'\nTOUS LES TESTS PASSENT':`\n${fails} ÉCHEC(S)`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
