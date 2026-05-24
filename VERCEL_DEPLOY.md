# Vercel Deployment

## Build and Output Settings

Use these values on Vercel:

```txt
Framework Preset: Other
Build Command: npm run build
Output Directory: leave empty
Install Command: npm install
```

The project now includes a safe `build` script so Vercel will not fail with `Missing script: build`.

## Environment Variables

Add these variables in Vercel > Settings > Environment Variables:

```env
BOOTSTRAP_ADMIN_NAME=Elsyed
BOOTSTRAP_ADMIN_EMAIL=elsyednegm@gmail.com
BOOTSTRAP_ADMIN_PASSWORD=123456
APP_SECRET=change_this_to_a_long_random_secret
STORE_KEY=whatsapp_bot_dashboard_store
STORE_DIR=./data
PORT=3000
VERCEL=1
WHATSAPP_ACCESS_TOKEN=YOUR_META_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID=1180262905159875
WHATSAPP_BUSINESS_ACCOUNT_ID=2470625576733746
WHATSAPP_VERIFY_TOKEN=my_verify_token
WHATSAPP_GRAPH_VERSION=v25.0
PUBLIC_BASE_URL=https://bot-dashboard-gmua.vercel.app
```

## Meta Webhook

Callback URL:

```txt
https://bot-dashboard-gmua.vercel.app/api/webhook
```

Verify Token:

```txt
my_verify_token
```

Subscribe to:

```txt
messages
```

## Widget install code

Open the dashboard, go to install code, or use:

```html
<script src="https://bot-dashboard-gmua.vercel.app/widget.js?key=YOUR_WIDGET_SITE_KEY" defer></script>
```
