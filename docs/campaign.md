# X Ads — campaign sheet

One campaign, ~30 € total, one US day, promoting tweet 1 of the launch thread.
Field labels below match the X Ads Manager mobile form.

## Before opening the form

- [ ] The thread is posted **from the same handle as the ads account**
      (`@cyrilletsg`). You can only promote posts belonging to that account.
- [ ] Profile complete: avatar, banner, bio, website field pointing at
      `unclaimed-onchain.xyz`. Every profile click from the ad lands there, and an
      empty profile is what a scam account looks like.
- [ ] Thread pinned, images on tweets 1, 3 and 4.
- [ ] 2–3 h elapsed since posting, so the organic numbers say which tweet works.
- [ ] Billing set up.

## Screen 1 — Campagne

| Field | Value |
|---|---|
| Nom | `Launch — tweet 1 — Interactions` |
| Objectif | **Interactions** |

Check this landed: on the next screen, *Objectif d'optimisation* must read
**Engagements**, not `Impressions`, and *Payer par* must not be `Impressions
(CPM)`. If it says Impressions, the Reach objective is still selected — go back.

## Screen 2 — Groupe de publicités

### Détails

| Field | Value |
|---|---|
| Nom | `US — protocol lookalikes` |
| Budget quotidien | `USD 34.00` (≈ 30 €) |
| **Plafond de dépenses total** | `USD 34.00` — **not optional in practice.** Left empty, the daily budget is charged again every day the campaign runs. |
| Heure de début | see the schedule table below |
| Heure de fin | **set it.** `Diffuser indéfiniment` is how a €30 test becomes a €300 bill. |

The account clock is **GMT+11**, the audience is in the US. GMT+11 runs 15 hours
ahead of US Eastern, so:

| You want | Enter (GMT+11) |
|---|---|
| Mon 24 Aug, 09:00 ET | `Aug 25, 2026, 00:00` |
| Mon 24 Aug, 15:00 ET | `Aug 25, 2026, 06:00` |

A six-hour flight over US midday concentrates the whole budget where the
audience is awake. A 24-hour flight spends a third of it on a sleeping continent.

### Données démographiques

| Field | Value |
|---|---|
| Emplacements géographiques | **Remove `Vanuatu`. Add `United States`.** |
| Langues | `English` |
| Genre | Tous |
| Âge | Tous les âges |
| Système d'exploitation | Optimiser la diffusion sur tous les appareils |

`Vanuatu` is the account's default country and it is the cause of the
*"Your audience is too small"* warning. It is also absent from X's list of
countries where financial content may be advertised at all — the US is on it.

### Diffusion et emplacements

| Field | Value |
|---|---|
| Stratégie d'enchère | **Enchère automatique** |
| Emplacements | Choisir des emplacements spécifiques → **home timeline only** |

### Ciblage avancé

| Field | Value |
|---|---|
| Optimiser le ciblage | **off** |
| Centres d'intérêt | leave empty |
| Mots-clés | leave empty |
| Profils similaires aux abonnés | `@ourzora` `@0xSplits` `@clanker_world` `@base` `@jessepollak` |
| Retarget people who saw… | unchecked |

**Use one lever only.** X combines advanced-targeting criteria with OR, not AND:
adding keywords or interests next to the look-alikes does not narrow the
audience, it unions them and dilutes the test. Follower look-alikes of the four
protocol accounts is the sharpest of the three.

## Screen 3 — Publication

Tap **`+ Utiliser une publication existante`** and select organic tweet 1.

Do not fill the `Texte de la publication` box. A post composed here ships as a
standalone ad without tweets 2–5 — you would pay for the hook without the proof
that follows it, which is the one thing that makes the hook credible.

Leave `Fabriqué avec l'IA` unchecked: the visual is a rendered HTML page, not
generated imagery.

## Screen 4 — Vérifier

Objective **Interactions** · budget **34 USD** · total cap **34 USD** · geo
**United States** · end time **set** · post is **tweet 1 with its image**.

## What this campaign can and cannot measure

Tweet 1 carries no URL, so **X will report no link clicks** — the only tweet that
links to the site is tweet 5, and tweet 5 must never be promoted (see below).
The site has no analytics either: no backend, and a CSP of `default-src 'none'`.

So this measures **attention, not traffic**: impressions, engagement rate,
profile clicks, and the tone of the replies. At 30 € that is the right thing to
measure — reading a traffic number reliably costs more than 30 €.

## Ad policy

X's financial-services policy lists *"smart contracts and educational content
around blockchain technology, cryptocurrency, or DeFI"* as **permitted without
licensing requirements**. That is this campaign's category.

The restricted category next to it — exchanges, wallets, staking, lending, DEXs,
**DApps** — is the one a reviewer might mistakenly reach for. Two rules:

- **Never promote tweet 5.** "You have unclaimed funds" is the exact phrasing the
  Deceptive and Fraudulent Content policy exists to catch, even when quoted in
  order to warn against it. It works inside a thread; it does not work alone.
- If rejected under Financial services, request advertiser certification at
  <https://ads.twitter.com/en/help?ref=BTC> and state the three facts that put
  the site outside the regulated category: it custodies nothing, sells nothing,
  takes no fee.

## Record after the flight

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
landed. Only the second is worth scaling.
