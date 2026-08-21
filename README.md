# Unclaimed Onchain

A public registry that lets anyone check whether revenue-sharing protocols are
holding money credited to them — and withdraw it themselves.

Four contracts hold roughly **$8M** credited to ~121,000 addresses that never
came to collect it. Not a bug, not a theft: the cost of the "pull" model, where
your share is credited to your name but only moves when someone calls a withdraw
function.

**Live site:** https://bacbacta.github.io/unclaimed-onchain/

---

## Why you should not trust this site (and how to verify it anyway)

"You have unclaimed funds" is the most common phishing message in crypto. You are
right to be suspicious. So here is everything you need to bypass this site
entirely.

| Protocol | Contract | Chains | Withdraw function |
|---|---|---|---|
| Splits V1 | [`0x2ed6c4B5dA6378c7897AC67Ba9e43102Feb694EE`](https://etherscan.io/address/0x2ed6c4B5dA6378c7897AC67Ba9e43102Feb694EE#writeContract) | Ethereum, Base | `withdraw(account, withdrawETH, tokens[])` |
| Splits V2 Warehouse | [`0x8fb66F38cF86A3d5e8768f8F1754A24A6c661Fb8`](https://etherscan.io/address/0x8fb66F38cF86A3d5e8768f8F1754A24A6c661Fb8#writeContract) | Ethereum, Base, Optimism | `withdraw(owner, token)` |
| Zora Protocol Rewards | [`0x7777777F279eba3d3Ad8F4E708545291A6fDBA8B`](https://basescan.org/address/0x7777777F279eba3d3Ad8F4E708545291A6fDBA8B#writeContract) | Base | `withdrawFor(to, amount)` — `0` withdraws everything |
| Clanker Fee Locker v4 | [`0xF3622742b1E446D92e45E22923Ef11C2fcD55D68`](https://basescan.org/address/0xF3622742b1E446D92e45E22923Ef11C2fcD55D68#writeContract) | Base | `claim(feeOwner, token)` |

Open any of those, connect your wallet **to the explorer**, call the function with
your own address. You never need this site.

### What this site never does

- **No token approvals.** Not one, ever. If a page asks you to approve a token to
  "release" funds, it is not this one.
- **No seed phrase, no signature other than the withdrawal itself.**
- **No payment to unlock anything.** The tip is optional, comes after a successful
  withdrawal, and is a plain ETH transfer.
- **It never holds your funds.** The recipient is an argument of the contract call,
  written into an immutable contract. This site cannot redirect anything.

### The consequence people miss

Those withdraw functions have **no access control**. They take the beneficiary as
an argument and send that beneficiary their funds. So anyone can pay the gas to
*deliver* someone else's forgotten money, without ever being able to divert it.
The site supports this: search any address, connect a different wallet, and the
button becomes "Deliver to 0x…".

---

## How it works

1. **Search** — you paste an address. The page looks it up in an embedded snapshot.
   No network call, no wallet, nothing to authorise.
2. **Verify live** — an `eth_call` re-reads the real balance from the contract
   through your own wallet's RPC. Free, read-only. That figure is the one that counts.
3. **Claim** — the page builds one transaction per protocol. Splits V1 batches every
   token on a chain into a single `withdraw` call.

## Data

The embedded snapshot was built from onchain events (via Dune) plus a state read
for Clanker v3.1, by summing what was credited to each address and subtracting what
was withdrawn. It covers balances of **$25 and above**, as of **21 August 2026**,
across Ethereum, Base and Optimism.

Snapshots age. The *Verify live* button always re-reads the contract before any
withdrawal, so a stale snapshot can never cause a wrong transaction — at worst it
shows an amount that has already been claimed.

### Known limits

- Tokens without a market price are counted as zero, so the totals are a floor.
- Native ETH in the Splits V2 Warehouse uses the pseudo-token
  `0xEeee…EEeE`, which is absent from most metadata tables — a naive query misses
  612 ETH. This one does not.
- Aggregate by contract address, never by symbol: three different contracts use the
  symbol "WETH" in the Warehouse, two of them counterfeit.

## Running and deploying

It is a single self-contained HTML file. No build step, no dependencies, no backend.

```bash
# serve locally
python3 -m http.server 8000
# then open http://localhost:8000
```

To deploy, drop `index.html` on Netlify, Vercel, Cloudflare Pages, GitHub Pages or
IPFS. Before you do, set your tip address at the top of the script:

```js
const TIP_ADDRESS = "0x0000000000000000000000000000000000000000"; // ← your address
```

Until it is set, the tip buttons show an explicit error instead of sending anything.

## Licence

MIT. See `LICENSE`.

## Not affiliated

This project has no connection to Splits, Zora or Clanker. It only reads their
public contracts.
