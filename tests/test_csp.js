/* La CSP n'est une protection que si ses empreintes suivent le fichier. Un
   ajout de script sans régénération, et la page ne s'exécute plus du tout en
   production — mieux vaut que ça casse ici. */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
let fails = 0;
const check = (l,c,d)=>{if(!c)fails++;console.log(c?'  ok   ':' FAIL  ',l,c?'':'\n         '+(d||''));};

const RACINE = path.join(__dirname, '..');
const conf = JSON.parse(fs.readFileSync(path.join(RACINE,'vercel.json'),'utf8'));
const csp = conf.headers[0].headers.find(h=>h.key==='Content-Security-Policy').value;
/* Toujours le fichier livré, jamais PAGE : le lanceur sert une copie où il a
   injecté window.__delais, donc un bloc <script> de plus. Ce contrôle porte
   sur ce qui part en production, pas sur la variante de test. */
const html = fs.readFileSync(path.join(RACINE,'index.html'),'utf8');

let sortie = '', code = 0;
try { sortie = execFileSync('node', [path.join(RACINE,'tests/outils/csp.js'),'--check'],
  {encoding:'utf8', env:{...process.env, PAGE:''}}); }
catch (e) { sortie = (e.stdout||'') + (e.stderr||''); code = e.status; }
check('les empreintes de vercel.json correspondent aux scripts de la page', code === 0, sortie.trim());

check("script-src ne contient plus 'unsafe-inline'", !/script-src[^;]*'unsafe-inline'/.test(csp),
  (csp.match(/script-src [^;]*/)||[''])[0]);
check('script-src porte une empreinte par bloc en ligne',
  (csp.match(/'sha256-[^']+'/g)||[]).length === (html.match(/<script>/g)||[]).length,
  (csp.match(/script-src [^;]*/)||[''])[0]);
check("default-src est 'none'", /default-src 'none'/.test(csp), csp.slice(0,60));
check('connect-src liste exactement les endpoints de la page', (() => {
  const dansCsp = (csp.match(/connect-src ([^;]*)/)||[,''])[1].trim().split(/\s+/).sort();
  const dansPage = [...new Set((html.match(/https:\/\/[a-z0-9.-]*(publicnode\.com|base\.org|drpc\.org|optimism\.io)/g)||[]))].sort();
  return JSON.stringify(dansCsp) === JSON.stringify(dansPage);
})(), (csp.match(/connect-src [^;]*/)||[''])[0]);

/* Un attribut de gestionnaire en ligne redemanderait 'unsafe-inline'. */
check("aucun attribut on*= dans la page", !/\bon[a-z]+="/.test(html),
  (html.match(/\bon[a-z]+="[^"]*"/g)||[]).slice(0,3).join(' '));

console.log(fails===0?'\nTOUS LES TESTS PASSENT':`\n${fails} ÉCHEC(S)`);
process.exit(fails===0?0:1);
