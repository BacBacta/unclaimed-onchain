const { chromium } = require('playwright');
const fs=require('fs');
let fails=0; const check=(l,c,d)=>{if(!c)fails++;console.log(c?'  ok   ':' FAIL  ',l,c?'':'\n         '+(d||''));};

// Reproduit la condition exacte : une position relue en direct que l'instantané
// ne connaissait pas, donc sans prix (usd indéfini), puis recalcul du total.
async function essai(html){
  const b=await chromium.launch({...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),args:['--no-sandbox']});
  const page=await b.newPage();
  await page.route('https://bacbacta.github.io/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
  await page.route('**fonts.g**',r=>r.abort());
  await page.route(u=>/publicnode|base\.org|cloudflare-eth|optimism\.io|mevblocker|drpc/.test(u.href),
    r=>r.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},body:'{"error":{"message":"hors ligne"}}'}));
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/',{waitUntil:'load'});
  await page.waitForTimeout(900);
  const res=await page.evaluate(()=>{
    const addr=Object.keys(SNAP.a)[0];
    // rendu normal à partir de l'instantané
    out.innerHTML='';
    current={addr, groups:snapGroups(addr)};
    render(totalUsd(current.groups), true);
    const avant=out.querySelector('.total .big').textContent;
    // on ajoute une position réelle sans prix connu, comme le fait liveAll
    const [cid,arr]=[...current.groups.entries()][0];
    arr.push({proto:'v2', chainId:cid, token:'a27ec0006e59f245217ff08cd52a7e8b169e62d2',
              symbol:'AZTEC', amount:1234.5, usd:undefined});
    retotal();
    return {avant, apres:out.querySelector('.total .big').textContent,
            sous:[...out.querySelectorAll('.chain-head .amt')].map(n=>n.textContent)};
  });
  await b.close(); return res;
}
(async()=>{
  // on fabrique la variante boguée à partir du code corrigé, pour que le test
  // prouve les deux directions même une fois le correctif déployé partout
  const corrige=fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8');
  const bogue=corrige.replace(
    /const worth = p => \{[\s\S]*?return Number\.isFinite\(v\) \? v : 0;\s*\};/,
    'const worth = p => p.usdLive !== undefined ? p.usdLive : (p.liveZero ? 0 : p.usd);');
  if(bogue===corrige){ console.error('impossible de reconstituer la variante boguée'); process.exit(1); }
  const avant=await essai(bogue);
  const apres=await essai(corrige);
  console.log('SANS GARDE-FOU : total', avant.avant, '→ après ajout d\'une position sans prix :', avant.apres, '· sous-totaux', JSON.stringify(avant.sous));
  console.log('CORRIGÉ  : total', apres.avant, '→ après ajout d\'une position sans prix :', apres.apres, '· sous-totaux', JSON.stringify(apres.sous), '\n');
  check('sans le garde-fou, le total devient NaN', /NaN/.test(avant.apres)||avant.sous.some(x=>/NaN/.test(x)),
    'total='+avant.apres+' sous='+JSON.stringify(avant.sous));
  check('total sans NaN après correctif', !/NaN/.test(apres.apres), apres.apres);
  check('aucun sous-total NaN après correctif', !apres.sous.some(x=>/NaN/.test(x)), JSON.stringify(apres.sous));
  check('la position sans prix compte pour 0, sans fausser le reste',
    apres.apres===apres.avant, apres.avant+' → '+apres.apres);
  console.log(fails===0?'\nTOUS LES TESTS PASSENT':`\n${fails} ÉCHEC(S)`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
