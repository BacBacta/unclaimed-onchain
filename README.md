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

1. **Search** — you paste an address. The page validates its EIP-55 checksum, then
   looks it up in an embedded snapshot. The lookup itself is local; no wallet, nothing
   to authorise.
2. **Live figures, automatically** — right after the lookup, every displayed balance
   is re-read from the contracts in one Multicall3 `eth_call` per chain, through
   public RPC endpoints. Amounts and totals switch from the snapshot estimate to the
   real figure, withdrawn balances show as such, and their buttons are disabled. No
   wallet is needed for this. If the endpoints are unreachable, the snapshot stays,
   labelled as unverified. A *Verify live* button still lets you re-read through your
   own wallet's RPC instead of trusting the public ones.
3. **Claim** — the page builds one transaction per protocol. Splits V1 batches every
   token on a chain into a single `withdraw` call.

### Address checks

**EIP-55 checksum.** A mixed-case address carries a checksum in the case of its
letters, and the page verifies it (keccak256 is implemented inline — `SubtleCrypto`
only offers SHA-2). A failing checksum is almost always a typo or a truncated copy,
so the search is refused rather than run against a neighbouring address. All-lowercase
and all-uppercase addresses claim no checksum and are accepted as-is. After a search
the field is rewritten in canonical EIP-55 form, and addresses are displayed that way
throughout.

**Beneficiary account type.** Before a withdrawal that pays out *native ETH* — Zora,
and the `0xEeee…EEeE` pseudo-token in Splits V1 and V2 — the page calls `eth_getCode`
on the beneficiary. A contract with no payable `receive` function will reject the
transfer and the transaction reverts, costing the sender gas. Contracts can hold funds
perfectly well (a Safe or a smart account does), so this is a warning requiring a
second click, never a block. ERC-20 withdrawals are unaffected and skip the check.

Code starting with `0xef0100` is an EIP-7702 delegation designator, not a contract:
the account is still an EOA that has delegated its code to a smart-account
implementation, and it accepts ETH normally. Those are reported as regular wallets
and never gated — on a sample of native-paying Base beneficiaries they outnumbered
real contracts, so treating them as contracts made most of the warnings wrong.
EIP-3541 forbids any other code beginning with `0xef`, so the test is unambiguous.

### What the page sends where

The only outbound requests the page ever makes are read-only JSON-RPC `eth_call`s
carrying the searched address, to these public endpoints: `mainnet.base.org`,
`*.publicnode.com`, `cloudflare-eth.com`, `mainnet.optimism.io` (plus Google Fonts
for typography). Searching an address therefore reveals it to those RPC operators —
the same thing that happens when you look it up on any block explorer. Nothing else
is sent to anyone: no analytics, no backend of ours. The wallet is only touched on
explicit action, and only ever for the withdrawal itself.

### Withdrawal history

Transaction hashes used to appear once and vanish on reload. A **Withdrawals**
button in the header now opens a panel listing every withdrawal sent from this
browser — amount, protocol, chain, beneficiary, time — each linking to the block
explorer, which stays the authority on whether it went through. *Check statuses
onchain* re-reads the receipts through your wallet and marks each one confirmed
or reverted.

It lives in `localStorage`: on that device, in that browser, nothing sent
anywhere. Clearing it changes nothing onchain, and a browser that refuses
storage simply gets no history rather than an error.

### Wallets

Detection listens for EIP-6963 announcements and keeps watching `window.ethereum`
for ten seconds, because the extension and the page race to load and the loser
varies by browser. When a wallet turns up late, the banner goes away and any
search already on screen re-renders with its buttons — no reload needed.

On mobile there is nothing to wait for: mobile browsers have no extensions, and a
wallet only injects a provider inside its own built-in browser. The banner says so
and offers deep links that reopen the same page in MetaMask, Coinbase Wallet,
Trust or Phantom. They are plain links — nothing is fetched from those hosts
unless you tap one.

## Data

The embedded snapshot was built from onchain events (via Dune) plus a state read
for Clanker v3.1, by summing what was credited to each address and subtracting what
was withdrawn. It covers balances of **$25 and above**, as of **21 August 2026**,
across Ethereum, Base and Optimism.

Snapshots age, so the page does not let one assert anything: balances are re-read
live right after every search (see above), the headline total is recomputed from
what the contracts actually hold, and a fully withdrawn address says so instead of
announcing money that is no longer waiting. A withdrawal already in this browser's
history is surfaced on search with a link to the transaction. The *Verify live*
button remains as a wallet-side second opinion, so a stale snapshot can never cause
a wrong transaction.

### Addresses the snapshot does not know

An address credited after the snapshot date, or below its $25 floor, is not in the
embedded data. Searching it runs a **live scan automatically**: every protocol-token
pair the registry tracks (102 across the three chains) is read in a single
`eth_call` per chain through [Multicall3](https://www.multicall3.com/), via the same
public RPC endpoints — about two seconds for full coverage, token decimals read the
same way, no wallet required. Balances found this way get the same claim and deliver
buttons as snapshot results (a wallet is needed for those, as always).

The honest limit, stated in the interface: the scan covers pairs *seen in the
snapshot*. A token that first appeared after August 21, 2026 cannot be discovered
from a browser without an indexer — the explorer method above remains the
complete check.

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
