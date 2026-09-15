# Reelify Complete Setup

## Run locally

```powershell
cd C:\Users\rajat\reelify-shoppable-video
npm install
npx prisma generate
npx prisma migrate deploy
shopify app dev
```

Do not run `shopify app deploy` until storefront and billing are tested.

## Features in this build

- Video Library with Shopify staged video uploads
- Processed MP4 source resolution using stored Shopify Video file IDs
- Product linking
- Playlists with ordering and multiple playlist assignment
- Video Pages
- Customise Design presets: Classic, Editorial, Commerce, Social
- Storefront desktop/tablet/mobile responsive Reel slider
- Desktop drag + arrows; mobile touch swipe
- Volume, autoplay and loop controls
- Shopify Ajax Cart Add to Cart with cart drawer/notification detection
- Storefront analytics events and admin analytics page
- Settings and Help pages
- Billing page with Reelify Pro at $4 USD every 30 days

## Billing

The app uses Shopify's `appSubscriptionCreate` mutation for the in-app $4/month subscription UI. Shopify returns a confirmation URL and the merchant approves the charge before it becomes active.

Development defaults to test billing (`BILLING_TEST_MODE=true`). For production, set `BILLING_TEST_MODE=false` and configure the $4/month public app pricing in Shopify App Pricing/Partner Dashboard before launch.

## Playlists on storefront

1. Open Reelify → Playlists.
2. Create a playlist and add Reels.
3. Copy the playlist ID shown on the playlist page.
4. In Theme Editor, open Reelify Reels block.
5. Paste the Playlist ID into `Playlist ID (optional)`.
6. Save the theme.

Leave Playlist ID blank to show all active Reels.
