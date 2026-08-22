const { chromium } = require('playwright');
const fs=require('fs');
const html=fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8');
const D = Object.assign({rpc:20000, prompt:180000}, JSON.parse(process.env.DELAIS || '{}'));
let fails=0; const check=(l,c,d)=>{if(!c)fails++;console.log(c?'  ok   ':' FAIL  ',l,c?'':'\n         '+(d||''));};
async function run(setup){
  const b=await chromium.launch({...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),args:['--no-sandbox']});
  const page=await b.newPage();
  await page.addInitScript(setup);
  await page.route('https://bacbacta.github.io/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
  await page.route('**fonts.g**',r=>r.abort());
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/',{waitUntil:'load'});
  await page.waitForTimeout(600);
  await page.fill('#addr','0x7229BaceEb5ed0ba32e862FF794C59C1950c926a');
  await page.click('#go'); await page.waitForTimeout(600);
  await page.locator('#out button',{hasText:'Verify live'}).first().click();
  const t0=Date.now(); let txt='', intermediaire='';
  // scénario C laisse expirer PROMPT_MS : la fenêtre d'observation doit le couvrir
  const LIM = Number(process.env.LIM || D.prompt + 20000);
  while(Date.now()-t0<LIM){ txt=await page.locator('#out').innerText().catch(()=> '');
    if(/Waiting on your wallet|on another network/.test(txt) && !intermediaire) intermediaire=txt;
    if(/did not answer/.test(txt)) break; await page.waitForTimeout(1000); }
  await b.close(); return {txt, intermediaire};
}
(async()=>{
  console.log('A — fournisseur unique totalement muet');
  let {txt}=await run(()=>{ window.ethereum={isMetaMask:true,on:()=>{},removeListener:()=>{},
    request:()=>new Promise(()=>{})}; });
  check('nomme la méthode restée sans réponse', /eth_accounts/.test(txt), txt.slice(-300));
  check('indique le délai écoulé', new RegExp(`within ${Math.round(D.rpc/1000)}s`).test(txt), txt.slice(-300));
  check('oriente vers un fournisseur inerte', /answers nothing/.test(txt), txt.slice(-300));

  console.log('\nB — trois extensions en conflit');
  ({txt}=await run(()=>{ const dead=()=>new Promise(()=>{});
    window.ethereum={isMetaMask:true,on:()=>{},removeListener:()=>{},request:dead,
      providers:[{isMetaMask:true},{isCoinbaseWallet:true},{isPhantom:true}]}; }));
  check('signale le conflit et son nombre', /3 wallet extensions/.test(txt), txt.slice(-300));

  console.log('\nC — muet seulement sur le changement de chaîne');
  const r3=await run(()=>{ window.ethereum={isMetaMask:true,on:()=>{},removeListener:()=>{},
    request:({method})=>{ if(method==='eth_accounts'||method==='eth_requestAccounts') return Promise.resolve(['0x000000000000000000000000000000000000bEEF']);
      if(method==='eth_chainId') return Promise.resolve('0x1');
      return new Promise(()=>{}); }}; });
  check('retour intermédiaire (wallet ou réseau) sous 10s',
    /Waiting on your wallet|on another network/.test(r3.intermediaire), r3.intermediaire.slice(-260));
  check('accuse wallet_switchEthereumChain, pas la lecture',
    /wallet_switchEthereumChain/.test(r3.txt) && !/eth_accounts/.test(r3.txt), r3.txt.slice(-300));
  console.log(fails===0?'\nTOUS LES TESTS PASSENT':`\n${fails} ÉCHEC(S)`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
