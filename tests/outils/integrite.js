#!/usr/bin/env node
/* Le maillon faible de ce site n'est pas son code, c'est ce qui le met en
   ligne : qui tient le dépôt ou le compte d'hébergement réécrit la page.
   On ne peut pas empêcher ça, mais on peut le rendre détectable — et pas
   seulement par nous.
   La page est servie par deux hébergeurs indépendants depuis un dépôt public.
   Les trois doivent rendre exactement les mêmes octets. Un attaquant qui n'en
   compromet qu'un est visible ; il lui faut les trois pour passer inaperçu.
   Aucune empreinte n'est publiée nulle part : la vérification se suffit à
   elle-même, donc rien ne périme. */
const crypto = require('crypto');

const SOURCES = [
  ['dépôt (source)', 'https://raw.githubusercontent.com/BacBacta/unclaimed-onchain/main/index.html'],
  ['domaine',        'https://unclaimed-onchain.xyz/'],
  ['miroir',         'https://bacbacta.github.io/unclaimed-onchain/'],
];

(async () => {
  const vus = [];
  for (const [nom, url] of SOURCES) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(90000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      const h = crypto.createHash('sha256').update(buf).digest('hex');
      vus.push({ nom, h, taille: buf.length });
      console.log(`  ${nom.padEnd(16)} ${h}  ${buf.length.toLocaleString('fr-FR').replace(/,/g,' ')} octets`);
    } catch (e) {
      vus.push({ nom, h: null, err: e.message });
      console.log(`  ${nom.padEnd(16)} INJOIGNABLE (${e.message})`);
    }
  }
  const lus = vus.filter(v => v.h);
  const distinctes = new Set(lus.map(v => v.h));
  console.log();
  if (lus.length < 2) { console.log('pas assez de sources lues pour comparer'); process.exit(2); }
  if (distinctes.size === 1) {
    console.log(`LES ${lus.length} SOURCES SERVENT LES MÊMES OCTETS`);
    process.exit(0);
  }
  console.log('DIVERGENCE — au moins une source ne sert pas le code du dépôt.');
  console.log('Un déploiement en retard l\'explique aussi ; vérifier avant de conclure.');
  process.exit(1);
})();
