const { chromium } = require('playwright');
const fs=require('fs');
const html=fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8');          // octets réellement servis
const A='0xdc8c831d1E90C00973466531c080d63B2Ae38578';
const AZ='a27ec0006e59f245217ff08cd52a7e8b169e62d2';
const SIGNER='0x000000000000000000000000000000000000bEEF';
const HOSTS=['https://mainnet.base.org','https://base-rpc.publicnode.com',
 'https://ethereum-rpc.publicnode.com','https://cloudflare-eth.com',
 'https://mainnet.optimism.io','https://optimism-rpc.publicnode.com'];
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
let fails=0; const check=(l,c,d)=>{if(!c)fails++;console.log(c?'  ok   ':' FAIL  ',l,c?'':'\n         '+(d||''));};
(async()=>{
  const b=await chromium.launch({...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),args:['--no-sandbox']});
  const page=await b.newPage({viewport:{width:1000,height:1100},deviceScaleFactor:2});
  const sent=[];
  await page.exposeFunction('__tx', t=>sent.push(t));
  await page.addInitScript(([s])=>{
    window.ethereum={isMetaMask:true,on:()=>{},removeListener:()=>{},
      request: async ({method,params})=>{
        if(method==='eth_accounts'||method==='eth_requestAccounts') return [s];
        if(method==='eth_chainId') return '0x1';
        if(method==='wallet_switchEthereumChain') return null;
        if(method==='eth_getCode') return '0x';
        if(method==='eth_sendTransaction'){ window.__tx(JSON.stringify(params[0])); return '0x'+'ab'.repeat(32); }
        return null; }};
  },[SIGNER]);
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
    if(/re-read live/.test(txt)) break; await page.waitForTimeout(1200); }

  console.log('--- ce que le site affiche ---');
  console.log(txt.split('\n').slice(0,12).join('\n'));
  console.log('---\n');
  check('la position AZTEC est trouvée', /AZTEC/.test(txt), txt.slice(0,300));
  check('montant correct (1 075 060 AZTEC)', /1,075,060 AZTEC/.test(txt), txt.slice(0,300));
  check('valorisation en dollars affichée (~15 000 $)', /\$1[45],\d{3}/.test(txt), txt.slice(0,300));
  check('relecture en direct effectuée', /re-read live from the contracts just now/.test(txt), txt.slice(0,400));
  check('chaîne Ethereum', /Ethereum/.test(txt));
  check('mode livraison actif', /Deliver to 0xdc8c…8578/.test(txt), txt.slice(0,400));
  check('lien explorateur Splits V2', /Splits V2/.test(txt));

  await page.locator('#out button',{hasText:'Deliver to'}).first().click();
  await page.waitForTimeout(6000);
  check('une transaction construite', sent.length===1, 'envoyées='+sent.length);
  if(sent.length){
    const tx=JSON.parse(sent[0]);
    const attendu='0xf940e385'+A.slice(2).toLowerCase().padStart(64,'0')+AZ.padStart(64,'0');
    console.log('\n  transaction préparée :');
    console.log('    to    :', tx.to);
    console.log('    data  :', tx.data);
    check('contrat = Splits V2 Warehouse', tx.to.toLowerCase()==='0x8fb66f38cf86a3d5e8768f8f1754a24a6c661fb8', tx.to);
    check('calldata = withdraw(bénéficiaire, AZTEC)', tx.data.toLowerCase()===attendu, tx.data+'\n         attendu '+attendu);
    check('le signataire n\'apparaît pas', !tx.data.toLowerCase().includes('beef'));
    check('aucun champ value', tx.value===undefined);
  }
  await page.locator('#out').screenshot({path:'aztec.png'});
  await b.close();
  console.log(fails===0?'\nTOUS LES TESTS PASSENT':`\n${fails} ÉCHEC(S)`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
