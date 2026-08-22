#!/usr/bin/env python3
"""
Régénère l'instantané embarqué dans index.html à partir des exports Dune.

Usage :
    python3 build_snapshot.py --csv-dir ./exports --html index.html --eth-price 2400

Attend dans --csv-dir les exports CSV des requêtes (le nom importe peu, la
détection se fait sur les colonnes) :
  • Splits V1 ETH mainnet .... recipient, unclaimed_eth
  • Splits V1 ERC-20 mainnet . recipient, token, symbol, unclaimed, unclaimed_usd
  • Splits V1 ETH Base ....... recipient, unclaimed_eth
  • Splits V2 Warehouse ...... chain, recipient, token, symbol, unclaimed, unclaimed_usd
  • Zora Protocol Rewards .... recipient, unclaimed_eth, segment
  • Clanker Fee Locker ....... fee_owner, token, symbol, unclaimed, unclaimed_usd

Le script réécrit uniquement la constante SNAP dans le HTML : le reste du
fichier n'est pas touché.
"""
import argparse, json, re, sys, glob, os
import pandas as pd

NATIVE = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
PROTO  = ["v1", "v2", "zora", "clanker"]
CHAINS = [1, 8453, 10]
CHAIN_ID = {"ethereum": 1, "base": 8453, "optimism": 10}
# Seuils par défaut. Le gaz coûte aujourd'hui ~0,001 $ sur Base : c'est au
# bénéficiaire de juger si sa position vaut le retrait, pas à ce script.
# Ils restent réglables, car l'instantané est embarqué dans la page et son
# poids croît linéairement avec le nombre d'adresses retenues.
MIN_LINE  = 0.5    # ignorer une ligne sous ce montant, en dollars
MIN_TOTAL = 1      # ignorer une adresse totalisant moins que cela


def load(csv_dir):
    """Classe chaque CSV du dossier selon ses colonnes."""
    found = {}
    for path in sorted(glob.glob(os.path.join(csv_dir, "*.csv"))):
        try:
            df = pd.read_csv(path)
        except Exception as e:
            print(f"  ! illisible, ignoré : {os.path.basename(path)} ({e})")
            continue
        cols = set(df.columns)
        if {"fee_owner", "unclaimed_usd"} <= cols:
            found.setdefault("clanker", []).append(df)
        elif {"chain", "recipient", "token"} <= cols:
            found.setdefault("v2", []).append(df)
        elif {"recipient", "token", "unclaimed_usd"} <= cols:
            found.setdefault("v1erc", []).append(df)
        elif {"recipient", "unclaimed_eth", "segment"} <= cols and "n_credits" in cols:
            found.setdefault("zora", []).append(df)
        elif {"recipient", "unclaimed_eth"} <= cols:
            key = "v1eth_base" if "base" in os.path.basename(path).lower() else "v1eth"
            df = df.copy(); df["chain_id"] = 8453 if key == "v1eth_base" else 1
            found.setdefault(key, []).append(df)
        else:
            print(f"  ? colonnes non reconnues, ignoré : {os.path.basename(path)}")
            continue
        print(f"  ✓ {os.path.basename(path)} → {list(found)[-1]} ({len(df)} lignes)")
    return {k: pd.concat(v, ignore_index=True) for k, v in found.items()}


def build(data, eth_price, min_line=MIN_LINE, min_total=MIN_TOTAL):
    from collections import defaultdict
    idx = defaultdict(list)

    def add(addr, proto, chain, token, symbol, amount, usd):
        if not isinstance(addr, str) or usd is None or amount is None:
            return
        try:
            usd = float(usd); amount = float(amount)
        except (TypeError, ValueError):
            return
        if usd != usd or amount != amount or usd < min_line:   # NaN ou trop petit
            return
        idx[addr.lower()].append([proto, chain, str(token).lower().replace("0x", ""),
                                  str(symbol)[:10], round(float(amount), 6), round(float(usd))])

    for key in ("v1eth", "v1eth_base"):
        df = data.get(key)
        if df is None:
            continue
        for r in df.itertuples():
            add(r.recipient, "v1", int(r.chain_id), NATIVE, "ETH",
                r.unclaimed_eth, r.unclaimed_eth * eth_price)

    v1t = data.get("v1erc")
    if v1t is not None:
        for r in v1t.dropna(subset=["unclaimed_usd"]).itertuples():
            add(r.recipient, "v1", 1, r.token, r.symbol, r.unclaimed, r.unclaimed_usd)

    v2 = data.get("v2")
    if v2 is not None:
        v2 = (v2.sort_values("unclaimed_usd", na_position="last")
                .drop_duplicates(["chain", "recipient", "token"]))
        for r in v2.itertuples():
            tok = str(r.token).lower().replace("0x", "")
            usd = r.unclaimed * eth_price if tok == NATIVE else r.unclaimed_usd
            sym = "ETH" if tok == NATIVE else r.symbol
            cid = CHAIN_ID.get(str(r.chain).lower())
            if cid:
                add(r.recipient, "v2", cid, tok, sym, r.unclaimed, usd)

    z = data.get("zora")
    if z is not None:
        act = {"a_jour", "actif_flux_recent"}
        for r in z[~z.segment.isin(act)].itertuples():
            add(r.recipient, "zora", 8453, NATIVE, "ETH", r.unclaimed_eth, r.unclaimed_eth * eth_price)

    ck = data.get("clanker")
    if ck is not None:
        for r in ck.dropna(subset=["unclaimed_usd"]).itertuples():
            add(r.fee_owner, "clanker", 8453, r.token, r.symbol, r.unclaimed, r.unclaimed_usd)

    kept = {a: rows for a, rows in idx.items() if sum(x[5] for x in rows) >= min_total}

    # compactage : table de tokens dédupliquée + indices
    toks, out = {}, {}
    for addr, rows in kept.items():
        entries = []
        for proto, chain, tok, sym, amt, usd in rows:
            if tok not in toks:
                toks[tok] = [len(toks), sym]
            entries.append([PROTO.index(proto), CHAINS.index(chain), toks[tok][0], amt, usd])
        out[addr.replace("0x", "")] = entries

    table = [None] * len(toks)
    for tok, (i, sym) in toks.items():
        table[i] = [tok, sym]
    total = sum(sum(e[4] for e in v) for v in out.values())
    return {"t": table, "a": out}, len(out), total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv-dir", default=".", help="dossier des exports CSV Dune")
    ap.add_argument("--html", default="index.html", help="fichier à mettre à jour")
    ap.add_argument("--eth-price", type=float, required=True, help="prix ETH en USD")
    ap.add_argument("--min-line", type=float, default=MIN_LINE,
                    help=f"ignorer une position sous ce montant en dollars (défaut {MIN_LINE})")
    ap.add_argument("--min-total", type=float, default=MIN_TOTAL,
                    help=f"ignorer une adresse totalisant moins (défaut {MIN_TOTAL})")
    a = ap.parse_args()

    print(f"Lecture de {a.csv_dir} …")
    print("  (astuce : mettez « base » dans le nom du CSV des ETH Base,")
    print("   sinon ils seront comptés sur Ethereum)\n")
    data = load(a.csv_dir)
    if not data:
        sys.exit("Aucun CSV exploitable trouvé.")

    print(f"  seuils : position ≥ ${a.min_line:g} · adresse ≥ ${a.min_total:g}")
    blob, n_addr, total = build(data, a.eth_price, a.min_line, a.min_total)
    js = json.dumps(blob, separators=(",", ":"))
    print(f"\n{n_addr:,} adresses · {len(blob['t'])} tokens · ${total:,.0f} · {len(js)//1024} KB")

    html = open(a.html, encoding="utf-8").read()
    new, n = re.subn(r"const SNAP = \{.*?\};", "const SNAP = " + js + ";", html, count=1, flags=re.S)
    if n != 1:
        sys.exit("La constante SNAP est introuvable dans le HTML — rien n'a été écrit.")
    open(a.html, "w", encoding="utf-8").write(new)
    print(f"✓ {a.html} mis à jour.")
    print("  Pense à mettre à jour la date de l'instantané dans le dictionnaire I18N.")


if __name__ == "__main__":
    main()
