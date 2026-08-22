const { chromium } = require('playwright');

const URL = process.env.TEST_URL;
const ZORA = '0xBfdB5D8d1856b8617f1881FD718580256fA8cF35';   // natif (ETH) sur Base
const CLANKER = '0x605Ee83d2F050cF4dA6035d8f6185CE5A3934504'; // ERC-20 sur Base
const WALLET = '0x000000000000000000000000000000000000bEEF';

let fails = 0;
function check(label, cond, detail) {
  if (!cond) fails++;
  console.log(cond ? '  ok   ' : ' FAIL  ', label, cond ? '' : '\n         ' + (detail || ''));
}

async function open({ code }) {
  const browser = await chromium.launch({
    ...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}),
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const sent = [];
  await page.exposeFunction('__recordTx', tx => sent.push(tx));
  if (code !== undefined) {
    await page.addInitScript(([acct, codeVal]) => {
      window.ethereum = {
        isMetaMask: true,
        request: async ({ method, params }) => {
          switch (method) {
            case 'eth_accounts':
            case 'eth_requestAccounts': return [acct];
            case 'eth_chainId': return '0x2105';
            case 'wallet_switchEthereumChain': return null;
            case 'eth_call': return '0x' + '00'.repeat(32);
            case 'eth_getCode': return codeVal;
            case 'eth_sendTransaction':
              window.__recordTx(JSON.stringify(params[0]));
              return '0x' + 'ab'.repeat(32);
            default: throw new Error('stub: ' + method);
          }
        },
        on: () => {}, removeListener: () => {},
      };
    }, [WALLET, code]);
  }
  await page.route('**fonts.g**', r => r.abort());
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  return { browser, page, sent };
}

const search = async (page, addr) => {
  await page.fill('#addr', addr);
  await page.click('#go');
  await page.waitForTimeout(1200);
};
const outText = page => page.locator('#out').innerText().catch(() => '');

(async () => {
  /* ── A. EIP-55, sans wallet ───────────────────────────────── */
  console.log('A. Validation EIP-55');
  {
    const { browser, page } = await open({});

    await search(page, ZORA);
    let txt = await outText(page);
    check('adresse checksummée valide → résultats affichés', txt.includes('WAITING FOR YOU'), txt.slice(0, 120));
    check('champ normalisé en forme EIP-55',
      (await page.inputValue('#addr')) === ZORA, 'champ=' + await page.inputValue('#addr'));

    await search(page, ZORA.toLowerCase());
    txt = await outText(page);
    check('tout minuscule accepté (aucun checksum revendiqué)', txt.includes('WAITING FOR YOU'), txt.slice(0, 120));
    check('minuscule normalisé en EIP-55 après recherche',
      (await page.inputValue('#addr')) === ZORA, 'champ=' + await page.inputValue('#addr'));

    // recasse d'une lettre → checksum invalide
    const body = ZORA.slice(2);
    const i = [...body].findIndex(c => /[a-f]/.test(c));
    const broken = '0x' + body.slice(0, i) + body[i].toUpperCase() + body.slice(i + 1);
    await search(page, broken);
    txt = await outText(page);
    check('casse altérée → refus EIP-55', txt.includes('EIP-55 checksum'), txt.slice(0, 200));
    check('casse altérée → aucun résultat affiché', !txt.includes('WAITING FOR YOU'));
    check('forme canonique proposée', txt.includes(ZORA), txt.slice(0, 300));

    await search(page, '0x1234');
    txt = await outText(page);
    check('trop court → erreur de format (pas de checksum)',
      txt.includes("isn't in the right format") && !txt.includes('EIP-55'), txt.slice(0, 160));

    await browser.close();
  }

  /* ── B. Détection EOA / contrat ───────────────────────────── */
  console.log('\nB. Détection du type de compte (Verify live)');
  {
    const { browser, page } = await open({ code: '0x' });
    await search(page, ZORA);
    await page.locator('#out button', { hasText: 'Verify live' }).first().click();
    await page.waitForTimeout(1500);
    const txt = await outText(page);
    check('bénéficiaire EOA → message rassurant', txt.includes('is a regular wallet'), txt.slice(-300));
    check('aucun avertissement contrat', !txt.includes('is a contract'), txt.slice(-300));
    await browser.close();
  }
  {
    const { browser, page } = await open({ code: '0x60806040' });
    await search(page, ZORA);
    await page.locator('#out button', { hasText: 'Verify live' }).first().click();
    await page.waitForTimeout(1500);
    const txt = await outText(page);
    check('bénéficiaire contrat → avertissement', txt.includes('is a contract'), txt.slice(-300));
    await browser.close();
  }
  {
    const { browser, page } = await open({ code: '0x60806040' });
    await search(page, CLANKER);
    await page.locator('#out button', { hasText: 'Verify live' }).first().click();
    await page.waitForTimeout(1500);
    const txt = await outText(page);
    check('position ERC-20 seule → aucun contrôle de type de compte',
      !txt.includes('is a contract') && !txt.includes('is a regular wallet'), txt.slice(-300));
    await browser.close();
  }

  /* ── C. Garde-fou au retrait ──────────────────────────────── */
  console.log('\nC. Garde-fou ETH natif → contrat');
  {
    const { browser, page, sent } = await open({ code: '0x60806040' });
    await search(page, ZORA);
    const btn = page.locator('#out button', { hasText: 'Deliver to' }).first();
    await btn.click();
    await page.waitForTimeout(1500);
    let txt = await outText(page);
    check('1er clic → avertissement affiché', txt.includes('sends native ETH'), txt.slice(-260));
    check('1er clic → aucune transaction envoyée', sent.length === 0, 'envoyées=' + sent.length);

    await btn.click();
    await page.waitForTimeout(1500);
    txt = await outText(page);
    check('2e clic → transaction envoyée', sent.length === 1, 'envoyées=' + sent.length);
    if (sent.length) {
      const tx = JSON.parse(sent[0]);
      const beneficiary = ZORA.slice(2).toLowerCase();
      check('calldata cible bien le bénéficiaire, pas le signataire',
        tx.data.includes(beneficiary) && !tx.data.includes('beef'), tx.data);
      check('aucun champ value dans la transaction', tx.value === undefined, JSON.stringify(tx));
    }
    await browser.close();
  }
  {
    const { browser, page, sent } = await open({ code: '0x' });
    await search(page, ZORA);
    await page.locator('#out button', { hasText: 'Deliver to' }).first().click();
    await page.waitForTimeout(1500);
    const txt = await outText(page);
    check('bénéficiaire EOA → envoi direct sans avertissement',
      sent.length === 1 && !txt.includes('sends native ETH'), 'envoyées=' + sent.length);
    await browser.close();
  }
  {
    const { browser, page, sent } = await open({ code: '0x60806040' });
    await search(page, CLANKER);
    await page.locator('#out button', { hasText: 'Deliver to' }).first().click();
    await page.waitForTimeout(1500);
    check('contrat mais ERC-20 seul → envoi direct sans avertissement', sent.length === 1,
      'envoyées=' + sent.length);
    await browser.close();
  }

  console.log(fails === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${fails} ÉCHEC(S)`);
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
