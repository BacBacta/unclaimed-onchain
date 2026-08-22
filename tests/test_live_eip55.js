const { chromium } = require('playwright');
const { getAddress } = require('ethers');
const fs = require('fs');

const LIVE = 'https://bacbacta.github.io/unclaimed-onchain/';
const html = fs.readFileSync(process.env.PAGE || require('path').join(__dirname, '..', 'index.html'));
const snap = JSON.parse(html.toString('utf8').match(/const SNAP\s*=\s*(\{[\s\S]*?\});\s*\n/)[1]);
const ADDRS = Object.keys(snap.a);

const IN_SNAP = getAddress('0x' + ADDRS[0]);                       // présent dans l'instantané
const NOT_IN_SNAP = '0xd3d5ba1BF2A6De742beF4Ac47961FC07Bd86ff47';  // valide, absente de l'instantané (vérifié)

let fails = 0;
const check = (label, cond, detail) => {
  if (!cond) fails++;
  console.log(cond ? '  ok   ' : ' FAIL  ', label, cond ? '' : '\n         ' + (detail || ''));
};
const flip = (addr, n) => {          // recasse n lettres → checksum invalide
  const b = [...addr.slice(2)];
  let done = 0;
  for (let i = 0; i < b.length && done < n; i++) {
    if (/[a-fA-F]/.test(b[i])) {
      b[i] = b[i] === b[i].toLowerCase() ? b[i].toUpperCase() : b[i].toLowerCase();
      done++;
    }
  }
  return '0x' + b.join('');
};

(async () => {
  console.log('cible :', LIVE);
  console.log('adresse dans l\'instantané :', IN_SNAP);
  console.log('adresse hors instantané   :', NOT_IN_SNAP, '\n');

  const browser = await chromium.launch({
    ...(process.env.CHROME ? {executablePath: process.env.CHROME} : {}), args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // Chromium ne peut pas ouvrir de socket TLS vers github.io depuis ce bac à sable :
  // on lui sert les octets récupérés en direct, sous la vraie origine.
  let served = 0;
  await page.route('https://bacbacta.github.io/**', route => {
    served++;
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  });
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.route('https://fonts.gstatic.com/**', r => r.abort());

  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(LIVE, { waitUntil: 'load' });
  await page.waitForTimeout(900);

  check('page chargée sous la vraie origine',
    page.url() === LIVE && served > 0, 'url=' + page.url() + ' servi=' + served);
  check('aucune erreur JavaScript au chargement', errors.length === 0, errors.join(' | '));
  check('le code EIP-55 est bien présent dans la page déployée',
    await page.evaluate(() => typeof toChecksum === 'function' && typeof checksumStatus === 'function'));

  /* Le balayage live arrive après le rendu : lire #out trop tôt attrape
     « Reading the contracts… » plutôt que la conclusion. On attend qu'elle se pose. */
  const search = async v => {
    await page.fill('#addr', v);
    await page.click('#go');
    const t0 = Date.now(); let out = '';
    do {
      await page.waitForTimeout(400);
      out = await page.locator('#out').innerText().catch(() => '');
    } while (/Reading the contracts/.test(out) && Date.now() - t0 < 45000);
    return { out, field: await page.inputValue('#addr') };
  };

  console.log('\n1. Formes acceptées');
  let r = await search(IN_SNAP);
  check('forme canonique EIP-55 → recherche effectuée', r.out.includes('WAITING FOR YOU'), r.out.slice(0, 120));
  check('champ réécrit en forme canonique', r.field === IN_SNAP, 'champ=' + r.field);

  r = await search(IN_SNAP.toLowerCase());
  check('tout minuscule → accepté (aucun checksum revendiqué)', r.out.includes('WAITING FOR YOU'), r.out.slice(0, 120));
  check('minuscule → normalisé en EIP-55', r.field === IN_SNAP, 'champ=' + r.field);

  r = await search('0x' + IN_SNAP.slice(2).toUpperCase());
  check('tout majuscule → accepté (aucun checksum revendiqué)', r.out.includes('WAITING FOR YOU'), r.out.slice(0, 120));
  check('majuscule → normalisé en EIP-55', r.field === IN_SNAP, 'champ=' + r.field);

  r = await search('   ' + IN_SNAP + '   ');
  check('espaces autour → tolérés', r.out.includes('WAITING FOR YOU'), r.out.slice(0, 120));

  r = await search(IN_SNAP.slice(2));
  check('sans préfixe 0x → accepté', r.out.includes('WAITING FOR YOU'), r.out.slice(0, 120));

  console.log('\n2. Checksum invalide → refus');
  for (const n of [1, 2, 5]) {
    const broken = flip(IN_SNAP, n);
    r = await search(broken);
    check(`${n} lettre(s) recassée(s) → refus EIP-55`, r.out.includes('EIP-55 checksum'), r.out.slice(0, 160));
    check(`${n} lettre(s) recassée(s) → aucun résultat`, !r.out.includes('WAITING FOR YOU'));
    check(`${n} lettre(s) recassée(s) → forme canonique proposée`, r.out.includes(IN_SNAP), r.out.slice(0, 260));
  }

  console.log('\n3. Erreurs de format distinguées du checksum');
  for (const [label, v] of [
    ['trop court', IN_SNAP.slice(0, 41)],
    ['trop long', IN_SNAP + 'a'],
    ['caractère non hexadécimal', IN_SNAP.slice(0, 41) + 'Z'],
    ['vide', ''],
  ]) {
    r = await search(v);
    check(`${label} → erreur de format, pas de checksum`,
      r.out.includes("isn't in the right format") && !r.out.includes('EIP-55'), r.out.slice(0, 140));
  }

  console.log('\n4. Checksum valide mais absent de l\'instantané');
  r = await search(NOT_IN_SNAP);
  check('adresse valide inconnue → "rien trouvé", pas une erreur de checksum',
    /Nothing (found|credited)/.test(r.out) && !r.out.includes('EIP-55'), r.out.slice(0, 160));
  r = await search(flip(NOT_IN_SNAP, 1));
  check('même adresse recassée → refus EIP-55 avant toute recherche',
    r.out.includes('EIP-55 checksum') && !/Nothing (found|credited)/.test(r.out), r.out.slice(0, 160));

  console.log('\n5. Test différentiel du code déployé, dans le navigateur');
  const mine = await page.evaluate(() => Object.keys(SNAP.a).map(a => toChecksum(a)));
  let div = 0, first = null;
  ADDRS.forEach((a, i) => {
    const ref = getAddress('0x' + a);
    if (mine[i] !== ref) { div++; if (!first) first = `${a}\n         page=${mine[i]}\n         ethers=${ref}`; }
  });
  check(`toChecksum de la page vs ethers.getAddress sur ${ADDRS.length} adresses`, div === 0, first);

  const statuses = await page.evaluate(([ck, low, up, bad]) =>
    [checksumStatus(ck), checksumStatus(low), checksumStatus(up), checksumStatus(bad)],
    [IN_SNAP, IN_SNAP.toLowerCase(), '0x' + IN_SNAP.slice(2).toUpperCase(), flip(IN_SNAP, 1)]);
  check('checksumStatus déployé renvoie ok/nochecksum/nochecksum/bad',
    JSON.stringify(statuses) === JSON.stringify(['ok', 'nochecksum', 'nochecksum', 'bad']),
    JSON.stringify(statuses));

  const vectors = await page.evaluate(() => [
    toChecksum('5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'),
    toChecksum('fb6916095ca1df60bb79ce92ce3ea74c37c5d359'),
    toChecksum('dbf03b407c01e7cd3cbea99509d93f8dddc8c6fb'),
    toChecksum('d1220a0cf47c7b9be7a2e6ba89f429762e7b9adb'),
  ]);
  check('vecteurs officiels EIP-55 rejoués dans la page déployée',
    JSON.stringify(vectors) === JSON.stringify([
      '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
      '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
      '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
      '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb']), JSON.stringify(vectors));

  check('toujours aucune erreur JavaScript après tous les scénarios',
    errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log(fails === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${fails} ÉCHEC(S)`);
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
