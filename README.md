# I11 PG — Washing Machine Booking App (Free, PWA)

You'll do 3 things: (1) set up the Google Sheet + backend, (2) put in one link,
(3) put the website files online for free. Takes about 15 minutes. Just follow in order.

---

## PART 1 — Google Sheet + Apps Script (the "database" and brain)

1. Go to https://sheets.google.com and create a **new blank spreadsheet**.
   Name it anything, e.g. "I11 PG Washing Machine".
2. Click **Extensions → Apps Script**.
3. Delete everything in the editor box, and paste the entire contents of **Code.gs** (the file I gave you).
4. Click the **Save** icon (disk icon) at the top.
5. Click **Deploy → New deployment**.
6. Click the gear icon ⚙️ next to "Select type" → choose **Web app**.
7. Fill in:
   - Description: `washing machine api`
   - Execute as: **Me**
   - Who has access: **Anyone**
8. Click **Deploy**.
9. It will ask you to **Authorize access** — click through with your Google account (click "Advanced" → "Go to project (unsafe)" if Google warns you, this is normal for your own script).
10. After deploying, you'll get a **Web app URL** that looks like:
    `https://script.google.com/macros/s/AKfycb.../exec`
    **Copy this URL.** This is your app's backend link.

That's it — the sheet will now auto-create a "Bookings" tab and manage everything by itself.

---

## PART 2 — Connect the frontend to your backend

1. Open the file **app.js**.
2. Find this line near the top:
   ```
   const APPS_SCRIPT_URL = "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";
   ```
3. Replace the text inside the quotes with the URL you copied in Part 1, step 10.
   Save the file.

---

## PART 3 — Put the website online for FREE (GitHub Pages)

This gives you a real installable app link, ₹0 cost, no domain needed.

1. Go to https://github.com and create a free account (if you don't have one).
2. Click **+ → New repository**. Name it e.g. `i11-washing`. Make it **Public**. Create it.
3. Click **Add file → Upload files**, and upload all these files together:
   - `index.html`
   - `app.js`
   - `style.css`
   - `manifest.json`
   - `sw.js`
   - `icon-192.png`
   - `icon-512.png`
4. Click **Commit changes**.
5. Go to the repo's **Settings → Pages** (left sidebar).
6. Under "Branch", select `main` and folder `/ (root)`, click **Save**.
7. Wait 1–2 minutes. Your site will be live at:
   `https://YOUR-USERNAME.github.io/i11-washing/`

**Share that link in your PG's WhatsApp group.** Anyone who opens it on their phone can tap
"Add to Home Screen" (Chrome: ⋮ menu → Add to Home Screen) and it behaves like a real app icon.

---

## How it works for your residents

- They open the app, see both machines: **FREE** or **IN USE by <name> until <time>**.
- They tap **Book Now / Join Queue**, enter name + room + how long they need it.
- If the machine is free, their turn starts immediately. If someone's using it, they're
  automatically placed in the queue after the last booked person — no clash, no argument.
- "My Bookings" at the bottom lets them **cancel** or **mark done early** (so the next
  person doesn't have to wait the full time if they finish early).
- The screen auto-refreshes every 15 seconds.

## Cost
₹0. GitHub Pages and Google Apps Script are both free forever for this kind of use.
If later you want a nicer custom domain (like `i11pg.in`) that costs about ₹500–800/year —
completely optional, the app works fine without it.

## Small limitations to know (can improve later)
- No login/password — anyone with the link can book (fine for a trusted PG group).
- Cancelling relies on the browser remembering "my bookings" (localStorage) — if someone
  clears their browser data they'd lose the ability to self-cancel (an admin can still
  cancel manually by editing the Google Sheet directly).
- Max 4 people can queue per machine at once, and max booking length is 3 hours —
  both easy to change in Code.gs if needed.
