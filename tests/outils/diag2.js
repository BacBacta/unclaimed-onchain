(async () => {
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;inset:8px 8px auto 8px;z-index:99999;max-height:70vh;overflow:auto;'
    + 'background:#000;color:#0f0;font:12px/1.45 monospace;padding:14px;border:2px solid #0f0;white-space:pre-wrap';
  box.textContent = 'diagnostic en cours… (jusqu à 20 s)';
  document.body.appendChild(box);
  const e = window.ethereum;
  const r = { url: location.href, dansUnIframe: window.top !== window.self, objetEthereum: !!e };
  const show = () => { box.textContent = JSON.stringify(r, null, 1); };
  if (!e) { show(); return; }
  const FLAGS = ['isMetaMask','isRabby','isCoinbaseWallet','isBraveWallet','isPhantom','isTrust','isOkxWallet','isZerion','isFrame','isExodus','isBitKeep'];
  r.marqueurs = FLAGS.filter(k => e[k]);
  r.nbFournisseurs = Array.isArray(e.providers) ? e.providers.length : 1;
  if (Array.isArray(e.providers))
    r.fournisseurs = e.providers.map(p => FLAGS.filter(k => p[k]).join(',') || 'inconnu');
  const annonces = [];
  window.addEventListener('eip6963:announceProvider', ev => { annonces.push(ev.detail.info.name); });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  show();
  const essai = (m) => {
    const t0 = Date.now();
    return Promise.race([
      e.request({ method: m }).then(v => ({ ok: v, ms: Date.now() - t0 }))
        .catch(x => ({ erreur: (x && x.message || String(x)).slice(0, 90), code: x && x.code, ms: Date.now() - t0 })),
      new Promise(res => setTimeout(() => res({ SANS_REPONSE: 'plus de 8s' }), 8000)),
    ]);
  };
  r.eth_chainId = await essai('eth_chainId'); show();
  r.eth_accounts = await essai('eth_accounts'); show();
  await new Promise(res => setTimeout(res, 400));
  r.wallets_annonces_EIP6963 = annonces;
  r.navigateur = navigator.userAgent;
  show();
  console.log(JSON.stringify(r, null, 1));
})()
