const { chromium } = require('playwright');
const fs = require('fs');
const html = fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8');
const VIDE='0x7229BaceEb5ed0ba32e862FF794C59C1950c926a';
const PLEIN='0x6BAb38eD8e3c942DCC287bE471D651055B615c7E';
const VITALIK='d8da6bf26964af9d7eed9e03e53415d37aa96045';
const INCONNUE='0xd3d5ba1BF2A6De742beF4Ac47961FC07Bd86ff47';
const HOSTS=['https://mainnet.base.org','https://base-rpc.publicnode.com',
  'https://ethereum-rpc.publicnode.com','https://cloudflare-eth.com',
  'https://mainnet.optimism.io','https://optimism-rpc.publicnode.com'];
let fails=0; const check=(l,c,d)=>{if(!c)fails++;console.log(c?'  ok   ':' FAIL  ',l,c?'':'\n         '+(d||''));};
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type',
            'Access-Control-Allow-Methods':'POST,OPTIONS'};

async function open({mode='real', wallet=false}={}){
  const b=await chromium.launch({...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),args:['--no-sandbox']});
  const page=await b.newPage();
  const rpcHits=[];
  if(wallet) await page.addInitScript(()=>{
    window.ethereum={isMetaMask:true,on:()=>{},removeListener:()=>{},
      request: async ({method})=>{
        if(method==='eth_accounts'||method==='eth_requestAccounts') return ['0x000000000000000000000000000000000000bEEF'];
        if(method==='eth_chainId') return '0x2105';
        return null; }};
  });
  await page.route(u=>HOSTS.some(h=>u.href.startsWith(h)), async route=>{
    const req=route.request();
    if(req.method()==='OPTIONS') return route.fulfill({status:204, headers:CORS});
    rpcHits.push(new URL(req.url()).host);
    if(mode==='down') return route.fulfill({status:503, headers:CORS, body:'{}'});
    try{
      const r=await fetch(req.url(),{method:'POST',
        headers:{'Content-Type':'application/json','User-Agent':'curl/8.5.0'},
        body:req.postData()});
      route.fulfill({status:200, headers:{...CORS,'Content-Type':'application/json'}, body:await r.text()});
    }catch(e){ route.fulfill({status:502, headers:CORS, body:'{}'}); }
  });
  await page.route('https://bacbacta.github.io/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
  await page.route('**fonts.g**',r=>r.abort());
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/',{waitUntil:'load'});
  await page.waitForTimeout(900);
  return {b,page,rpcHits};
}
const outTxt = p => p.locator('#out').innerText().catch(()=> '');
async function waitFor(page, re, ms=30000){
  const t0=Date.now(); let txt='';
  while(Date.now()-t0<ms){ txt=await outTxt(page); if(re.test(txt)) return txt; await page.waitForTimeout(1200); }
  return txt;
}

(async()=>{
  console.log('A — SANS WALLET : adresse retirée → le vrai montant s\'affiche tout seul');
  { const {b,page}=await open();
    await page.fill('#addr',VIDE); await page.click('#go');
    const txt=await waitFor(page,/Already claimed/);
    check('état « déjà réclamé » atteint sans aucun clic', /Nothing is waiting for this address any more/.test(txt), txt.slice(-300));
    check('total ramené à $0.00 automatiquement',
      (await page.locator('#out .total .big').innerText())==='$0.00',
      await page.locator('#out .total .big').innerText());
    check('intitulé « Already claimed »', /Already claimed/i.test(await page.locator('#out .total .lead').innerText()));
    check('légende : chiffres relus en direct',
      /re-read live from the contracts just now/.test(await page.locator('#out .total .cap').innerText()),
      await page.locator('#out .total .cap').innerText());
    check('plus aucune ligne de position affichée',
      (await page.locator('#out .pos').count())===0, 'lignes='+await page.locator('#out .pos').count());
    await b.close(); }

  console.log('\nB — SANS WALLET : adresse encore créditée → montants réels confirmés');
  { const {b,page}=await open();
    await page.fill('#addr',PLEIN); await page.click('#go');
    const txt=await waitFor(page,/re-read live from the contracts/);
    check('relecture automatique effectuée', /re-read live from the contracts just now/.test(txt), txt.slice(-300));
    check('total non nul conservé', (await page.locator('#out .total .big').innerText())!=='$0.00');
    check('légende passée en direct', /just now/.test(await page.locator('#out .total .cap').innerText()));
    await b.close(); }

  console.log('\nC — SANS WALLET : adresse inconnue avec fonds → balayage automatique');
  { const {b,page}=await open();
    await page.evaluate(a=>{ delete SNAP.a[a]; }, VITALIK);
    await page.fill('#addr','0x'+VITALIK); await page.click('#go');
    const txt=await waitFor(page,/0\.038345 ETH/, 60000);
    check('des positions trouvées sans wallet ni clic',
      (await page.locator('#out .pos').count())>=3, 'lignes='+await page.locator('#out .pos').count());
    check('la position Zora réelle affichée', /0\.038345 ETH/.test(txt), txt.slice(-400));
    check('repli explorateur proposé (pas de bouton de retrait sans wallet)',
      /use the contract links below/.test(txt) && !/Claim on Base/.test(txt), txt.slice(-400));
    await b.close(); }

  console.log('\nD — SANS WALLET : adresse inconnue vide → conclusion automatique');
  { const {b,page}=await open();
    await page.fill('#addr',INCONNUE); await page.click('#go');
    const txt=await waitFor(page,/Nothing credited/, 60000);
    check('« Nothing credited » automatique', /Nothing credited to this address/.test(txt), txt.slice(-300));
    await b.close(); }

  console.log('\nE — RPC injoignables → repli honnête sur l\'instantané');
  { const {b,page,rpcHits}=await open({mode:'down'});
    await page.fill('#addr',VIDE); await page.click('#go');
    await page.waitForTimeout(4000);
    check('total de l\'instantané conservé', /\$4[45]/.test(await page.locator('#out .total .big').innerText()),
      await page.locator('#out .total .big').innerText());
    check('légende le dit : relecture injoignable',
      /live check unreachable/.test(await page.locator('#out .total .cap').innerText()),
      await page.locator('#out .total .cap').innerText());
    check('les RPC ont bien été tentés', rpcHits.length>0, 'hits='+rpcHits.length);
    check('aucun faux « already claimed »', !/already claimed/.test(await outTxt(page)));
    await b.close(); }

  console.log('\nF — AVEC WALLET : Deliver désactivé automatiquement sur solde vidé');
  { const {b,page}=await open({wallet:true});
    await page.fill('#addr',VIDE); await page.click('#go');
    await waitFor(page,/already claimed/);
    await page.waitForTimeout(600);
    check('aucun bouton de retrait : il n\'y a plus rien à livrer',
      (await page.locator('#out button',{hasText:'Deliver to'}).count())===0);
    check('total à zéro affiché', (await page.locator('#out .total .big').innerText())==='$0.00');
    await page.locator('#out').screenshot({path:'auto-live.png'});
    await b.close(); }

  console.log(fails===0?'\nTOUS LES TESTS PASSENT':`\n${fails} ÉCHEC(S)`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
