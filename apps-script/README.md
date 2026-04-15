# Apps Script backend — setup

Source of truth for the Google Apps Script that powers the beta signup endpoint.
Whenever `Code.gs` changes, paste it into the Apps Script project and redeploy
("Manage deployments → Edit → New version"). The Web App URL stays the same.

## One-time setup

### 1. Script Properties

In Apps Script: **Project Settings → Script Properties → Add property**

| Key              | Value                                                      |
| ---------------- | ---------------------------------------------------------- |
| `SHEET_ID`       | `1K_U3MpKh-PM_bQX8-jNFBOGf95Y-KhxzRYR15gjOyWk`             |
| `RESEND_API_KEY` | `re_...` (from [resend.com](https://resend.com) dashboard) |

If `RESEND_API_KEY` is not set, signups still work but no welcome email is sent.

### 2. Resend

1. Sign up at https://resend.com (no card required for free tier: 3000/mo, 100/day).
2. **Domains → Add Domain** → `0dopamine.com`.
3. Resend shows 3 DNS records to add (1 SPF-style TXT, 1 DKIM CNAME, 1 DMARC TXT).
   Copy them into Route 53 (hosted zone for `0dopamine.com`) as-is.
4. Wait for Resend to mark the domain as "Verified" (usually 5–30 min).
5. **API Keys → Create** → scope "Sending access" → copy the key into
   Apps Script Script Properties as `RESEND_API_KEY`.

### 3. ImprovMX (receive mail forwarded to Gmail)

1. Sign up at https://improvmx.com (free, no card).
2. **Add domain** → `0dopamine.com`.
3. ImprovMX shows 2 MX records to add. Copy them into Route 53.
4. **Add alias** → `hola` → destination `imcaletrio@gmail.com`.
5. Wait for verification (~5 min).

### 4. Gmail "Send as" (so replies from Gmail keep the 0dopamine.com address)

Optional but recommended:

1. Gmail → Settings → Accounts → "Send mail as" → **Add another email**.
2. Name: `0Dopamine`, email: `hola@0dopamine.com`. Uncheck "Treat as alias".
3. SMTP server: `smtp.resend.com`, port: `465` (SSL), username: `resend`,
   password: your Resend API key.
4. Gmail sends a verification code to `hola@0dopamine.com`, ImprovMX forwards
   it, you paste it back. Done.

## Deploy

1. Paste `Code.gs` into the Apps Script editor (replace all).
2. **Deploy → Manage deployments → Edit (pencil icon) → Version: New version → Deploy**.
3. The web app URL does not change — `index.html` and `install.html` keep working.

## Verify

```bash
curl -X POST 'https://script.google.com/macros/s/AKfyc.../exec' \
  -d 'email=test+verify@example.com&source=curl&lang=es'
```

Expected: an appended row in the sheet and (if `RESEND_API_KEY` is set) a
welcome email delivered to `test+verify@example.com`. Delete the test row
afterwards.
