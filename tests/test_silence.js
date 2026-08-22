const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    ...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}), args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.__rpc = [];
    window.ethereum = { isMetaMask:true, on:()=>{}, removeListener:()=>{},
      request: async ({method}) => { window.__rpc.push(method);
        if(method==='eth_accounts') return [];
        if(method==='eth_chainId') return '0x2105';
        throw new Error('stub'); } };
  });
  const AUTORISES = ['mainnet.base.org','base-rpc.publicnode.com','ethereum-rpc.publicnode.com',
    'cloudflare-eth.com','mainnet.optimism.io','optimism-rpc.publicnode.com'];
  const interdites = [];
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.protocol === 'data:' || r.url().startsWith(process.env.TEST_URL.split('/').slice(0,3).join('/'))) return;
    if (u.host.startsWith('fonts.g')) return;                       // polices, déjà documentées
    if (!AUTORISES.includes(u.host)) interdites.push(r.url());
  });
  // coupées après observation : dans ce bac à sable elles mettent 12 s à échouer
  await page.route('**fonts.g**', r => r.abort());
  await page.goto(process.env.TEST_URL, { waitUntil:'load' });
  await page.waitForTimeout(800);
  await page.fill('#addr', '0xBfdB5D8d1856b8617f1881FD718580256fA8cF35');
  await page.click('#go');
  await page.waitForTimeout(4000);
  const rpc = await page.evaluate(() => window.__rpc);
  const rpcNonSollicite = rpc.filter(m => !['eth_accounts','eth_chainId'].includes(m));
  console.log('requêtes hors RPC déclarés :', interdites.length, interdites.slice(0,4));
  console.log('méthodes wallet appelées   :', JSON.stringify(rpc));
  const ok = interdites.length===0 && rpcNonSollicite.length===0;
  console.log(ok ? 'CONTRAT RÉSEAU RESPECTÉ : seuls les RPC déclarés, rien via le wallet sans action'
                 : 'RÉGRESSION RÉSEAU');
  await browser.close();
  process.exit(ok?0:1);
})();
