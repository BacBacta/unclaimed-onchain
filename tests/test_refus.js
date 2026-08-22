const { chromium } = require('playwright');
const fs=require('fs');
const html=fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8');
const BENEF='0x7229BaceEb5ed0ba32e862FF794C59C1950c926a';
const SIGNER='0x63c11dbe6a2c33b14993e6000b9d5ae17277f34f';
(async()=>{
  const b=await chromium.launch({...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),args:['--no-sandbox']});
  const page=await b.newPage();
  // refus lancé DANS la page : le code 4001 survit, comme avec un vrai MetaMask
  await page.addInitScript(([signer])=>{
    let chain='0x2105';
    window.ethereum={isMetaMask:true,on:()=>{},removeListener:()=>{},
      request: async ({method,params})=>{
        if(method==='eth_accounts'||method==='eth_requestAccounts') return [signer];
        if(method==='eth_chainId') return chain;
        if(method==='wallet_switchEthereumChain'){chain=params[0].chainId;return null;}
        if(method==='eth_getCode') return '0x';
        if(method==='eth_call') return '0x'+'0'.repeat(46)+'4218f0e5a0e5a0';
        if(method==='eth_sendTransaction'){ const e=new Error('User rejected the request.'); e.code=4001; throw e; }
        return null; }};
  },[SIGNER]);
  await page.route('https://bacbacta.github.io/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
  await page.route('**fonts.g**',r=>r.abort());
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/',{waitUntil:'load'});
  await page.waitForTimeout(700);
  await page.fill('#addr',BENEF); await page.click('#go'); await page.waitForTimeout(800);
  await page.locator('#out button',{hasText:'Deliver to'}).first().click();
  await page.waitForTimeout(4000);
  const txt=await page.locator('#out').innerText();
  const ok=/Transaction rejected in the wallet\. Nothing was sent\./.test(txt);
  console.log(ok?'  ok    refus MetaMask (code 4001) → « Transaction rejected in the wallet. Nothing was sent. »'
                :' FAIL  '+txt.slice(-260));
  await b.close(); process.exit(ok?0:1);
})();
