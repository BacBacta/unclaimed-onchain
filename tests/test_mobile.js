const { chromium, devices } = require('playwright');
const fs=require('fs');
const html=fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8');
const ADDR='0x7229BaceEb5ed0ba32e862FF794C59C1950c926a';
/* Bornes de la page sous test : le lanceur peut les raccourcir (DELAIS) pour
   ne pas payer trois minutes d'attente réelle par scénario. */
const D = Object.assign({rpc:20000, prompt:180000, slow:4000, guet:10000},
  JSON.parse(process.env.DELAIS || '{}'));
let fails=0; const check=(l,c,d)=>{if(!c)fails++;console.log(c?'  ok   ':' FAIL  ',l,c?'':'\n         '+(d||''));};

async function open(appareil, injecter){
  const b=await chromium.launch({...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),args:['--no-sandbox']});
  const ctx=await b.newContext(appareil ? devices[appareil] : {});
  const page=await ctx.newPage();
  if(injecter) await page.addInitScript(()=>{
    window.ethereum={isMetaMask:true,on:()=>{},removeListener:()=>{},
      request: async ({method})=>{
        if(method==='eth_accounts'||method==='eth_requestAccounts') return ['0x000000000000000000000000000000000000bEEF'];
        if(method==='eth_chainId') return '0x2105';
        if(method==='eth_call') return '0x'+'0'.repeat(46)+'4218f0e5a0e5a0';
        if(method==='eth_getCode') return '0x';
        return null; }};
  });
  await page.route('https://bacbacta.github.io/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
  await page.route('**fonts.g**',r=>r.abort());
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/',{waitUntil:'load'});
  await page.waitForTimeout(1200);
  return {b,page};
}

(async()=>{
  console.log('A — iPhone, navigateur mobile ordinaire (votre cas)');
  { const {b,page}=await open('iPhone 13', false);
    await page.waitForTimeout(D.guet + 1000);
    const txt=await page.locator('#walletbanner').innerText();
    check('message adapté au mobile, pas « extension »',
      /Open this page inside your wallet/.test(txt) && !/browser with a wallet extension/.test(txt), txt.slice(0,200));
    check('explique l\'absence d\'extensions sur mobile', /no wallet extensions/.test(txt), txt.slice(0,300));
    const liens=await page.locator('#walletbanner a').evaluateAll(a=>a.map(x=>[x.textContent,x.href]));
    check('4 liens profonds proposés', liens.length===4, JSON.stringify(liens.map(l=>l[0])));
    const url=encodeURIComponent('https://bacbacta.github.io/unclaimed-onchain/');
    check('lien MetaMask correct',
      liens[0][1]==='https://metamask.app.link/dapp/bacbacta.github.io/unclaimed-onchain/', liens[0][1]);
    check('lien Coinbase Wallet correct',
      liens[1][1]==='https://go.cb-w.com/dapp?cb_url='+url, liens[1][1]);
    check('lien Trust correct', liens[2][1].includes('link.trustwallet.com')&&liens[2][1].includes(url), liens[2][1]);
    check('lien Phantom correct', liens[3][1].startsWith('https://phantom.app/ul/browse/'+url), liens[3][1]);
    check('repli explorateur mentionné', /block explorer/.test(txt), txt.slice(-200));
    await page.screenshot({path:'mobile-banner.png', fullPage:false});
    await b.close(); }

  console.log('\nB — iPhone, navigateur intégré d\'un wallet (fournisseur injecté)');
  { const {b,page}=await open('iPhone 13', true);
    const txt=await page.locator('#walletbanner').innerText().catch(()=> '');
    check('aucun bandeau', txt.trim()==='', txt);
    await page.fill('#addr',ADDR); await page.click('#go'); await page.waitForTimeout(1200);
    const btns=await page.locator('#out button').allInnerTexts();
    check('boutons d\'action présents', btns.some(t=>/Verify live/.test(t)), JSON.stringify(btns));
    await b.close(); }

  console.log('\nC — ordinateur sans wallet : message inchangé');
  { const {b,page}=await open(null, false);
    await page.waitForTimeout(D.guet + 1000);
    const txt=await page.locator('#walletbanner').innerText();
    check('message bureau conservé', /No wallet detected/.test(txt) && /wallet extension/.test(txt), txt.slice(0,200));
    check('aucun lien profond sur bureau',
      (await page.locator('#walletbanner a').count())===0);
    await b.close(); }

  console.log(fails===0?'\nTOUS LES TESTS PASSENT':`\n${fails} ÉCHEC(S)`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
