#!/usr/bin/env node
/* Sans 'unsafe-inline', la CSP n'autorise un script en ligne que si son
   empreinte figure dans la directive. C'est ce qui donne enfin du sens à
   script-src : un script injecté n'a pas la bonne empreinte, donc il ne
   s'exécute pas — quel qu'en soit le chemin d'entrée.
   Le prix, c'est que les empreintes doivent suivre le fichier. Cet outil les
   régénère (par défaut) ou vérifie qu'elles correspondent (--check), et le
   second mode tourne dans la batterie pour qu'une dérive casse un test plutôt
   que le site. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const RACINE = path.join(__dirname, '..', '..');
/* Pas de surcharge par PAGE : les empreintes décrivent le fichier livré. Le
   lanceur sert une copie enrichie d'un script de test, qui n'a rien à y faire. */
const PAGE = path.join(RACINE, 'index.html');
const CONF = path.join(RACINE, 'vercel.json');
const check = process.argv.includes('--check');

const html = fs.readFileSync(PAGE, 'utf8');
const blocs = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!blocs.length) { console.error('aucun bloc <script> trouvé dans ' + PAGE); process.exit(2); }
const empreintes = blocs.map(b =>
  "'sha256-" + crypto.createHash('sha256').update(b, 'utf8').digest('base64') + "'");

const conf = JSON.parse(fs.readFileSync(CONF, 'utf8'));
const entete = conf.headers[0].headers.find(h => h.key === 'Content-Security-Policy');
const actuel = entete.value;
const attendu = actuel.replace(/script-src [^;]*/, 'script-src ' + empreintes.join(' '));

if (check) {
  const ok = actuel === attendu;
  console.log(`${blocs.length} bloc(s) en ligne · ${ok ? 'empreintes à jour' : 'EMPREINTES PÉRIMÉES'}`);
  if (!ok) {
    console.log('\n  dans vercel.json : ' + (actuel.match(/script-src [^;]*/) || [''])[0]);
    console.log('  attendu          : ' + (attendu.match(/script-src [^;]*/) || [''])[0]);
    console.log('\n  régénérer : node tests/outils/csp.js');
  }
  if (/'unsafe-inline'/.test(attendu.match(/script-src [^;]*/)[0])) {
    console.log("  ⚠ script-src contient encore 'unsafe-inline'");
    process.exit(1);
  }
  process.exit(ok ? 0 : 1);
}

entete.value = attendu;
fs.writeFileSync(CONF, JSON.stringify(conf, null, 2) + '\n');
console.log(`${blocs.length} bloc(s) en ligne · empreintes écrites dans vercel.json`);
for (const e of empreintes) console.log('  ' + e);
