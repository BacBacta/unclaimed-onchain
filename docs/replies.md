# Replies to post under protocol announcements

Free distribution, and better targeted than any ad: the people who own the
unwithdrawn balances already follow these accounts.

## Rules that decide whether this works or gets you blocked

- **Lead with a number about *their* protocol, never with a link.** A cold reply
  carrying a URL is suppressed by X and read as spam by humans. The link goes in
  a follow-up, only if someone asks.
- **Reply within the first ~30 minutes** of an announcement. After that the
  thread is dead and nobody scrolls.
- **Never blame the protocol.** Pull-based rewards are a deliberate design, not a
  bug. A reply that reads as an attack gets you blocked by the account whose
  audience you need.
- **One reply per announcement, and never the same text twice.** Repeated copy
  across replies is exactly what X's spam heuristics look for.
- Have the launch thread pinned before you start — every profile click lands there.

All figures below are from the embedded snapshot, 21–22 August 2026, counting
positions above $0.50.

---

## Zora — under a general announcement

```
Small data point from indexing Zora Protocol Rewards on Base: 14,001 addresses still hold a credited balance they never withdrew. 173 of them are over $100, the largest is $23.8k.

Not a bug — rewards are pull-based. Nobody presses the button.
```

## Zora — under a creator-earnings post

```
Worth knowing if you've earned on Zora: rewards accrue inside 0x7777777F…DBA8B and stay there until withdrawFor() is called.

I indexed it on Base — $204k unwithdrawn across 14,001 creators. Median is $1, but 26 addresses are over $1,000.
```

## Clanker — under a general announcement

```
Indexed the Clanker fee locker on Base this week: $970k in fees credited to 8,858 addresses, never claimed.

1,282 of those are over $100. 197 are over $1,000.

claim() is permissionless — it pays the fee owner, whoever sends it.
```

## Clanker — under a deployer / creator post

```
If you deployed a token with Clanker, the fees don't auto-send — they sit in the locker until claim(feeOwner, token) runs.

8,858 addresses have a balance there right now. $970k total, largest single one $39.7k. Worth checking yours on Basescan.
```

## Splits — under anything from 0xSplits

```
Splits is the largest of the four I indexed: $6.6M credited and never withdrawn across V1 and V2, most of it on Ethereum.

Same reason every time — withdraw() is a separate transaction someone has to pay for, and the balance is safe sitting there.
```

---

## When someone calls it a scam

Expect this, and treat it as the most valuable reply you'll get: answering it
well converts the whole audience reading along.

```
Fair reflex — that sentence is a scam line 99% of the time.

So don't use my site. The four contract addresses are in the README, call withdraw() yourself from Etherscan. The page never asks for an approval, or any signature other than the withdrawal.
github.com/BacBacta/unclaimed-onchain
```

## When someone asks what you get out of it

```
Nothing, and structurally so. The withdraw functions pay the beneficiary named in the argument — the page cannot route a cent to me even if I wanted it to.

There's a tip button, and it only appears after you've already withdrawn something.
```

## When someone asks whether it drains wallets

```
It can't, and you don't have to trust me on it: the only transaction the page ever builds is the protocol's own withdraw call, with your address as the argument.

No token approval, no signature request, no connect needed to search.
```
