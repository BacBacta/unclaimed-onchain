# Launch thread — paste one block per tweet

Images live in `docs/media/`. Attach one to these three tweets and leave the
rest as text: a thread that alternates dense text with an occasional visual
reads as research, one that is all cards reads as an ad.

| Tweet | Image | Why this one |
|---|---|---|
| **1** | `media/tweet-1-accroche.png` | the hook, with the live panel as proof it runs |
| **4** | `media/tweet-4-qui-retire.png` | the 86/14 finding — a number is remembered as a picture |
| **6** | `media/tweet-6-livraisons.png` | the two deliveries, cost beside amount |

All three are 2400×1350 (16:9), which X shows full-width without cropping.

Links count as 23 chars on X regardless of length. Every tweet below is under
the limit. Post 1/ then reply each next one to the previous.

---

**1/**
Four contracts are quietly holding ~$7.8M that belongs to ~121,000 addresses.

Not stolen. Not lost. Just never collected.

I indexed all of it, replayed the chains to check it, and built a way to see if any of it is yours. 🧵

---

**2/**
The cause is the "pull" model.

Splits, Zora and Clanker don't send your revenue share to you — they credit it to your address inside the contract, and it sits there until someone calls withdraw().

Most people never do. Many don't know there's anything to pull.

---

**3/**
The part almost nobody knows: these withdraw functions have NO access control.

They take the beneficiary as an argument and pay THAT address. Anyone can pay the gas to deliver a stranger's forgotten money — and nobody can redirect a cent. The destination is in the contract.

---

**4/**
Why does it sit there? Partly, people don't know it's owed to them.

But when someone could deliver it, they rarely do. I traced every V2 withdrawal on Ethereum: 86% are people taking their own money. Only 14% is moving a stranger's.

Nobody's paid to — so almost nobody does.

---

**5/**
Found while replaying 6.36M blocks of Warehouse history:

— 612 ETH hidden under a pseudo-token most queries miss
— an address the data values at $507,097… which holds $364 today
— exactly 12,056,537 AZTEC, matching claims to the token

Snapshots lie. Chains don't.

---

**6/**
I proved it with real money, twice — delivered to strangers who never asked:

• Base: $44.89 of ETH. My cost: $0.00067
https://basescan.org/tx/0xd7c45f12de88330ad0ca4c84dbbddf160b668a81c4ed932195bcbe440e5acd47

• Ethereum: 262.5 AZTEC ($3.66). Cost: $0.098
https://etherscan.io/tx/0x5ab31a1b0b8a1001f4db60b3ffcb9af33abb59b8b1e397974918f4aa284bfe6e

Both txs carry ZERO value.

---

**7/**
"You have unclaimed funds" is the oldest scam line in crypto. So the site is built to be distrusted:

— no token approval, ever
— no signature except the withdrawal itself
— one unminified HTML file, zero dependencies
— CSP pins scripts by hash, network locked to 6 public RPCs

---

**8/**
You don't even need the site. The README opens with the four contracts so you can call withdraw() straight from Etherscan:

https://github.com/BacBacta/unclaimed-onchain

Search any address, no wallet needed — balances are re-read live from the contracts on every lookup:

https://unclaimed-onchain.xyz

---

**9/**
28,088 addresses are in the index down to $0.50 — and the live scan checks 162 protocol-token pairs on every search, so even amounts below that still show up.

Maybe one of them is yours. Maybe it belongs to someone you know.

Either way, the money is just sitting there.
