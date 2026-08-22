const { chromium } = require('playwright');
const fs=require('fs');
const html=fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', '..', 'index.html'),'utf8');
const snippet=fs.readFileSync(require('path').join(__dirname, 'diag2.js'),'utf8');
(async()=>{
 for (const [nom, setup] of [
   ['wallet muet', ()=>{ window.ethereum={isMetaMask:true,on:()=>{},removeListener:()=>{},request:()=>new Promise(()=>{})}; }],
   ['trois wallets', ()=>{ window.ethereum={isMetaMask:true,on:()=>{},removeListener:()=>{},
        request:({method})=>method==='eth_chainId'?Promise.resolve('0x1'):new Promise(()=>{}),
        providers:[{isMetaMask:true},{isPhantom:true},{isCoinbaseWallet:true}]}; }],
   ['aucun wallet', ()=>{ try{delete window.ethereum;}catch(e){} }],
 ]) {
  const b=await chromium.launch({...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),args:['--no-sandbox']});
  const page=await b.newPage();
  await page.addInitScript(setup);
  await page.route('https://bacbacta.github.io/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
  await page.route('**fonts.g**',r=>r.abort());
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/',{waitUntil:'load'});
  await page.waitForTimeout(500);
  await page.evaluate(snippet);
  await page.waitForTimeout(19000);
  const txt=await page.locator('pre').first().innerText();
  console.log('=== '+nom+' ===');
  console.log(txt.replace(/"navigateur":[^\n]*/,'"navigateur": "…"'));
  await b.close();
 }
})();
