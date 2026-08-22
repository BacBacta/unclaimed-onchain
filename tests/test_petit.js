const { chromium } = require('playwright');
const fs=require('fs');
const html=fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8');
const PETIT='0x01b5060790D6e7574f487d8E545ce793aFe6a800';   // ~0,90 $ sur Base (forme EIP-55 exacte)
const GROS='0x72B1202c820e4B2F8ac9573188B638866C7D9274';    // 507 k$, doit être intact
const HOSTS=['https://mainnet.base.org','https://base-rpc.publicnode.com',
 'https://ethereum-rpc.publicnode.com','https://cloudflare-eth.com',
 'https://mainnet.optimism.io','https://optimism-rpc.publicnode.com'];
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
let fails=0; const check=(l,c,d)=>{if(!c)fails++;console.log(c?'  ok   ':' FAIL  ',l,c?'':'\n         '+(d||''));};
(async()=>{
  const b=await chromium.launch({...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),args:['--no-sandbox']});
  const page=await b.newPage();
  await page.route(u=>HOSTS.some(h=>u.href.startsWith(h)), async route=>{
    const req=route.request();
    if(req.method()==='OPTIONS') return route.fulfill({status:204,headers:CORS});
    try{ const r=await fetch(req.url(),{method:'POST',
      headers:{'Content-Type':'application/json','User-Agent':'curl/8.5.0'},body:req.postData()});
      route.fulfill({status:200,headers:{...CORS,'Content-Type':'application/json'},body:await r.text()});
    }catch(e){ route.fulfill({status:502,headers:CORS,body:'{}'}); }});
  await page.route('https://bacbacta.github.io/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
  await page.route('**fonts.g**',r=>r.abort());
  const t0=Date.now();
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/',{waitUntil:'load'});
  await page.waitForTimeout(600);
  console.log('  chargement de la page :', Date.now()-t0, 'ms');
  const n=await page.evaluate(()=>Object.keys(SNAP.a).length);
  check('instantané bien au-delà de l\'ancien seuil (>20 000 adresses)', n>20000, 'n='+n);

  const wait=async(re,ms=45000)=>{const s=Date.now();let x='';
    while(Date.now()-s<ms){x=await page.locator('#out').innerText().catch(()=> '');
      if(re.test(x))return x; await page.waitForTimeout(1000);} return x;};

  await page.fill('#addr',PETIT); await page.click('#go');
  let txt=await wait(/re-read live|Already claimed|Nothing credited/);
  check('une adresse à 0,90 $ est trouvée dans l\'instantané', !/Reading the contracts/.test(txt), txt.slice(0,200));
  check('son montant est affiché', /0\.\d+ |\$\d/.test(txt), txt.slice(0,300));
  check('relecture en direct effectuée', /re-read live|Already claimed/.test(txt), txt.slice(-200));

  await page.fill('#addr',GROS); await page.click('#go');
  txt=await wait(/re-read live|Already claimed/);
  check('la grosse adresse est relue en direct (et non figée à 507 k$)',
    /re-read live/.test(txt) && !/507,097/.test(txt), txt.slice(0,300));
  check('ses positions Splits V1 apparaissent', /Splits V1/.test(txt), txt.slice(0,400));
  await b.close();
  console.log(fails===0?'\nTOUS LES TESTS PASSENT':`\n${fails} ÉCHEC(S)`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
