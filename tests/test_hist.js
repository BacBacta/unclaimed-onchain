const { chromium, devices } = require('playwright');
const fs=require('fs');
const html=fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8');
const BENEF='0x7229BaceEb5ed0ba32e862FF794C59C1950c926a';
const MULTI='0xC6cA7c3427AD6B7a06fbED6D18C394E540E31814';     // v1+v2 sur Ethereum → 14 transactions
const SIGNER='0x000000000000000000000000000000000000bEEF';
let fails=0; const check=(l,c,d)=>{if(!c)fails++;console.log(c?'  ok   ':' FAIL  ',l,c?'':'\n         '+(d||''));};

async function open(opts={}){
  const b=await chromium.launch({...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),args:['--no-sandbox']});
  const ctx=await b.newContext(opts.mobile?devices['iPhone 13']:{});
  const page=await ctx.newPage();
  const envoyees=[];
  await page.exposeFunction('__tx', h=>envoyees.push(h));
  await page.addInitScript(([signer,statut])=>{
    let n=0;
    window.ethereum={isMetaMask:true,on:()=>{},removeListener:()=>{},
      request: async ({method,params})=>{
        if(method==='eth_accounts'||method==='eth_requestAccounts') return [signer];
        if(method==='eth_chainId') return '0x2105';
        if(method==='wallet_switchEthereumChain') return null;
        if(method==='eth_call') return '0x'+'0'.repeat(46)+'4218f0e5a0e5a0';
        if(method==='eth_getCode') return '0x';
        if(method==='eth_sendTransaction'){ const h='0x'+String(++n).padStart(2,'0').repeat(32); window.__tx(h); return h; }
        if(method==='eth_getTransactionReceipt'){
          if(statut==='aucun') return null;
          return {status: statut==='ko' ? '0x0' : '0x1'};
        }
        return null; }};
  },[SIGNER, opts.statut||'ok']);
  await page.route('https://bacbacta.github.io/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
  await page.route('**fonts.g**',r=>r.abort());
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/',{waitUntil:'load'});
  await page.waitForTimeout(900);
  return {b,page,envoyees};
}
const btn = p => p.locator('#historylink');
const panneau = p => p.locator('#historypanel');
async function retirer(page, addr){
  await page.fill('#addr',addr); await page.click('#go'); await page.waitForTimeout(800);
  await page.locator('#out button',{hasText:/Deliver to|Claim on/}).first().click();
  await page.waitForTimeout(2500);
}

(async()=>{
  console.log('A — historique vide au départ');
  { const {b,page}=await open();
    check('bouton visible avec compteur à 0', /\(0\)/.test(await btn(page).innerText()), await btn(page).innerText());
    check('panneau fermé par défaut', await panneau(page).isHidden());
    await btn(page).click(); await page.waitForTimeout(400);
    check('état vide explicite au clic',
      /No withdrawal sent from this browser yet/.test(await panneau(page).innerText()),
      (await panneau(page).innerText()).slice(0,200));
    await b.close(); }

  console.log('\nB — un retrait est enregistré');
  { const {b,page,envoyees}=await open();
    await retirer(page, BENEF);
    check('transaction envoyée', envoyees.length===1, 'envoyées='+envoyees.length);
    check('bouton visible', await btn(page).isVisible());
    check('compteur à 1', /\(1\)/.test(await btn(page).innerText()), await btn(page).innerText());
    await btn(page).click(); await page.waitForTimeout(500);
    const txt=await panneau(page).innerText();
    check('panneau ouvert', await panneau(page).isVisible());
    check('montant affiché', /0\.018594 ETH/.test(txt), txt.slice(0,300));
    check('mode livraison indiqué', /delivered to 0x7229…926a/.test(txt), txt.slice(0,300));
    check('chaîne indiquée', /Base/.test(txt));
    check('statut initial « sent »', /sent/i.test(txt), txt.slice(0,300));
    const lien=await page.locator('#historypanel a').first().getAttribute('href');
    check('lien vers l\'explorateur correct',
      lien==='https://basescan.org/tx/'+envoyees[0], lien);
    check('lien ouvert dans un nouvel onglet',
      (await page.locator('#historypanel a').first().getAttribute('target'))==='_blank');
    await b.close(); }

  console.log('\nC — persistance après rechargement');
  { const {b,page}=await open();
    await retirer(page, BENEF);
    await page.reload({waitUntil:'load'}); await page.waitForTimeout(1200);
    check('bouton toujours visible après rechargement', await btn(page).isVisible());
    check('compteur conservé', /\(1\)/.test(await btn(page).innerText()), await btn(page).innerText());
    await btn(page).click(); await page.waitForTimeout(400);
    check('ligne toujours présente', /0\.018594 ETH/.test(await panneau(page).innerText()));
    await b.close(); }

  console.log('\nD — plusieurs retraits, ordre antichronologique');
  { const {b,page,envoyees}=await open();
    await retirer(page, MULTI);       // plusieurs protocoles sur une chaîne
    check('plusieurs transactions', envoyees.length>=3, 'envoyées='+envoyees.length);
    await btn(page).click(); await page.waitForTimeout(400);
    check('compteur = nombre de transactions',
      new RegExp('\\('+envoyees.length+'\\)').test(await btn(page).innerText()), await btn(page).innerText());
    const liens=await page.locator('#historypanel a').evaluateAll(a=>a.map(x=>x.href));
    check('un lien par transaction', liens.length===envoyees.length, liens.length+' vs '+envoyees.length);
    check('la plus récente en tête', liens[0].endsWith(envoyees[envoyees.length-1]), liens[0]);
    await b.close(); }

  console.log('\nE — relecture des statuts onchain');
  { const {b,page}=await open({statut:'ok'});
    await retirer(page, BENEF);
    await btn(page).click(); await page.waitForTimeout(400);
    await page.locator('#historypanel button',{hasText:'Check statuses'}).click();
    await page.waitForTimeout(2500);
    check('statut passé à « confirmed »', /confirmed/i.test(await panneau(page).innerText()),
      (await panneau(page).innerText()).slice(0,300));
    await b.close(); }
  { const {b,page}=await open({statut:'ko'});
    await retirer(page, BENEF);
    await btn(page).click(); await page.waitForTimeout(400);
    await page.locator('#historypanel button',{hasText:'Check statuses'}).click();
    await page.waitForTimeout(2500);
    check('transaction échouée signalée « reverted »', /reverted/i.test(await panneau(page).innerText()),
      (await panneau(page).innerText()).slice(0,300));
    await b.close(); }
  { const {b,page}=await open({statut:'aucun'});
    await retirer(page, BENEF);
    await btn(page).click(); await page.waitForTimeout(400);
    await page.locator('#historypanel button',{hasText:'Check statuses'}).click();
    await page.waitForTimeout(2500);
    check('reçu absent → reste « sent »', /sent/i.test(await panneau(page).innerText()),
      (await panneau(page).innerText()).slice(0,300));
    await b.close(); }

  console.log('\nF — effacement');
  { const {b,page}=await open();
    await retirer(page, BENEF);
    await btn(page).click(); await page.waitForTimeout(400);
    await page.locator('#historypanel button',{hasText:'Clear history'}).click();
    await page.waitForTimeout(600);
    check('compteur revenu à 0', /\(0\)/.test(await btn(page).innerText()), await btn(page).innerText());
    check('état vide affiché', /No withdrawal sent/.test(await panneau(page).innerText()),
      (await panneau(page).innerText()).slice(0,200));
    await page.reload({waitUntil:'load'}); await page.waitForTimeout(1000);
    check('effacement persistant', /\(0\)/.test(await btn(page).innerText()), await btn(page).innerText());
    await b.close(); }

  console.log('\nG — mobile : le bouton reste accessible');
  { const {b,page}=await open({mobile:true});
    await retirer(page, BENEF);
    check('bouton visible sur mobile', await btn(page).isVisible());
    await btn(page).click(); await page.waitForTimeout(500);
    check('panneau lisible sur mobile', /0\.018594 ETH/.test(await panneau(page).innerText()));
    await page.locator('#historypanel').screenshot({path:'historique.png'});
    await b.close(); }

  console.log(fails===0?'\nTOUS LES TESTS PASSENT':`\n${fails} ÉCHEC(S)`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
