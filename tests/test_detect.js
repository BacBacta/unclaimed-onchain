const { chromium } = require('playwright');
const fs=require('fs');
const ADDR='0x7229BaceEb5ed0ba32e862FF794C59C1950c926a';
/* Bornes de la page sous test : le lanceur peut les raccourcir (DELAIS) pour
   ne pas payer trois minutes d'attente réelle par scénario. */
const D = Object.assign({rpc:20000, prompt:180000, slow:4000, guet:10000},
  JSON.parse(process.env.DELAIS || '{}'));
let fails=0; const check=(l,c,d)=>{if(!c)fails++;console.log(c?'  ok   ':' FAIL  ',l,c?'':'\n         '+(d||''));};

async function open(page_html){
  const b=await chromium.launch({...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),args:['--no-sandbox']});
  const page=await b.newPage();
  // fabrique de fournisseur disponible dans la page, mais RIEN n'est injecté au départ
  await page.addInitScript(()=>{
    window.__stub = () => ({ isMetaMask:true, on:()=>{}, removeListener:()=>{},
      request: async ({method}) => {
        if(method==='eth_accounts'||method==='eth_requestAccounts') return ['0x000000000000000000000000000000000000bEEF'];
        if(method==='eth_chainId') return '0x2105';
        if(method==='eth_call') return '0x'+'0'.repeat(46)+'4218f0e5a0e5a0';
        if(method==='eth_getCode') return '0x';
        return null; }});
  });
  await page.route('https://bacbacta.github.io/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:page_html}));
  await page.route('**fonts.g**',r=>r.abort());
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/',{waitUntil:'load'});
  await page.waitForTimeout(900);          // le script du site a fini de s'exécuter
  return {b,page};
}
const banner = p => p.locator('#walletbanner').innerText().catch(()=> '');
const boutons = p => p.locator('#out button').allInnerTexts().catch(()=>[]);
const chercher = async p => { await p.fill('#addr',ADDR); await p.click('#go'); await p.waitForTimeout(900); };
const injecter = p => p.evaluate(()=>{ window.ethereum = window.__stub(); });
const annoncer6963 = p => p.evaluate(()=>{
  const detail={info:{name:'MetaMask',uuid:'x',rdns:'io.metamask',icon:''}, provider:window.__stub()};
  const envoi=()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail}));
  window.addEventListener('eip6963:requestProvider', envoi); envoi();
});

(async()=>{
  const AVANT=fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8'), APRES=fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8');

  console.log('=== AVANT correctif : wallet injecté après le script du site ===');
  { const {b,page}=await open(AVANT);
    await chercher(page);
    const b0=/No wallet detected/.test(await banner(page));
    await injecter(page); await page.waitForTimeout(5000);
    console.log('   bandeau avant injection :', b0?'affiché':'absent');
    console.log('   bandeau 5 s APRÈS injection :', /No wallet detected/.test(await banner(page))?'TOUJOURS AFFICHÉ (bug)':'retiré');
    console.log('   boutons 5 s après injection :', JSON.stringify(await boutons(page)));
    await b.close(); }

  console.log('\n=== APRÈS correctif ===');
  console.log('A — wallet présent dès le départ');
  { const {b,page}=await open(APRES);
    await injecter(page);   // avant toute recherche, mais après le script : la boucle doit le voir
    await page.waitForTimeout(1200); await chercher(page);
    check('aucun bandeau', (await banner(page)).trim()==='', await banner(page));
    check('boutons présents', (await boutons(page)).some(t=>/Verify live/.test(t)), JSON.stringify(await boutons(page)));
    await b.close(); }

  console.log('B — recherche faite AVANT que le wallet n\'apparaisse (votre cas)');
  { const {b,page}=await open(APRES);
    await chercher(page);
    check('avant injection : bandeau affiché', /No wallet detected/.test(await banner(page)), await banner(page));
    check('avant injection : aucun bouton d\'action',
      !(await boutons(page)).some(t=>/Verify live/.test(t)), JSON.stringify(await boutons(page)));
    await injecter(page); await page.waitForTimeout(2500);
    check('après injection : bandeau retiré', (await banner(page)).trim()==='', await banner(page));
    check('après injection : boutons apparus sans recharger la page',
      (await boutons(page)).some(t=>/Verify live/.test(t)), JSON.stringify(await boutons(page)));
    check('mode livraison recalculé', (await boutons(page)).some(t=>/Deliver to/.test(t)), JSON.stringify(await boutons(page)));
    await b.close(); }

  console.log('C — wallet annoncé uniquement par EIP-6963');
  { const {b,page}=await open(APRES);
    await chercher(page);
    await annoncer6963(page); await page.waitForTimeout(2000);
    check('détecté via EIP-6963 sans window.ethereum', (await banner(page)).trim()==='', await banner(page));
    check('boutons présents', (await boutons(page)).some(t=>/Verify live/.test(t)), JSON.stringify(await boutons(page)));
    await page.locator('#out button',{hasText:'Verify live'}).first().click();
    await page.waitForTimeout(2500);
    check('le fournisseur 6963 sert réellement aux lectures',
      /real balance confirmed|already claimed/.test(await page.locator('#out').innerText()),
      (await page.locator('#out').innerText()).slice(-200));
    await b.close(); }

  console.log('D — réellement aucun wallet');
  { const {b,page}=await open(APRES);
    await page.waitForTimeout(D.guet + 2000);   // au-delà de la fenêtre de guet
    await chercher(page);
    check('bandeau conservé', /No wallet detected/.test(await banner(page)), await banner(page));
    check('repli explorateur proposé',
      /use the contract links/.test(await page.locator('#out').innerText()),
      (await page.locator('#out').innerText()).slice(-200));
    await b.close(); }

  console.log(fails===0?'\nTOUS LES TESTS PASSENT':`\n${fails} ÉCHEC(S)`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
