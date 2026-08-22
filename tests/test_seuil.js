const { chromium } = require('playwright');
const fs=require('fs');
const html=fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8');
const VITALIK='0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';  // DANS l'instantané, 1 position ≥25$
const VIDE='0x7229BaceEb5ed0ba32e862FF794C59C1950c926a';
const PLEIN='0x6BAb38eD8e3c942DCC287bE471D651055B615c7E';
const INCONNUE='0xd3d5ba1BF2A6De742beF4Ac47961FC07Bd86ff47';
const HOSTS=['https://mainnet.base.org','https://base-rpc.publicnode.com',
 'https://ethereum-rpc.publicnode.com','https://cloudflare-eth.com',
 'https://mainnet.optimism.io','https://optimism-rpc.publicnode.com'];
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
let fails=0; const check=(l,c,d)=>{if(!c)fails++;console.log(c?'  ok   ':' FAIL  ',l,c?'':'\n         '+(d||''));};

async function open({down=[]}={}){
  const b=await chromium.launch({...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),args:['--no-sandbox']});
  const page=await b.newPage();
  await page.route(u=>HOSTS.some(h=>u.href.startsWith(h)), async route=>{
    const req=route.request();
    if(req.method()==='OPTIONS') return route.fulfill({status:204,headers:CORS});
    if(down.some(h=>req.url().startsWith(h))) return route.fulfill({status:503,headers:CORS,body:'{}'});
    try{ const r=await fetch(req.url(),{method:'POST',
      headers:{'Content-Type':'application/json','User-Agent':'curl/8.5.0'},body:req.postData()});
      route.fulfill({status:200,headers:{...CORS,'Content-Type':'application/json'},body:await r.text()});
    }catch(e){ route.fulfill({status:502,headers:CORS,body:'{}'}); }
  });
  await page.route('https://bacbacta.github.io/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
  await page.route('**fonts.g**',r=>r.abort());
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/',{waitUntil:'load'});
  await page.waitForTimeout(900);
  return {b,page};
}
const txtOf=p=>p.locator('#out').innerText().catch(()=> '');
async function chercher(page,a,re,ms=60000){
  await page.fill('#addr',a); await page.click('#go');
  const t0=Date.now(); let x='';
  while(Date.now()-t0<ms){ x=await txtOf(page); if(re.test(x)) return x; await page.waitForTimeout(150); }
  console.log('  ⚠ sondage épuisé sans jamais voir ' + re);
  return x;
}

(async()=>{
  console.log('A — adresse DANS l\'instantané : ses positions sous le seuil apparaissent');
  { const {b,page}=await open();
    const snap=await page.evaluate(a=>JSON.stringify(SNAP.a[a.slice(2).toLowerCase()]), VITALIK);
    check('l\'instantané ne connaît qu\'une position', JSON.parse(snap).length===1, snap);
    const txt=await chercher(page,VITALIK,/re-read live/);
    check('la position connue est relue (0.038345 ETH)', /0\.038345 ETH/.test(txt), txt.slice(0,500));
    check('la poussière USDC sous le seuil est révélée', /USDC/.test(txt), txt.slice(0,600));
    check('la poussière WETH Clanker aussi', /WETH/.test(txt), txt.slice(0,600));
    const lignes=await page.locator('#out .pos .tok').allInnerTexts();
    check('4 positions affichées, contre 1 dans l\'instantané', lignes.length===4, JSON.stringify(lignes));
    const usds=await page.locator('#out .pos .usd').allInnerTexts();
    check('chaque position porte une valorisation, aucune « live ✓ »',
      usds.length===4 && usds.every(u=>/^\$/.test(u)), JSON.stringify(usds));
    check('la poussière est chiffrée à $0.00, pas laissée sans prix',
      usds.filter(u=>u==='$0.00').length===3, JSON.stringify(usds));
    check('aucune note « sans prix », puisque tout est valorisé',
      !/count as \$0 in the total/.test(txt), txt.slice(-400));
    await b.close(); }

  console.log('\nB — adresse retirée : toujours $0.00 et « Already claimed »');
  { const {b,page}=await open();
    const txt=await chercher(page,VIDE,/Already claimed|Nothing is waiting/);
    check('total à $0.00', (await page.locator('#out .total .big').innerText())==='$0.00');
    check('message explicite', /Nothing is waiting for this address any more/.test(txt), txt.slice(-300));
    await b.close(); }

  console.log('\nC — adresse encore créditée : montants et prix conservés');
  { const {b,page}=await open();
    const txt=await chercher(page,PLEIN,/re-read live/);
    check('total non nul', (await page.locator('#out .total .big').innerText())!=='$0.00',
      await page.locator('#out .total .big').innerText());
    check('valorisation en dollars conservée', /\$1[0-9],[0-9]{3}/.test(txt), txt.slice(0,300));
    await b.close(); }

  console.log('\nD — adresse inconnue de l\'instantané : inchangé');
  { const {b,page}=await open();
    const txt=await chercher(page,INCONNUE,/Nothing credited/);
    check('conclusion négative honnête', /Nothing credited to this address/.test(txt), txt.slice(-300));
    await b.close(); }

  console.log('\nE — RPC tous injoignables : repli sur l\'instantané, sans mentir');
  { const {b,page}=await open({down:HOSTS});
    await page.fill('#addr',VITALIK); await page.click('#go'); await page.waitForTimeout(6000);
    const txt=await txtOf(page);
    check('les chiffres de l\'instantané restent', /0\.038345 ETH/.test(txt), txt.slice(0,300));
    check('la légende avoue l\'échec', /live check unreachable/.test(await page.locator('#out .total .cap').innerText()),
      await page.locator('#out .total .cap').innerText());
    check('aucun faux « already claimed »', !/already claimed/i.test(txt));
    await b.close(); }

  console.log('\nF — une seule chaîne injoignable : ses positions restent, signalées');
  { const {b,page}=await open({down:['https://ethereum-rpc.publicnode.com','https://cloudflare-eth.com']});
    const txt=await chercher(page,PLEIN,/not re-read/);
    check('Ethereum signalé non relu', /not re-read — Ethereum unreachable/.test(txt), txt.slice(-300));
    check('les positions Base sont bien relues', /re-read live|live ✓|\$/.test(txt));
    await b.close(); }

  console.log(fails===0?'\nTOUS LES TESTS PASSENT':`\n${fails} ÉCHEC(S)`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
