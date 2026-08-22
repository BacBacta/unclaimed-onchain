const { chromium } = require('playwright');
const fs = require('fs');
const html = fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8');
const VITALIK='d8da6bf26964af9d7eed9e03e53415d37aa96045';
const SIGNER='0x000000000000000000000000000000000000bEEF';
const HOSTS=['https://mainnet.base.org','https://base-rpc.publicnode.com',
  'https://ethereum-rpc.publicnode.com','https://cloudflare-eth.com',
  'https://mainnet.optimism.io','https://optimism-rpc.publicnode.com'];
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type',
            'Access-Control-Allow-Methods':'POST,OPTIONS'};
let fails=0; const check=(l,c,d)=>{if(!c)fails++;console.log(c?'  ok   ':' FAIL  ',l,c?'':'\n         '+(d||''));};

async function open({downHosts=[]}={}){
  const b=await chromium.launch({...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),args:['--no-sandbox']});
  const page=await b.newPage();
  const sent=[];
  await page.exposeFunction('__tx', t=>sent.push(t));
  await page.addInitScript(([signer])=>{
    window.ethereum={isMetaMask:true,on:()=>{},removeListener:()=>{},
      request: async ({method,params})=>{
        if(method==='eth_accounts'||method==='eth_requestAccounts') return [signer];
        if(method==='eth_chainId') return '0x2105';
        if(method==='wallet_switchEthereumChain') return null;
        if(method==='eth_getCode') return '0x';
        if(method==='eth_sendTransaction'){ window.__tx(JSON.stringify(params[0])); return '0x'+'ab'.repeat(32); }
        return null; }};
  },[SIGNER]);
  await page.route(u=>HOSTS.some(h=>u.href.startsWith(h)), async route=>{
    const req=route.request();
    if(req.method()==='OPTIONS') return route.fulfill({status:204, headers:CORS});
    if(downHosts.some(h=>req.url().startsWith(h))) return route.fulfill({status:503, headers:CORS, body:'{}'});
    try{
      const r=await fetch(req.url(),{method:'POST',
        headers:{'Content-Type':'application/json','User-Agent':'curl/8.5.0'}, body:req.postData()});
      route.fulfill({status:200, headers:{...CORS,'Content-Type':'application/json'}, body:await r.text()});
    }catch(e){ route.fulfill({status:502, headers:CORS, body:'{}'}); }
  });
  await page.route('https://bacbacta.github.io/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
  await page.route('**fonts.g**',r=>r.abort());
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/',{waitUntil:'load'});
  await page.waitForTimeout(900);
  return {b,page,sent};
}
async function waitFor(page,re,ms=60000){
  const t0=Date.now(); let txt='';
  while(Date.now()-t0<ms){ txt=await page.locator('#out').innerText().catch(()=> '');
    if(re.test(txt)) return txt; await page.waitForTimeout(1500); }
  console.log('  ⚠ sondage épuisé sans jamais voir ' + re);
  return txt;
}

(async()=>{
  console.log('A — adresse hors instantané : balayage auto, puis livraison');
  { const {b,page,sent}=await open();
    await page.evaluate(a=>{ delete SNAP.a[a]; }, VITALIK);
    await page.fill('#addr','0x'+VITALIK); await page.click('#go');
    const txt=await waitFor(page,/0\.038345 ETH/);
    const lignes=await page.locator('#out .pos .tok').allInnerTexts();
    check('positions réelles trouvées automatiquement', lignes.length>=3, JSON.stringify(lignes));
    check('0.038345 ETH affiché', /0\.038345 ETH/.test(txt));
    check('bouton de livraison présent (wallet détecté)', /Deliver to 0xd8dA…6045/.test(txt), txt.slice(-300));
    check('limite de couverture affichée', /brand-new token would not appear/.test(txt));
    await page.locator('#out button',{hasText:'Deliver to'}).first().click();
    await page.waitForTimeout(8000);
    check('transactions construites', sent.length>=3, 'envoyées='+sent.length);
    check('chaque calldata vise le bénéficiaire, jamais le signataire',
      sent.every(x=>{const tx=JSON.parse(x);return tx.data.includes(VITALIK)&&!tx.data.includes('beef')&&tx.value===undefined;}));
    await b.close(); }

  console.log('\nB — Optimism injoignable : couverture partielle annoncée');
  { const {b,page}=await open({downHosts:['https://mainnet.optimism.io','https://optimism-rpc.publicnode.com']});
    await page.fill('#addr','0xd3d5ba1BF2A6De742beF4Ac47961FC07Bd86ff47'); await page.click('#go');
    const full=await waitFor(page,/not re-read — Optimism/);
    check('le reste est balayé malgré la panne', /Nothing credited|not re-read/.test(full), full.slice(-260));
    check('Optimism signalé non relu', /not re-read — Optimism unreachable/.test(full), full.slice(-300));
    await b.close(); }

  console.log(fails===0?'\nTOUS LES TESTS PASSENT':`\n${fails} ÉCHEC(S)`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
