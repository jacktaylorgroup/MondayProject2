# Setting Up the monday.com + SendGrid Integration — New User Guide

This walks a new user through setting up the "Send a SendGrid template email" automation
from zero, using the server in `MondayProject2` (https://github.com/shivendraupstream/MondayProject2).

It assumes no prior context: you have a monday.com account, a SendGrid account, and access to
deploy a Node server (Render is what this project already uses).

---

## What you're setting up

An automation recipe inside monday's Workflow Builder that reads:

> When [trigger happens] on this board, send a SendGrid template email to [recipient],
> using [template], with [these variables mapped from item columns].

This requires three things to exist and be wired together:
1. A monday.com custom app (created once, in the Developer Center)
2. This server, deployed somewhere public (Render)
3. A SendGrid account with at least one dynamic template

---

## Step 1: Get the server running somewhere public

You need the server live before monday can be configured to call it, since the Developer
Center asks for real URLs, not localhost.

1. Clone the repo:
   ```
   git clone https://github.com/shivendraupstream/MondayProject2.git
   cd MondayProject2
   npm install
   ```
2. Deploy to Render as a Node Web Service:
   - Build command: `npm install`
   - Start command: `node server.js`
   - Don't set environment variables yet, you don't have the values until Step 2.
3. Note the Render URL you're given, e.g. `https://mondayproject2.onrender.com`. You'll
   reference it as `<YOUR_RENDER_URL>` below.

---

## Step 2: Create the monday.com app

1. In monday, go to your profile picture (bottom left) → **Developers** → **Build an app** →
   **Create app**.
2. Give it a name (e.g. "SendGrid Template Email").
3. Open **Basic Details** in the left sidebar. You need two values from this page later:
   - **Signing Secret** — NOT the Client Secret, they look similar but are different values.
   - **App ID** — the numeric ID shown on this page.
4. Add a **Feature** → **Automations** → **Action** (a new custom action block).
5. Configure the action block's fields to match what the recipe needs: a SendGrid template
   selector, a recipient field, and a variable-mapping field. (This project uses a single JSON
   text field for variables rather than a dynamic mapping field, see "Known limitation" below.)
6. Mark the action block as **Async**. This matters, see "Why async" below, skipping this step
   is the most common way this integration breaks silently.
7. Set the block's **Execution URL** to:
   ```
   <YOUR_RENDER_URL>/sendgrid/send-template-email
   ```
8. If you're using the dropdown template selector, set its options URL to:
   ```
   <YOUR_RENDER_URL>/sendgrid/templates/options
   ```

---

## Step 3: Set environment variables on Render

Go back to Render, open your service's **Environment** tab, and set:

| Variable | Where to get it |
|---|---|
| `MONDAY_SIGNING_SECRET` | Developer Center → Basic Details → Signing Secret |
| `MONDAY_APP_ID` | Developer Center → Basic Details → App ID |
| `SENDGRID_FROM_ADDRESS` | An email address verified as a sender in your SendGrid account |
| `DEV_BYPASS_AUTH` | Leave unset or `false`. Only ever `true` for local testing, never in production. |
| `PORT` | Leave unset, Render sets this automatically |

After saving, **trigger a manual redeploy**. Render does not always reload a running
instance's environment on a settings-only save.

---

## Step 4: Connect SendGrid in monday

1. In your monday account, add a **Credential** connection for SendGrid (this is how monday
   securely passes your SendGrid API key to the server per-request, it isn't stored as a
   Render environment variable).
2. Generate a SendGrid API key with at least "Mail Send" and "Template Engine" (read) scopes,
   from SendGrid → Settings → API Keys.
3. Connect that key when prompted while building or running the recipe.

---

## Step 5: Build the recipe in Workflow Builder

1. Go to the board you want this automation on → **Automations** → **Custom** (or search for
   your app's action block by name).
2. Choose your trigger (e.g. status changes, a button is clicked).
3. Add your action block, select it should connect to SendGrid when prompted (this triggers
   the Credential flow from Step 4 if not already connected).
4. Pick a template from the dropdown (populated live from your SendGrid account via
   `/sendgrid/templates/options`).
5. Fill in the recipient and the variables field, using monday's column-insertion feature to
   pull per-item values into the JSON variables field.
6. Activate the automation.

---

## Step 6: Test it

Trigger the automation on a real item. Check:
- **Render logs** — should show the request arriving and a SendGrid call being made.
- **SendGrid Activity feed** — should show the send with a real message ID.
- **monday's automation Run History** — should show "Success" within a few seconds, not stuck
  on "In progress" (see "Why async" below if it does get stuck).

If nothing arrives in the destination inbox despite a "Delivered" status in SendGrid, that's
a domain authentication / DMARC issue on the sending domain, not a bug in this server. See
SendGrid's Sender Authentication settings.

---

## Why async (background, not required reading to set this up)

The action block is configured as **async** because a normal synchronous block has to reply to
monday's original request within about 60 seconds, including the full SendGrid round trip.
Render's free tier can have slow cold starts, which occasionally pushed responses past that
window and left the automation showing "Failed" even though the email had actually sent. The
async pattern replies immediately to acknowledge receipt, then reports the real result
afterward via a signed callback to monday, removing that race condition entirely.

**The one gotcha that costs the most time:** the callback JWT's `appId` must be signed as a
JavaScript **number**, not a string. `process.env.MONDAY_APP_ID` is always a string, so it must
be wrapped in `Number(...)` before signing. Signed as a string, monday's gateway rejects it
with an empty `401` and no explanation, this was the single hardest bug to track down while
building this, and if a new setup gets stuck on "In progress" forever, check this first.

---

## Known limitation

The dynamic per-template variable mapping (`/sendgrid/mapping-schema`) is implemented and
responds correctly when called directly (via curl/Postman), but has not been confirmed to
work when monday's recipe builder calls it live to render mapping fields in the UI. The
current working setup uses a single JSON text field for variables instead, which is proven
working end-to-end. Don't spend time debugging the dynamic mapping route as if it's expected
to work in the builder yet, treat the JSON field as the supported path until this is resolved.

---

## Quick troubleshooting checklist

- **Automation stuck on "In progress"**: check the async setup (Step 2.6) and the `Number()`
  cast on `appId` (see "Why async").
- **401 with no detail on the callback**: same as above, almost always the `appId` string/number
  issue.
- **"Delivered" in SendGrid but email never arrives**: sending domain isn't authenticated
  (SPF/DKIM) or DMARC is rejecting it silently after acceptance, not a server bug.
- **Templates dropdown is empty**: confirm the SendGrid API key connected via monday's
  Credential feature has Template Engine read access.
- **Recipe builder shows no mapping fields**: expected, see "Known limitation" above, use the
  JSON variables field instead.