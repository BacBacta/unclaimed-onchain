const { chromium } = require('playwright');
let jsQR = null;
try { jsQR = require('jsqr'); } catch (e) {}   // vérification optionnelle du QR
const fs=require('fs');
const html=fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8');
const BENEF='0x6BAb38eD8e3c942DCC287bE471D651055B615c7E';
const HOSTS=['https://mainnet.base.org','https://base-rpc.publicnode.com','https://ethereum-rpc.publicnode.com',
 'https://eth.drpc.org','https://mainnet.optimism.io','https://optimism-rpc.publicnode.com'];
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
let fails=0; const check=(l,c,d)=>{if(!c)fails++;console.log(c?'  ok   ':' FAIL  ',l,c?'':'\n         '+(d||''));};

async function open(){
  const b=await chromium.launch({...(process.env.CHROME?{executablePath:process.env.CHROME}:{}),args:['--no-sandbox']});
  const page=await b.newPage();
  const envoyees=[], methodes=[];
  await page.exposeFunction('__tx', t=>envoyees.push(t));
  await page.exposeFunction('__m', m=>methodes.push(m));
  await page.addInitScript(()=>{
    window.__erreurs=[];
    addEventListener('error', e=>window.__erreurs.push(String(e.message)));
    window.ethereum={isMetaMask:true,on:()=>{},removeListener:()=>{},
      request: async ({method,params})=>{ window.__m(method);
        if(method==='eth_accounts'||method==='eth_requestAccounts') return ['0x000000000000000000000000000000000000bEEF'];
        if(method==='eth_chainId') return '0x2105';
        if(method==='wallet_switchEthereumChain') return null;
        if(method==='eth_getCode') return '0x';
        if(method==='eth_call') return '0x'+'0'.repeat(63)+'5';
        if(method==='eth_sendTransaction'){ window.__tx(JSON.stringify(params[0])); return '0x'+'ab'.repeat(32); }
        return null; }};
  });
  await page.route(u=>HOSTS.some(h=>u.href.startsWith(h)), async r=>{ const q=r.request();
    if(q.method()==='OPTIONS') return r.fulfill({status:204,headers:CORS});
    try{ const x=await fetch(q.url(),{method:'POST',headers:{'Content-Type':'application/json'},body:q.postData()});
      r.fulfill({status:200,headers:{...CORS,'Content-Type':'application/json'},body:await x.text()});
    }catch(e){ r.fulfill({status:502,headers:CORS,body:'{}'}); }});
  await page.route('**bacbacta.github.io**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
  await page.route('**fonts.g**',r=>r.abort());
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/',{waitUntil:'load'});
  await page.waitForTimeout(700);
  return {b,page,envoyees,methodes};
}

(async()=>{
  console.log('A — bloc de soutien permanent : QR sans wallet');
  { const {b,page,envoyees,methodes}=await open();
    const zone=page.locator('#coffeezone');
    check('la zone est rendue au chargement', await zone.locator('.donqr svg').count()===1);
    check('aucune requête wallet au chargement', methodes.filter(m=>m!=='eth_accounts'&&m!=='eth_chainId').length===0,
      JSON.stringify(methodes));
    const lien=await page.locator('#coffeezone a').first().getAttribute('href');
    check('lien EIP-681 natif bien formé',
      /^ethereum:0x[0-9a-f]{40}@8453\?value=\d+$/.test(lien), lien);
    check('aucune erreur JavaScript', (await page.evaluate(()=>window.__erreurs)).length===0,
      JSON.stringify(await page.evaluate(()=>window.__erreurs)));
    // changer de montant met le QR et le lien à jour
    const avant=await page.locator('#coffeezone a').first().getAttribute('href');
    await page.locator('#coffeezone .donrow.montants button').last().click();
    await page.waitForTimeout(200);
    const apres=await page.locator('#coffeezone a').first().getAttribute('href');
    check('changer de montant met le lien à jour', avant!==apres, `${avant} → ${apres}`);
    check('le QR est régénéré avec le nouveau montant',
      await page.locator('#coffeezone .donqr svg').count()===1);
    const chaines=await page.locator('#coffeezone .donrow.jetons button').allInnerTexts();
    check('les deux chaînes sont proposées', chaines.length===2 && /Base/.test(chaines[0]),
      JSON.stringify(chaines));
    await page.locator('#coffeezone .donrow.jetons button').last().click();
    await page.waitForTimeout(200);
    check('changer de chaîne change le lien',
      /@1\?value=/.test(await page.locator('#coffeezone a').first().getAttribute('href')),
      await page.locator('#coffeezone a').first().getAttribute('href'));
    check('aucune transaction envoyée par le site', envoyees.length===0, JSON.stringify(envoyees));

    /* Un QR qui ne se décode pas ne vaut rien : on photographie celui que la
       page affiche vraiment et on le relit avec un décodeur indépendant. */
    if (jsQR) {
      const attendu = await page.locator('#coffeezone a').first().getAttribute('href');
      const png = await page.locator('#coffeezone .donqr').screenshot();
      const { PNG } = (() => { try { return require('pngjs'); } catch (e) { return {}; } })();
      if (PNG) {
        const img = PNG.sync.read(png);
        const lu = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
        check('le QR affiché se décode et porte exactement l\'URI du lien',
          lu && lu.data === attendu, `attendu ${attendu}\n         décodé  ${lu && lu.data}`);
      } else console.log('  (pngjs absent : décodage du QR affiché non vérifié)');
    } else console.log('  (jsqr absent : décodage du QR affiché non vérifié)');
    await b.close(); }

  console.log('\nB — jetons retirés : la logique, sans dépendre d\'un solde vivant');
  /* Arrimer ce test à un solde onchain le condamne : celui de test_prix a été
     réclamé entre deux exécutions. On pilote donProposer() directement, ce qui
     éprouve exactement ce qui nous intéresse et ne périme jamais. */
  { const {b,page,envoyees}=await open();
    // #tip reste masqué tant qu'un retrait n'a pas abouti : on le révèle
    await page.evaluate(() => { document.getElementById('tip').style.display = 'block'; });
    await page.evaluate(() => donProposer([
      { proto:'v2', chainId:8453, token:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        symbol:'USDC', amount:12.5, dec:6, brut:'12500000' },
      { proto:'v1', chainId:1, token:'0x' + 'e'.repeat(40), symbol:'ETH', amount:0.4, dec:18,
        brut:'400000000000000000' },
      { proto:'v2', chainId:1, token:'0xA27EC0006e59f245217Ff08CD52A7E8b169E62D2',
        symbol:'AZTEC', amount:5000, dec:18, brut:'5000000000000000000000' },
    ]));
    await page.waitForTimeout(250);
    const jetons=await page.locator('#donzone .donrow.jetons button').allInnerTexts();
    check('les jetons retirés sont proposés', jetons.length===2, JSON.stringify(jetons));
    check('AZTEC est exclu', !jetons.some(x=>/AZTEC/i.test(x)), JSON.stringify(jetons));
    check('la chaîne de chaque jeton est nommée',
      jetons.some(x=>/Base/.test(x)) && jetons.some(x=>/Ethereum/.test(x)), JSON.stringify(jetons));

    // USDC : 1 % de 12,5 = 0,125, soit 125000 en unités de base (6 décimales)
    let lien=await page.locator('#donzone a').first().getAttribute('href');
    check('URI ERC-20 exacte, montant en unités de base',
      lien === 'ethereum:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913@8453/transfer'
            + '?address=' + (await page.evaluate(()=>TIP_ADDRESS.toLowerCase())) + '&uint256=125000', lien);
    await page.locator('#donzone .donrow.montants button').last().click();   // 10 %
    await page.waitForTimeout(200);
    lien=await page.locator('#donzone a').first().getAttribute('href');
    check('10 % de 12,5 USDC = 1250000', /&uint256=1250000$/.test(lien), lien);

    await page.locator('#donzone .donrow.jetons button').last().click();     // ETH natif
    await page.waitForTimeout(200);
    lien=await page.locator('#donzone a').first().getAttribute('href');
    check('URI native : value en wei, pas de transfer',
      /^ethereum:0x[0-9a-f]{40}@1\?value=40000000000000000$/.test(lien), lien);
    check('aucune transaction envoyée par tout cela', envoyees.length===0, JSON.stringify(envoyees));
    check('aucune erreur JavaScript', (await page.evaluate(()=>window.__erreurs)).length===0,
      JSON.stringify(await page.evaluate(()=>window.__erreurs)));
    await b.close(); }

  console.log('\nC — le retrait reste la seule signature demandée');
  { const {b,page,envoyees}=await open();
    const src = await page.evaluate(() => document.documentElement.outerHTML);
    const n = (src.match(/ask\(\s*p\s*,\s*"eth_sendTransaction"/g) || []).length;
    check('un seul site d\'appel à eth_sendTransaction : le retrait', n === 1, 'sites=' + n);
    await page.evaluate(() => { document.getElementById('tip').style.display = 'block'; });
    await page.evaluate(() => donProposer([{ proto:'v1', chainId:8453,
      token:'0x' + 'e'.repeat(40), symbol:'ETH', amount:1, dec:18 }]));
    await page.waitForTimeout(200);
    await page.locator('#donzone .donrow.montants button').first().click();
    await page.locator('#donzone button', {hasText:'Copy the address'}).click();
    await page.waitForTimeout(300);
    check('même en cliquant partout, rien n\'est signé', envoyees.length===0, JSON.stringify(envoyees));
    await b.close(); }

  console.log(fails===0?'\nTOUS LES TESTS PASSENT':`\n${fails} ÉCHEC(S)`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
