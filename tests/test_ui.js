const { chromium, devices } = require('playwright');
const fs=require('fs');
const html=fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8');
const SIGNER='0x000000000000000000000000000000000000bEEF';
const HOSTS=['https://mainnet.base.org','https://base-rpc.publicnode.com',
 'https://ethereum-rpc.publicnode.com','https://cloudflare-eth.com',
 'https://mainnet.optimism.io','https://optimism-rpc.publicnode.com'];
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
let fails=0; const check=(l,c,d)=>{if(!c)fails++;console.log(c?'  ok   ':' FAIL  ',l,c?'':'\n         '+(d||''));};

async function open(mobile){
  const b=await chromium.launch({...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),args:['--no-sandbox']});
  const ctx=await b.newContext(mobile?devices['iPhone 13']:{viewport:{width:1000,height:900}});
  const page=await ctx.newPage();
  const sent=[];
  await page.exposeFunction('__tx', t=>sent.push(t));
  await page.addInitScript(([s])=>{
    window.ethereum={isMetaMask:true,on:()=>{},removeListener:()=>{},
      request: async ({method,params})=>{
        if(method==='eth_accounts'||method==='eth_requestAccounts') return [s];
        if(method==='eth_chainId') return '0x1';
        if(method==='wallet_switchEthereumChain') return null;
        if(method==='eth_getCode') return '0x';
        if(method==='eth_sendTransaction'){ window.__tx(1); return '0x'+'ab'.repeat(32); }
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
  return {b,page,sent};
}
// adresse à nombreuses positions sur une chaîne
async function grosse(page){
  return await page.evaluate(()=>{
    let best=null,n=0;
    for(const [a,rows] of Object.entries(SNAP.a)){
      const parCh={}; for(const r of rows) parCh[r[1]]=(parCh[r[1]]||0)+1;
      const m=Math.max(...Object.values(parCh));
      if(m>n){n=m;best=a;}
    }
    return {addr:'0x'+best, max:n};
  });
}
(async()=>{
  console.log('A — liste déroulante pour les adresses à nombreuses positions');
  { const {b,page}=await open(false);
    const g=await grosse(page);
    console.log('   adresse la plus fournie :', g.addr, '·', g.max, 'positions sur une chaîne');
    await page.fill('#addr', g.addr); await page.click('#go');
    const t0=Date.now(); while(Date.now()-t0<60000){
      if(/re-read live|not re-read/.test(await page.locator('#out').innerText().catch(()=> ''))) break;
      await page.waitForTimeout(1200); }
    await page.waitForTimeout(500);
    const listes=page.locator('#out .poslist.scroll');
    check('la liste longue est mise en conteneur défilant', await listes.count()>=1, 'conteneurs='+await listes.count());
    const box=await listes.first().boundingBox();
    check('sa hauteur est bornée (≤ 340 px)', box && box.height<=340, box? box.height+'px':'introuvable');
    const m=await listes.first().evaluate(n=>({sh:n.scrollHeight, ch:n.clientHeight,
      oc:getComputedStyle(n).overscrollBehaviorY}));
    check('elle défile réellement', m.sh>m.ch+20, `contenu ${m.sh}px / visible ${m.ch}px`);
    check('le défilement ne se propage pas à la page', m.oc==='contain', m.oc);
    check('le nombre de positions est annoncé', /balances/i.test(await page.locator('#out .chain-head').first().innerText()),
      await page.locator('#out .chain-head').first().innerText());
    // le scroll interne ne bouge pas la page
    await listes.first().hover();                       // hover fait lui-même défiler jusqu'à l'élément
    await page.waitForTimeout(300);
    const avant=await page.evaluate(()=>window.scrollY);
    await page.mouse.wheel(0,400); await page.waitForTimeout(400);
    const apres=await page.evaluate(()=>window.scrollY);
    const dedans=await listes.first().evaluate(n=>n.scrollTop);
    check('molette dans la liste : elle défile, la page non', dedans>50 && apres===avant,
      `liste=${dedans}px page=${avant}→${apres}`);
    await page.locator('#out .chain').first().screenshot({path:'ui-liste.png'});
    await b.close(); }

  console.log('\nB — le bloc de soutien remonte sous la confirmation');
  { const {b,page,sent}=await open(false);
    const g=await grosse(page);
    await page.fill('#addr', g.addr); await page.click('#go');
    const t0=Date.now(); while(Date.now()-t0<60000){
      if(/re-read live|not re-read/.test(await page.locator('#out').innerText().catch(()=> ''))) break;
      await page.waitForTimeout(1200); }
    check('bloc de soutien caché avant tout retrait', await page.locator('#tip').isHidden());
    await page.locator('#out button',{hasText:/Deliver to|Claim on/}).first().click();
    await page.waitForTimeout(5000);
    check('des transactions ont été envoyées', sent.length>0, 'envoyées='+sent.length);
    check('bloc de soutien désormais visible', await page.locator('#tip').isVisible());
    check('il est placé DANS les résultats', await page.evaluate(()=>document.getElementById('tip').parentElement.id==='out'));
    const ordre=await page.evaluate(()=>{
      const msgs=[...document.querySelectorAll('#out .msg.ok')];
      const tip=document.getElementById('tip');
      const dernier=msgs[msgs.length-1];
      return dernier ? (dernier.compareDocumentPosition(tip) & Node.DOCUMENT_POSITION_FOLLOWING)>0 : false;
    });
    check('il suit immédiatement le message de confirmation', ordre);
    check('il est mis en évidence', await page.locator('#tip').evaluate(n=>n.classList.contains('spot')));
    check('il est dans la fenêtre visible', await page.locator('#tip').isVisible() &&
      await page.evaluate(()=>{const r=document.getElementById('tip').getBoundingClientRect();
        return r.top < innerHeight && r.bottom > 0;}));
    await page.locator('#tip').screenshot({path:'ui-tip.png'});

    // une nouvelle recherche ne doit pas le détruire
    await page.fill('#addr','0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'); await page.click('#go');
    await page.waitForTimeout(2500);
    check('après une nouvelle recherche, le bloc est préservé et remis à sa place',
      await page.locator('#tip').count()===1 &&
      await page.evaluate(()=>document.getElementById('tip').parentElement.id!=='out'));
    check('et il est de nouveau masqué', await page.locator('#tip').isHidden());
    await b.close(); }

  console.log('\nC — mobile : le conteneur reste utilisable');
  { const {b,page}=await open(true);
    const g=await grosse(page);
    await page.fill('#addr', g.addr); await page.click('#go');
    const t0=Date.now(); while(Date.now()-t0<60000){
      if(/re-read live|not re-read/.test(await page.locator('#out').innerText().catch(()=> ''))) break;
      await page.waitForTimeout(1200); }
    await page.waitForTimeout(400);
    const l=page.locator('#out .poslist.scroll').first();
    check('conteneur présent sur mobile', await l.count()>=1);
    const box=await l.boundingBox();
    check('hauteur bornée sur petit écran', box && box.height<=340, box?box.height+'px':'?');
    await b.close(); }

  console.log(fails===0?'\nTOUS LES TESTS PASSENT':`\n${fails} ÉCHEC(S)`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
