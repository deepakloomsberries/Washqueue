# I11 PG — Laundry (Free, installable web app)

A live-status, queueing **and** scheduling app for the washing machines — plus an
Admin tab so you can add machines later and mark one as "under maintenance."
Still ₹0 to run, still just Google Sheets + GitHub Pages.

**If you're setting this up for the first time**, do Parts 1–3 in order (about
15 minutes). **If you already deployed an earlier version of this app**, read
the callout at the end of Part 1 before you paste the new `Code.gs` in.

---

## What's in this version

- **Home** — same as before: see each machine's status at a glance and book it.
- **Add time** — running late? On your own in-use machine, tap **Add time** to
  extend the finish time by a few minutes (default: up to 20 min at a time,
  twice per booking). It won't let you overrun the next person's booking.
- **"Someone's using it?"** — arrived to find a machine already running with no
  booking? Report it (or pick it as the reason when you cancel your own booking)
  and enter the time left showing on the machine. It shows as **in use by
  someone (not booked)** so nobody books it by mistake — and anyone actually
  using it can tap **This is me** to put their name on it.
- **Calendar** — a real day-by-day timeline of every machine. Tap any open slot
  to schedule that machine for later instead of joining the queue.
- **Upcoming** — a simple list of everything coming up, with an "All / Mine" filter.
- **Admin tab** — enter a PIN to:
  - Add new machines whenever you buy one.
  - Put a machine under maintenance (residents immediately see it's unavailable,
    and anything already booked on it is cancelled automatically).
  - Retire a machine for good, or bring one back.
  - Change booking rules: max/min booking length, how many can queue at once,
    how many days ahead people can schedule, how many times / how long a booking
    can be extended, optional quiet hours, and the Admin PIN itself.
- Still installable to a phone's home screen, still auto-refreshes, still free.

---

## PART 1 — Google Sheet + Apps Script (the "database" and brain)

1. Go to https://sheets.google.com and create a **new blank spreadsheet**
   (or open the one you already made for this app).
2. Click **Extensions → Apps Script**.
3. Delete everything in the editor box, and paste the entire contents of
   **Code.gs** (the file included here).
4. Click the **Save** icon (disk icon) at the top.
5. Click **Deploy → New deployment**.
6. Click the gear icon ⚙️ next to "Select type" → choose **Web app**.
7. Fill in:
   - Description: `washing machine api`
   - Execute as: **Me**
   - Who has access: **Anyone**
8. Click **Deploy**, then **Authorize access** with your Google account
   (click "Advanced" → "Go to project (unsafe)" if Google warns you —
   normal for your own script).
9. Copy the **Web app URL** — looks like `https://script.google.com/macros/s/AKfycb.../exec`.

The first time anyone opens the app, it will auto-create three tabs in your
sheet: **Bookings**, **Machines** (seeded with "Washing Machine 1" and
"Washing Machine 2"), and **Settings** (seeded with sensible defaults,
including the starting Admin PIN — see below). You don't need to touch these
yourself, but they're plain Google Sheet tabs, so you always can.

**The Admin PIN starts as `1234`.** Open the site, go to the **Admin** tab,
unlock with `1234`, and change it under Settings before you share the link
— see Part 3.

> **Upgrading from an earlier version of this app?** The Bookings sheet's
> columns changed (machines are now tracked by an ID, and there's a new Mode
> column). If your existing spreadsheet already has a **Bookings** tab from
> before, delete that one tab first (right-click its tab at the bottom →
> Delete) and let the new Code.gs recreate it. Your Machines/Settings tabs
> will be created fresh alongside it. This only affects historical bookings —
> nothing else in your sheet is touched.
>
> **Adding the "add time" and "report in use" features to an existing sheet?**
> No action needed — the new `Extensions` and `Reason` columns are added to
> your Bookings tab automatically the first time the updated backend writes to
> it. Existing rows keep working.

---

## PART 2 — Connect the frontend to your backend

1. Open **app.js**.
2. Find this line near the top:
   ```
   const APPS_SCRIPT_URL = "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";
   ```
3. Replace the text inside the quotes with the URL from Part 1, step 9. Save.

---

## PART 3 — Put the website online for FREE (GitHub Pages)

1. Go to https://github.com and create a free account (if you don't have one).
2. **New repo:** Click **+ → New repository**, name it (e.g. `i11-washing`),
   make it **Public**, and create it.
   **Existing repo (updating):** open your existing repo instead.
3. Click **Add file → Upload files**, and upload all of these together:
   - `index.html`, `app.js`, `style.css`, `manifest.json`, `sw.js`,
     `icon-192.png`, `icon-512.png`
   — if you're updating an existing repo, this will overwrite the old versions.
4. Click **Commit changes**.
5. **First time only:** go to **Settings → Pages**, set Branch to `main` /
   folder `/ (root)`, and Save. Wait 1–2 minutes for the first build.
6. Visit `https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/`.
   - If you had the old version open already (especially if you or a resident
     "Added to Home Screen"), do one hard refresh — close the tab and reopen
     it, or reload twice. The app updates itself in the background after that
     and you won't need to do this again.

**Share that link in your PG's WhatsApp group.** Anyone who opens it on their
phone can tap "Add to Home Screen" and it behaves like a real app icon.

---

## How it works for your residents

- **Home** shows every machine: **Free**, **In use by \<name\> until \<time\>**,
  or **Under maintenance**.
- **Book now / Join queue** — if the machine's free, their turn starts right
  away. If it's busy, they're queued automatically after whoever's ahead of
  them.
- **Schedule for later** (in the same booking screen, or by tapping an open
  slot on the **Calendar** tab) — pick a future date and time instead. The
  app won't let two bookings overlap on the same machine.
- **Upcoming** lists everything coming up on every machine; switch to "Mine"
  to see just their own.
- **Mark done early / Cancel** on their own bookings works the same as before
  (remembered in the browser, same as "My Bookings" did previously).
- The screen refreshes automatically roughly every 20 seconds.

## How it works for you (Admin)

- Open the **Admin** tab, enter the PIN.
- **Machines:** rename one, add a note, set it to **Maintenance** (cancels
  its upcoming bookings and shows residents it's unavailable), **Retire** one
  for good, or bring one back with **Reactivate**. Add new ones any time with
  the box at the bottom.
- **Settings:** change booking length limits, queue size, how far ahead
  people can schedule, optional quiet hours (e.g. no new bookings 10pm–7am),
  and the PIN itself.
- From the **Upcoming** tab, once you're unlocked as Admin, you can also
  cancel *anyone's* booking (not just your own) — handy for sorting out
  disputes or a booking someone forgot to cancel.

## Cost

₹0. GitHub Pages and Google Apps Script are both free for this kind of use.
A custom domain is optional (~₹500–800/year) and never required.

## Small limitations to know (by design, to keep this free and simple)

- Residents still don't need an account — anyone with the link can book,
  same trust-based model as before.
- The Admin PIN is a simple shared gate, not a full login system — good
  enough for keeping casual visitors out of Settings, not bank-grade security.
  Change it from the default, and don't reuse a PIN you use elsewhere.
- "My Bookings" and "stay logged in as Admin" both rely on the browser
  remembering things (localStorage) — clearing browser data loses that,
  though an Admin can still cancel any booking from the Upcoming tab, or by
  editing the Google Sheet directly.
- Default limits (changeable in Admin → Settings): 3-hour max booking,
  10-minute minimum, 6 queued per machine, schedule up to 7 days ahead.
