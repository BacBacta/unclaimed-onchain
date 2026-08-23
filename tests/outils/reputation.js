#!/usr/bin/env node
/* Le site dit « vous avez des fonds non réclamés » : c'est mot pour mot le
   prétexte de hameçonnage le plus courant. Se faire signaler par erreur n'est
   pas une hypothèse — 187 domaines *.github.io sont déjà sur la liste noire de
   MetaMask, et ceux qu'on y lit sont exactement ce genre de page.
   Cet outil interroge les listes publiques. Il ne corrige rien : il dit où on
   en est, pour qu'on l'apprenne avant les utilisateurs.                     */

const DOMAINES = process.argv.slice(2).length ? process.argv.slice(2)
  : ['unclaimed-onchain.xyz', 'bacbacta.github.io'];

const SOURCES = [
  { nom: 'MetaMask eth-phishing-detect',
    url: 'https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json',
    lire: t => { const d = JSON.parse(t);
      return { listes: { 'liste noire': d.blacklist || [], 'liste blanche': d.whitelist || [] } }; },
    recours: 'PR sur le dépôt : yarn add:allowlist <domaine>' },

  { nom: 'Phantom blocklist',
    url: 'https://raw.githubusercontent.com/phantom/blocklist/master/blocklist.yaml',
    lire: t => ({ listes: { 'liste noire': t.split('\n')
      .map(l => l.trim().replace(/^-\s*/, '').replace(/^["']|["']$/g, ''))
      .filter(l => l && !l.startsWith('#')) } }),
    recours: 'Issue sur github.com/phantom/blocklist' },

  { nom: 'ScamSniffer',
    url: 'https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/domains.json',
    lire: t => ({ listes: { 'liste noire': JSON.parse(t) } }),
    recours: 'Formulaire de contestation sur scamsniffer.io' },
];

/* Blockaid alimente Phantom, MetaMask, Coinbase Wallet, Rainbow et Zerion, mais
   n'expose pas de liste publique : il faut passer par leur portail. */
const SANS_LISTE = [
  ['Blockaid (Phantom, MetaMask, Coinbase, Rainbow, Zerion)', 'https://report.blockaid.io'],
  ['ChainPatrol', 'https://app.chainpatrol.io/dispute'],
  ['Google Safe Browsing', 'https://safebrowsing.google.com/safebrowsing/report_error/'],
];

/* Le « voisinage » est le suffixe partagé avec d'autres sites : github.io pour
   une page GitHub, .xyz pour un domaine ordinaire. Prendre bêtement les deux
   derniers labels comptait, pour unclaimed-onchain.xyz, ses propres
   sous-domaines — c'est-à-dire zéro, ce qui rassurait à tort. */
const SUFFIXES_PARTAGES = ['github.io','vercel.app','netlify.app','pages.dev','web.app',
  'firebaseapp.com','surge.sh','onrender.com','fleek.co','ipfs.io'];
function voisinage(d) {
  const p = d.split('.');
  for (const s of SUFFIXES_PARTAGES)
    if (d.endsWith('.' + s) && p.length > s.split('.').length) return s;
  return p[p.length - 1];
}

async function verifier(DOMAINE, cache) {
  console.log(`\ndomaine vérifié : ${DOMAINE}`);
  let signale = 0, injoignable = 0;

  for (const s of SOURCES) {
    let txt;
    try {
      const r = await fetch(s.url, { signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      txt = await r.text();
    } catch (e) {
      injoignable++;
      console.log(`  ?  ${s.nom.padEnd(34)} injoignable (${e.message})`);
      continue;
    }
    let d;
    try { d = s.lire(txt); } catch (e) {
      injoignable++;
      console.log(`  ?  ${s.nom.padEnd(34)} illisible (${e.message})`); continue;
    }
    const trouve = [];
    let total = 0;
    for (const [nom, liste] of Object.entries(d.listes)) {
      total += liste.length;
      for (const x of liste) {
        const v = String(x).toLowerCase();
        if (v === DOMAINE || v.endsWith('.' + DOMAINE)) trouve.push(nom);
      }
    }
    const noirs = trouve.filter(x => /noire/.test(x));
    if (noirs.length) { signale++; console.log(`  ✗  ${s.nom.padEnd(34)} SIGNALÉ (${noirs.join(', ')})`); }
    else console.log(`  ✓  ${s.nom.padEnd(34)} absent des ${total.toLocaleString('fr-FR')} entrées`
      + (trouve.length ? ` · présent en ${trouve.join(', ')}` : ''));
  }

  console.log('\nsans liste publique — à surveiller à la main :');
  for (const [nom, url] of SANS_LISTE) console.log(`     ${nom.padEnd(56)} ${url}`);

  console.log('\nvoisinage : part du domaine parent déjà signalée');
  try {
    const d = JSON.parse(await (await fetch(SOURCES[0].url, { signal: AbortSignal.timeout(60000) })).text());
    const p = voisinage(DOMAINE);
    const n = d.blacklist.filter(x => String(x).endsWith('.' + p)).length;
    const part = (100 * n / d.blacklist.length).toFixed(1);
    console.log(`     ${n} domaines *.${p} sur la liste noire MetaMask (${part} % de la liste)`
      + (n > 500 ? ' — quartier très signalé' : n > 50 ? ' — quartier signalé' : ''));
  } catch (e) { console.log('     indisponible'); }

  return signale;
}

(async () => {
  let total = 0;
  for (const d of DOMAINES) total += await verifier(d);
  console.log(total ? `\n${total} SIGNALEMENT(S) — agir maintenant`
                    : '\nAUCUNE LISTE PUBLIQUE NE SIGNALE CES DOMAINES');
  process.exit(total ? 1 : 0);
})();
