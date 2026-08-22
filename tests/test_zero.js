const { chromium } = require('playwright');
const fs=require('fs');
const html=fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'),'utf8');
const VIDE='0x7229BaceEb5ed0ba32e862FF794C59C1950c926a';
const BASE=['https://mainnet.base.org','https://base-rpc.publicnode.com'];
let fails=0; const check=(l,c,d)=>{if(!c)fails++;console.log(c?'  ok   ':' FAIL  ',l,c?'':'\n         '+(d||''));};
async function rpc(m,p){let e;for(const u of BASE){try{
 const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'curl/8.5.0'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:m,params:p})});
 const j=await r.json(); if(j.result!==undefined)return j.result; if(j.error)e=j.error;}catch(x){e=x}}
 throw new Error(m);}
(async()=>{
  const b=await chromium.launch({...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),args:['--no-sandbox']});
  const page=await b.newPage();
  const envoyees=[];
  await page.exposeFunction('__bridge', async (m,p)=>{
    if(m==='eth_sendTransaction'){ envoyees.push(p[0]); return '0x'+'ab'.repeat(32); }
    return rpc(m,p); });
  await page.addInitScript(()=>{
    window.ethereum={isMetaMask:true,on:()=>{},removeListener:()=>{},
      request: async ({method,params})=>{
        if(method==='eth_accounts'||method==='eth_requestAccounts') return ['0x000000000000000000000000000000000000bEEF'];
        if(method==='eth_chainId') return '0x2105';
        if(method==='wallet_switchEthereumChain') return null;
        return await window.__bridge(method, params||[]); }};
  });
  await page.route('https://bacbacta.github.io/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
  await page.route('**fonts.g**',r=>r.abort());
  await page.goto('https://bacbacta.github.io/unclaimed-onchain/',{waitUntil:'load'});
  await page.waitForTimeout(900);
  await page.fill('#addr',VIDE); await page.click('#go'); await page.waitForTimeout(900);
  const deliver=page.locator('#out button',{hasText:'Deliver to'}).first();
  check('avant relecture : bouton actif (l\'instantané fait foi)', !(await deliver.isDisabled()));
  await page.locator('#out button',{hasText:'Verify live'}).first().click();
  const t0=Date.now(); let txt='';
  while(Date.now()-t0<45000){ txt=await page.locator('#out').innerText().catch(()=> '');
    if(/is a regular wallet|Balances re-read/.test(txt)) break; await page.waitForTimeout(1500); }
  await page.waitForTimeout(800);
  check('relecture : solde à zéro constaté', /already claimed/.test(txt), txt.slice(-300));
  check('bouton Deliver désactivé après relecture', await deliver.isDisabled());
  // même si on force l'appel, aucune transaction ne part
  await page.evaluate(()=>claim(8453, current.groups.get(8453)));
  await page.waitForTimeout(1500);
  const fin=await page.locator('#out').innerText();
  check('appel forcé → message, zéro transaction envoyée',
    envoyees.length===0 && /Nothing is waiting for this address any more/.test(fin),
    'envoyées='+envoyees.length+' | '+fin.slice(-200));
  await b.close();
  console.log(fails===0?'\nTOUS LES TESTS PASSENT':`\n${fails} ÉCHEC(S)`);
  process.exit(fails===0?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
