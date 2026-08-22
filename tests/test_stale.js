const { chromium } = require('playwright');
const fs=require('fs');
const html=fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8');
const VIDE='0x7229BaceEb5ed0ba32e862FF794C59C1950c926a';        // retiré : solde réel 0
const PLEIN='0x6BAb38eD8e3c942DCC287bE471D651055B615c7E';        // encore crédité
const BASE=['https://mainnet.base.org','https://base-rpc.publicnode.com'];
let fails=0; const check=(l,c,d)=>{if(!c)fails++;console.log(c?'  ok   ':' FAIL  ',l,c?'':'\n         '+(d||''));};
async function rpc(m,p){let e;for(const u of BASE){try{
 const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'curl/8.5.0'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:m,params:p})});
 const j=await r.json(); if(j.result!==undefined)return j.result; if(j.error)e=j.error;}catch(x){e=x}}
 throw new Error(m);}

async function open(){
  const b=await chromium.launch({...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),args:['--no-sandbox']});
  const page=await b.newPage();
  await page.exposeFunction('__bridge',(m,p)=>rpc(m,p));
  await page.addInitScript(()=>{
    window.ethereum={isMetaMask:true,on:()=>{},removeListener:()=>{},
      request: async ({method,params})=>{
        if(method==='eth_accounts'||method==='eth_requestAccounts') return ['0x000000000000000000000000000000000000bEEF'];
        if(method==='eth_chainId') return '0x2105';
        if(method==='wallet_switchEthereumChain') return null;
        return await window.__bridge(method, params||[]); }};
  });
  await page.route('https://bacbacta.github.io/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
  await page.route('**fonts.g**',r=>r.abort());
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/',{waitUntil:'load'});
  await page.waitForTimeout(900);
  return {b,page};
}
async function verifier(page, addr){
  await page.fill('#addr',addr); await page.click('#go'); await page.waitForTimeout(900);
  const avant=await page.locator('#out').innerText();
  await page.locator('#out button',{hasText:'Verify live'}).first().click();
  const t0=Date.now(); let txt='';
  while(Date.now()-t0<45000){ txt=await page.locator('#out').innerText().catch(()=> '');
    if(/Balances re-read|is a regular wallet/.test(txt)) break; await page.waitForTimeout(1500); }
  await page.waitForTimeout(800);
  return {avant, apres:await page.locator('#out').innerText()};
}
const grandTotal = p => p.locator('#out .total .big').innerText();
const lead = p => p.locator('#out .total .lead').innerText();

(async()=>{
  console.log('A — adresse dont les fonds ont été retirés (état réel : 0)');
  { const {b,page}=await open();
    const {avant,apres}=await verifier(page, VIDE);
    check('avant relecture : montant de l\'instantané affiché', /\$45/.test(avant), avant.slice(0,120));
    check('après relecture : total ramené à $0.00', (await grandTotal(page))==='$0.00', await grandTotal(page));
    check('l\'intitulé n\'annonce plus une attente', /Already claimed/i.test(await lead(page)), await lead(page));
    check('message explicite affiché', /Nothing is waiting for this address any more/.test(apres), apres.slice(-400));
    check('la ligne indique bien « already claimed »', /already claimed/.test(apres));
    await b.close(); }

  console.log('\nB — adresse encore créditée : rien ne doit changer');
  { const {b,page}=await open();
    await page.fill('#addr',PLEIN); await page.click('#go');
    /* 900 ms attrapait le total pendant le balayage automatique et son
       animation : la comparaison portait alors sur un chiffre transitoire.
       On attend que le direct se soit posé avant de prendre la référence. */
    { const t=Date.now(); let x='';
      while(Date.now()-t<45000){ x=await page.locator('#out').innerText().catch(()=> '');
        if(/re-read live|not re-read|Nothing/.test(x)) break; await page.waitForTimeout(150); } }
    await page.waitForTimeout(1100);   // laisser l'animation du total se terminer
    const totalAvant=await grandTotal(page);
    await page.locator('#out button',{hasText:'Verify live'}).first().click();
    const t0=Date.now(); let apres='';
    while(Date.now()-t0<45000){ apres=await page.locator('#out').innerText().catch(()=> '');
      if(/Balances re-read|is a regular wallet/.test(apres)) break; await page.waitForTimeout(1500); }
    await page.waitForTimeout(800); apres=await page.locator('#out').innerText();
    const totalApres=await grandTotal(page);
    check('total strictement inchangé', totalApres===totalAvant && totalApres!=='$0.00',
      totalAvant+' → '+totalApres);
    check('intitulé inchangé', /Waiting for you/i.test(await lead(page)), await lead(page));
    check('aucun message « already claimed »', !/Nothing is waiting/.test(apres), apres.slice(-260));
    check('solde confirmé', /real balance confirmed/.test(apres), apres.slice(-260));
    await b.close(); }

  console.log('\nC — retrait présent dans l\'historique local');
  { const {b,page}=await open();
    await page.evaluate(a=>{
      localStorage.setItem('unclaimed-onchain.withdrawals.v1', JSON.stringify([{
        h:'0xd7c45f12de88330ad0ca4c84dbbddf160b668a81c4ed932195bcbe440e5acd47',
        c:8453, a:a.slice(2).toLowerCase(), l:'Zora', d:true, t:Date.now()-3600e3, s:'ok',
        m:[{a:0.018594,s:'ETH'}] }]));
    }, VIDE);
    await page.reload({waitUntil:'load'}); await page.waitForTimeout(1000);
    await page.fill('#addr',VIDE); await page.click('#go'); await page.waitForTimeout(1000);
    const txt=await page.locator('#out').innerText();
    check('la recherche signale le retrait déjà envoyé',
      /You already sent a withdrawal for this address/.test(txt), txt.slice(0,400));
    check('avertit que les chiffres sont ceux de l\'instantané',
      /do not reflect it/.test(txt), txt.slice(0,400));
    const lien=await page.locator('#out a[href*="basescan.org/tx/"]').first().getAttribute('href');
    check('lien vers la transaction fourni',
      lien==='https://basescan.org/tx/0xd7c45f12de88330ad0ca4c84dbbddf160b668a81c4ed932195bcbe440e5acd47', lien);
    await page.locator('#out').screenshot({path:'deja-retire.png'});
    await b.close(); }

  console.log('\nD — adresse sans historique : aucun avertissement parasite');
  { const {b,page}=await open();
    await page.fill('#addr',PLEIN); await page.click('#go'); await page.waitForTimeout(900);
    check('aucun message d\'historique', !/already sent a withdrawal/.test(await page.locator('#out').innerText()));
    await b.close(); }

  console.log(fails===0?'\nTOUS LES TESTS PASSENT':`\n${fails} ÉCHEC(S)`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
