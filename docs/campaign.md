# X Ads — campaign sheet

One €30 campaign, one day, promoting tweet 1 of the launch thread. Every value
below is meant to be typed straight into X Ads Manager.

## Before opening the form

- [ ] Billing set up on the ads account (card + billing country).
- [ ] Profile complete on the posting account: avatar, banner, bio, website
      field pointing at `unclaimed-onchain.xyz`. Every profile click from the ad
      lands there, and an empty profile is what a scam account looks like.
- [ ] The five tweets posted organically, images on 1, 3 and 4.
- [ ] Thread pinned to the profile.
- [ ] 2–3 h elapsed since posting, so the organic numbers say which tweet works.

## Step 1 — Campaign

| Field | Value |
|---|---|
| Name | `Launch — tweet 1 — Engagement` |
| Objective | **Engagement** (`Interactions`) |
| Daily budget | `30 €` |
| Total budget | `30 €` |
| Start | today |
| End | **+24 h — set it explicitly.** Without an end date the campaign keeps running. |

## Step 2 — Ad group

| Field | Value |
|---|---|
| Name | `US — protocol lookalikes` |
| Bid | **Automatic** — no history to bid better than the auction |
| Optimisation | Engagements |
| Location | **United States only** |
| Language | English |
| Age / gender | leave at default |
| Devices | all |
| Placements | **Home timeline only** — untick profiles and search |

**Follower look-alikes** (the field autocompletes and shows follower counts —
pick what it confirms):

```
@ourzora  @zora  @0xSplits  @clanker_world  @base  @jessepollak
```

**Keywords:**

```
creator rewards, protocol rewards, splits, clanker, zora rewards, unclaimed, withdraw fees
```

## Step 3 — Post

Select the **existing organic tweet 1**. Do not compose a new post in the ads
interface — a post created there ships without tweets 2–5, so you would be
paying for the hook without the proof that follows it.

Check the image is attached before moving on.

## Step 4 — Review

Confirm, in order: objective is Engagement, budget is 30 €, geography is US, the
end date is set, and the selected post is tweet 1 with its image.

## What this campaign can and cannot measure

Tweet 1 carries no URL, so **X will report no link clicks** — the only tweet that
links to the site is tweet 5, and tweet 5 must never be promoted (see below).
The site has no analytics either: no backend, and a CSP of `default-src 'none'`.

So this campaign measures **attention, not traffic**: impressions, engagement
rate, profile clicks, detail expands, and the tone of the replies. That is the
right thing to measure at €30 — traffic costs more than €30 to read reliably.

## Ad policy

X's financial-services policy lists *"smart contracts and educational content
around blockchain technology, cryptocurrency, or DeFI"* as **permitted without
licensing requirements**. That is the category this campaign falls in.

The restricted category next to it — exchanges, wallets, staking, lending, DEXs,
**DApps** — is the one a reviewer might mistakenly reach for. Two rules keep the
ad on the right side of that line:

- **Never promote tweet 5.** "You have unclaimed funds" is the exact phrasing the
  Deceptive and Fraudulent Content policy exists to catch, even when it is quoted
  in order to warn against it. It works inside a thread; it does not work alone.
- If the ad is rejected under Financial services, request advertiser
  certification at <https://ads.twitter.com/en/help?ref=BTC> and state the three
  facts that put the site outside the regulated category: it custodies nothing,
  sells nothing, and takes no fee.

## Record after 24 h

| Metric | Result |
|---|---|
| Impressions | |
| Engagement rate | |
| Cost per engagement | |
| Profile clicks | |
| Replies — curious vs hostile | |
| New followers | |

The number that decides whether to spend more is not impressions, it is the
**reply-to-like ratio**. Likes mean the post looked good. Replies mean the idea
landed. Only the second one is worth scaling.
