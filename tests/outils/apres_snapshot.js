const { chromium } = require('playwright');
const fs=require('fs');
const html=fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', '..', 'index.html'),'utf8');   // version en ligne
// adresse valide, absente de l'instantané (vérifiée précédemment)
const NEUVE='0xd3d5ba1BF2A6De742beF4Ac47961FC07Bd86ff47';
(async()=>{
  const b=await chromium.launch({...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),args:['--no-sandbox']});
  const page=await b.newPage();
  const appels=[];
  await page.exposeFunction('__log', m => appels.push(m));
  await page.addInitScript(()=>{
    window.ethereum={isMetaMask:true,on:()=>{},removeListener:()=>{},
      request:({method})=>{ window.__log(method);
        if(method==='eth_accounts'||method==='eth_requestAccounts') return Promise.resolve(['0x000000000000000000000000000000000000bEEF']);
        if(method==='eth_chainId') return Promise.resolve('0x2105');
        if(method==='eth_call') return Promise.resolve('0x'+'0'.repeat(63)+'9');  // solde non nul
        if(method==='eth_getCode') return Promise.resolve('0x');
        return Promise.resolve(null); }};
  });
  await page.route('https://bacbacta.github.io/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
  await page.route('**fonts.g**',r=>r.abort());
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/',{waitUntil:'load'});
  await page.waitForTimeout(700);
  await page.fill('#addr', NEUVE); await page.click('#go'); await page.waitForTimeout(800);
  console.log('--- après recherche d\'une adresse absente de l\'instantané ---');
  console.log((await page.locator('#out').innerText()).trim());
  const boutons = await page.locator('#out button').allInnerTexts();
  console.log('\nboutons proposés :', JSON.stringify(boutons));
  if (boutons.length) {
    appels.length = 0;
    await page.locator('#out button').first().click();
    await page.waitForTimeout(3000);
    console.log('\n--- après clic sur ce bouton ---');
    console.log((await page.locator('#out').innerText()).trim().split('\n').slice(-3).join('\n'));
    console.log('\nappels RPC réellement émis :', JSON.stringify(appels));
  }
  await b.close();
})();
