const { chromium } = require('playwright');

const URL = process.env.TEST_URL || 'https://bacbacta.github.io/unclaimed-onchain/';
const TEST_ADDR = '0x72b1202c820e4b2f8ac9573188b638866c7d9274';
const FAKE_WALLET = '0x000000000000000000000000000000000000beef';

async function scenario(name, { withWallet }) {
  const browser = await chromium.launch({
    ...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  if (withWallet) {
    await page.addInitScript(([acct]) => {
      const listeners = {};
      window.ethereum = {
        isMetaMask: true,
        request: async ({ method, params }) => {
          switch (method) {
            case 'eth_accounts':
            case 'eth_requestAccounts': return [acct];
            case 'eth_chainId': return '0x2105'; // Base
            case 'wallet_switchEthereumChain': return null;
            case 'eth_call': return '0x' + '00'.repeat(32);
            default: throw new Error('stub: unsupported ' + method);
          }
        },
        on: (ev, fn) => { listeners[ev] = fn; },
        removeListener: () => {},
      };
    }, [FAKE_WALLET]);
  }

  await page.route('**fonts.g**', r => r.abort());
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const banner = (await page.locator('#walletbanner').innerText().catch(() => '')).trim();

  await page.fill('#addr', TEST_ADDR);
  await page.click('#go');
  await page.waitForTimeout(2500);
  const out = (await page.locator('#out').innerText().catch(() => '')).trim();

  const buttons = await page.locator('#out button').allInnerTexts();

  let verifyOutcome = null;
  if (withWallet) {
    const vb = page.locator('#out button', { hasText: 'Verify live' }).first();
    if (await vb.count()) {
      await vb.click();
      await page.waitForTimeout(3000);
      verifyOutcome = (await page.locator('#out').innerText().catch(() => '')).trim();
    }
  }

  await browser.close();
  return { name, banner, out, buttons, verifyOutcome, errors };
}

(async () => {
  const r1 = await scenario('sans-wallet', { withWallet: false });
  const r2 = await scenario('avec-wallet-simule', { withWallet: true });
  for (const r of [r1, r2]) {
    console.log('==== SCENARIO', r.name, '====');
    console.log('-- banner:', JSON.stringify(r.banner.slice(0, 200)));
    console.log('-- boutons:', JSON.stringify(r.buttons));
    console.log('-- resultats (extrait):', JSON.stringify(r.out.slice(0, 1200)));
    if (r.verifyOutcome !== null) console.log('-- apres Verify live (extrait):', JSON.stringify(r.verifyOutcome.slice(0, 1200)));
    console.log('-- erreurs console:', JSON.stringify(r.errors));
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
