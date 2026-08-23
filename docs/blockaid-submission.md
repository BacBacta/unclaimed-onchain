# Unclaimed Onchain — proactive submission to Blockaid

**Site:** https://unclaimed-onchain.xyz/
**Mirror:** https://bacbacta.github.io/unclaimed-onchain/ (same commit)
**Source:** https://github.com/BacBacta/unclaimed-onchain (public, single unminified HTML file)
**security.txt:** https://unclaimed-onchain.xyz/.well-known/security.txt

## What it is

A public registry of funds that revenue-sharing protocols hold on behalf of
people who never withdrew them. Anyone can look up an address and see what four
contracts still owe it, then call the withdraw function themselves.

## Why it will look like phishing, and why it is not

"You have unclaimed funds" is the most common phishing pretext in crypto. This
site says it because it is true and verifiable onchain, and it is built so that
a reviewer never has to take our word for it.

The withdraw functions it calls have **no access control**: they take the
beneficiary as an argument and pay that beneficiary. The site cannot redirect
anything, because the destination is written into an immutable contract, not
chosen by the page.

| Protocol | Contract | Function |
|---|---|---|
| Splits V1 | 0x2ed6c4B5dA6378c7897AC67Ba9e43102Feb694EE | withdraw(account, withdrawETH, tokens[]) |
| Splits V2 Warehouse | 0x8fb66F38cF86A3d5e8768f8F1754A24A6c661Fb8 | withdraw(owner, token) |
| Zora Protocol Rewards | 0x7777777F279eba3d3Ad8F4E708545291A6fDBA8B | withdrawFor(to, amount) |
| Clanker Fee Locker v4 | 0xF3622742b1E446D92e45E22923Ef11C2fcD55D68 | claim(feeOwner, token) |

## Claims you can verify in the source, in one minute each

- **No token approval, ever.** `approve` and `0x095ea7b3` do not appear in the file.
- **No `personal_sign`, `eth_sign` or `signTypedData`.** None appear in the file.
- **One `eth_sendTransaction` call site** (1 in the whole file): the withdrawal itself.
- **No obfuscation:** no `eval`, no `Function(`, no `atob`, nothing minified,
  and no script loaded from any external origin.
- **Enforced network contract:** the Content-Security-Policy served in production
  restricts `connect-src` to six public RPC endpoints and `default-src` to
  `'none'`. The page cannot reach anywhere else, whatever a script tries.

```
curl -sI https://unclaimed-onchain.xyz/ | grep -i content-security-policy
```

- **It never holds funds.** No custody, no deposit, no payment to unlock anything.
- The project README opens with a section titled *"Why you should not trust this
  site (and how to verify it anyway)"*, listing the contracts so a visitor can
  bypass the site entirely and call the functions from a block explorer.

## Status on other lists (checked 2026-08-23)

Absent from MetaMask eth-phishing-detect, Phantom's blocklist and ScamSniffer.

## Contact

https://github.com/BacBacta/unclaimed-onchain/issues
