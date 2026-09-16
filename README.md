# Lebombo Job Cards — field app

The companion app the technicians install on their phones to log job cards on
site. It replaces the carbon-copy book: the technician fills the card in, the
store manager signs it on the screen, and it syncs to the Lebombo platform when
the phone next finds signal.

It is a **PWA** — a web app the technicians add to their home screen. No app
store, no developer accounts, and updates reach both phones the moment this is
deployed.

## The two rules it is built around

**Job cards are numbered by the office, never by the phone.** A card written in
the field has no number at all. It gets one the instant it reaches the database,
drawn from the same sequence as invoice numbers. That is what stops the two
technicians colliding the way the two paper books did, and it is why job card
3012 bills as invoice 3012.

**Nothing needs signal except setting up.** The store list is cached on the
phone, cards are written to IndexedDB as they are typed, and the outbox retries
until the office confirms. A technician can work a whole week out of coverage.

## How it fits together

```
 lebombo-mobile (this app)                    lebombo (the platform)
 ─────────────────────────                    ──────────────────────
 IndexedDB: cards + outbox   ──── sync ───▶   /api/mobile/sync      → numbers the card
 cached store list           ◀─ bootstrap ─   /api/mobile/bootstrap
 device token                ──── once ────▶  /api/mobile/pair
                                              /job-cards            → manager reviews
                                              → Create invoice      → prefilled invoice
```

The platform owns the database. This app holds no database credentials — only a
bearer token, issued once at pairing and revocable from the platform's Settings
page if a phone is lost.

## Setting it up

### 1. The platform

Set two variables on the **lebombo** project (Vercel → Settings → Environment
Variables), not on this one:

| Variable | What it is |
| --- | --- |
| `MOBILE_ACCESS_CODE` | The code a technician types once when setting up their phone. A local one was generated into `.env`; set the same kind of value in production. |
| `MOBILE_APP_ORIGIN` | This app's origin, e.g. `https://lebombo-mobile.vercel.app`. Comma-separate to allow more than one. Without it the phones are refused by CORS. |

### 2. This app

Deploy it as its **own Vercel project** pointed at this folder, with:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_BASE` | The platform's origin, e.g. `https://lebombo.vercel.app`. No trailing slash. |

It must be served over HTTPS — service workers, and therefore offline support,
do not run on plain HTTP. Vercel gives you that automatically.

### 3. The phones

Send each technician the URL and the access code. They open it in Chrome
(Android) or Safari (iOS), choose **Add to Home Screen**, then enter their name,
sign once, and type the code. That signature is stamped on every card they log
from then on.

Pairing is the only step that needs a connection.

## Running it locally

```bash
npm install
npm run dev
```

Serves on **3100**, expecting the platform on 3000 (see `.env.local`).
`localhost:3100` is allowed by the platform's CORS in development without
setting `MOBILE_APP_ORIGIN`.

Offline behaviour only works against a production build (`npm run build && npm
run start`) — Next's dev server does not play well with service workers.

## Worth knowing

- **Drafts stay on the phone.** "Save and finish later" keeps a card local and
  unnumbered. It is not a job card until the manager has signed it, so it is not
  sent and cannot take a number. The trade-off: a draft lost with the phone is
  lost. Finished cards are safe the moment they sync.
- **Multi-day jobs** are one card with several visits. Labour bills as the sum
  of every trip.
- **A store that is not on the list** can still be typed in. The card syncs
  unmatched and the platform flags it so the manager picks the Bill To client
  when raising the invoice.
- **Sync runs** when the app opens, when the connection returns, when a card is
  finished, and on demand from the banner. Android also uses Background Sync;
  iOS has no such API, which is why opening the app is a sync trigger.
- **Revoking a phone** (platform → Settings → Technician phones) stops it
  syncing immediately but leaves the cards it already sent untouched.

## Layout

```
app/
  page.tsx          the technician's job list and sync banner
  job/page.tsx      the job card itself (/job?id=… to edit)
  setup/page.tsx    one-time pairing
  settings/page.tsx name, signature, store list, sign out
  app-chrome.tsx    service worker, connection state, sync triggers
components/
  signature-pad.tsx finger signing, cropped to the ink
  store-picker.tsx  searchable offline store list
lib/
  db.ts             IndexedDB — the only copy of unsynced work
  sync.ts           the outbox
  hours.ts          labour hours (mirrors the platform's copy)
public/sw.js        offline shell
```

Job cards are edited at `/job?id=…` rather than `/job/[id]` on purpose: it keeps
the app to four static routes, so the service worker can precache all of them
and a technician can open a card they have never opened before while offline.
