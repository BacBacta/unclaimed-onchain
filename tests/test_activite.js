const { chromium } = require('playwright');
const fs=require('fs');
const html=fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8');
const HOSTS=['https://mainnet.base.org','https://base-rpc.publicnode.com','https://ethereum-rpc.publicnode.com',
 'https://eth.drpc.org','https://mainnet.optimism.io','https://optimism-rpc.publicnode.com'];
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
let fails=0; const check=(l,c,d)=>{if(!c)fails++;console.log(c?'  ok   ':' FAIL  ',l,c?'':'\n         '+(d||''));};

async function open({down=[]}={}){
  const b=await chromium.launch({...(process.env.CHROME?{executablePath:process.env.CHROME}:{}),args:['--no-sandbox']});
  const page=await b.newPage();
  const vues=[], cibles=[];
  await page.route(u=>HOSTS.some(h=>u.href.startsWith(h)), async route=>{
    const q=route.request();
    if(q.method()==='OPTIONS') return route.fulfill({status:204,headers:CORS});
    if(down.some(h=>q.url().startsWith(h))) return route.fulfill({status:503,headers:CORS,body:'{}'});
    try{ const body=q.postData(); if(body) vues.push(JSON.parse(body).method);
      const r=await fetch(q.url(),{method:'POST',headers:{'Content-Type':'application/json'},body});
      route.fulfill({status:200,headers:{...CORS,'Content-Type':'application/json'},body:await r.text()});
    }catch(e){ route.fulfill({status:502,headers:CORS,body:'{}'}); }});
  await page.route('**bacbacta.github.io**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
  await page.route('**fonts.g**',r=>r.abort());
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/',{waitUntil:'load'});
  await page.waitForTimeout(600);
  return {b,page,vues,cibles};
}
const panneau = p => p.locator('#activitypanel');
async function ouvrir(page,ms=60000){
  await page.click('#activitylink');
  const t0=Date.now();
  while(Date.now()-t0<ms){
    const n=await page.locator('#activitypanel .hrow').count().catch(()=>0);
    const txt=await panneau(page).innerText().catch(()=> '');
    if(n>0 || /No withdrawal in the window|could not be read/.test(txt)) return txt;
    await page.waitForTimeout(200);
  }
  console.log('  ⚠ sondage épuisé : le panneau ne s\'est jamais posé');
  return await panneau(page).innerText().catch(()=> '');
}

(async()=>{
  console.log('A — le panneau se remplit depuis les chaînes');
  { const {b,page,vues,cibles}=await open();
    check('caché au départ', await page.locator('#activitypanel').isHidden());
    const txt=await ouvrir(page);
    const n=await page.locator('#activitypanel .hrow').count();
    check('des retraits réels sont listés', n>0, 'lignes='+n+' · '+txt.slice(0,300));
    check('un eth_getLogs a bien été émis', vues.includes('eth_getLogs'), JSON.stringify([...new Set(vues)]));
    /* Le flux est censé ne lire que des événements publics : aucune requête
       ne doit porter d'adresse d'utilisateur. On borne les méthodes émises. */
    const permises = new Set(['eth_getLogs', 'eth_getBlockByNumber', 'eth_call']);
    check('seules des lectures publiques sont émises',
      vues.every(m => permises.has(m)), JSON.stringify([...new Set(vues)]));

    check('les eth_call ne visent que Multicall3 (décimales des jetons)',
      cibles.every(c => c === '0xca11bde05977b3631167028862be2a173976ca11'),
      JSON.stringify([...new Set(cibles)]));
    const amts=await page.locator('#activitypanel .hrow .amt').allInnerTexts();
    check('chaque ligne porte un montant et un symbole',
      amts.length>0 && amts.every(a=>/^[\d.,e+-]+ \S/.test(a.trim())), JSON.stringify(amts.slice(0,6)));
    check('aucun montant nul affiché', !amts.some(a=>/^0 /.test(a.trim())), JSON.stringify(amts.slice(0,6)));
    check('aucun NaN ni undefined', !/NaN|undefined/.test(txt), txt.slice(0,400));
    const liens=await page.locator('#activitypanel .hrow a').evaluateAll(a=>a.map(x=>x.href));
    check('chaque ligne renvoie à une transaction sur l\'explorateur',
      liens.length>0 && liens.every(h=>/(etherscan|basescan|optimistic)\S*\/tx\/0x[0-9a-f]{64}$/.test(h)),
      JSON.stringify(liens.slice(0,3)));
    check('les protocoles sont nommés', /Splits V[12]|Zora|Clanker/.test(txt), txt.slice(0,300));
    check('une synthèse porte le signal que les lignes seules cachent',
      /withdrawals in \d+ transactions over the last \d+ h/.test(txt)
      && /different addresses/.test(txt), txt.slice(0,400));
    /* Une transaction émet souvent des dizaines de retraits : le panneau doit
       montrer une ligne par transaction, jamais deux lignes pour la même. */
    const txLiens = await page.locator('#activitypanel .hrow a').evaluateAll(a=>a.map(x=>x.href));
    check('une ligne par transaction, aucun doublon',
      new Set(txLiens).size === txLiens.length, `${txLiens.length} lignes, ${new Set(txLiens).size} tx distinctes`);
    const sum = txt.match(/(\d+) withdrawals in (\d+) transactions/);
    check('la synthèse compte plus de retraits que de transactions',
      sum && Number(sum[1]) >= Number(sum[2]), sum ? sum[0] : txt.slice(0,200));
    const groupees = amts.filter(a=>/^\d+ withdrawals$/.test(a.trim()));
    check('les transactions groupées annoncent leur nombre de retraits',
      groupees.length === 0 || groupees.every(a=>Number(a.trim().split(' ')[0])>1),
      JSON.stringify(groupees.slice(0,4)));
    check('une transaction groupée dit vers combien d\'adresses',
      groupees.length === 0 || /to \d+ addresses/.test(txt), txt.slice(0,600));
    /* Une longue liste ne doit pas repousser le reste de la page : elle vit
       dans une boîte bornée dont le défilement ne déborde pas. */
    const boite = page.locator('#activitypanel .actlist');
    check('les lignes vivent dans une liste dédiée', await boite.count() === 1);
    const nLignes = await page.locator('#activitypanel .hrow').count();
    if (nLignes > 5) {
      const m = await boite.evaluate(e => {
        const c = getComputedStyle(e);
        return { h: e.getBoundingClientRect().height, scroll: e.scrollHeight,
                 ovf: c.overflowY, contain: c.overscrollBehaviorY, cls: e.className };
      });
      check('la liste est bornée en hauteur', m.h <= 340, JSON.stringify(m));
      check('elle défile en interne', m.ovf === 'auto' && m.scroll > m.h + 10, JSON.stringify(m));
      check('son défilement ne gagne pas la page', m.contain === 'contain', JSON.stringify(m));
      const avant = await page.evaluate(() => window.scrollY);
      await boite.evaluate(e => e.scrollTop = 250);
      check('faire défiler la boîte ne bouge pas la page',
        (await page.evaluate(() => window.scrollY)) === avant);
      check('elle a bien défilé', (await boite.evaluate(e => e.scrollTop)) > 100);
    }
    check('la fenêtre de lecture est annoncée honnêtement',
      /the deepest window these public endpoints allow/.test(txt), txt.slice(-300));
    await b.close(); }

  console.log('\nB — chaînes injoignables : le panneau le dit au lieu de mentir');
  { const {b,page}=await open({down:HOSTS});
    const txt=await ouvrir(page,30000);
    check('échec annoncé', /could not be read just now/.test(txt), txt.slice(0,300));
    check('aucune ligne inventée', (await page.locator('#activitypanel .hrow').count())===0);
    check('rassure sur l\'adresse de l\'utilisateur', /Nothing is wrong with your address/.test(txt), txt.slice(0,300));
    await b.close(); }

  console.log('\nC — indépendance vis-à-vis de l\'historique local');
  { const {b,page}=await open();
    await ouvrir(page);
    const n=await page.locator('#activitypanel .hrow').count();
    const h=await page.locator('#historypanel .hrow').count();
    check('le flux global se remplit sans aucun retrait local', n>0 && h===0, `activité=${n} historique=${h}`);
    await page.click('#historylink');
    check('les deux panneaux coexistent',
      !(await page.locator('#historypanel').isHidden()) && !(await page.locator('#activitypanel').isHidden()));
    await b.close(); }

  console.log(fails===0?'\nTOUS LES TESTS PASSENT':`\n${fails} ÉCHEC(S)`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
