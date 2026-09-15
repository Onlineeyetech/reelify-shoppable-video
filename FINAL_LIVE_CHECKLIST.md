# Reelify Final Live Checklist

## Before replacing the project
- Back up the existing `prisma/dev.sqlite` if you need the current development Reels/session data.
- This final ZIP intentionally does **not** contain `prisma/dev.sqlite` because the database can contain Shopify OAuth access tokens.
- If you keep the existing local DB, copy your backed-up `dev.sqlite` into `prisma/` after extracting this project.

## Local verification
```powershell
npm install
npx prisma generate
npx prisma migrate deploy
shopify app dev
```

Test: upload/processing, Play, volume, Add to Cart, cart drawer/notification, desktop drag/arrows, tablet 3-card layout, mobile 1/2-card layout, Playlists, Selected Reels, Video Pages, Designs, Analytics, Billing.

## Production
`shopify app deploy` releases Shopify app configuration/extensions; it does not host the web app. The app server must be deployed to a real HTTPS hosting provider first. Set `SHOPIFY_APP_URL` to that production URL, configure production `application_url` and auth redirects, run migrations against a persistent production database, and set `BILLING_TEST_MODE=false` only when you are ready for real billing.
