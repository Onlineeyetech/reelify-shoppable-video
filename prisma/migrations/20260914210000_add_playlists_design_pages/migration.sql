ALTER TABLE "Reel" ADD COLUMN "shopifyFileId" TEXT;

CREATE TABLE "Playlist" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "slug" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Playlist_shop_slug_key" ON "Playlist"("shop", "slug");
CREATE INDEX "Playlist_shop_idx" ON "Playlist"("shop");

CREATE TABLE "PlaylistReel" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "playlistId" TEXT NOT NULL,
  "reelId" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlaylistReel_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlaylistReel_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlaylistReel_playlistId_reelId_key" ON "PlaylistReel"("playlistId", "reelId");
CREATE INDEX "PlaylistReel_playlistId_position_idx" ON "PlaylistReel"("playlistId", "position");

CREATE TABLE "VideoPage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "playlistId" TEXT,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "VideoPage_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VideoPage_shop_slug_key" ON "VideoPage"("shop", "slug");
CREATE INDEX "VideoPage_shop_idx" ON "VideoPage"("shop");

CREATE TABLE "DesignPreset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "configJson" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "DesignPreset_shop_key_key" ON "DesignPreset"("shop", "key");
CREATE INDEX "DesignPreset_shop_idx" ON "DesignPreset"("shop");

CREATE TABLE "AppSetting" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "AppSetting_shop_key_key" ON "AppSetting"("shop", "key");

CREATE TABLE "AnalyticsEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "reelId" TEXT,
  "playlistId" TEXT,
  "type" TEXT NOT NULL,
  "sessionKey" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsEvent_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AnalyticsEvent_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AnalyticsEvent_shop_createdAt_idx" ON "AnalyticsEvent"("shop", "createdAt");
CREATE INDEX "AnalyticsEvent_shop_type_idx" ON "AnalyticsEvent"("shop", "type");
CREATE INDEX "AnalyticsEvent_reelId_type_idx" ON "AnalyticsEvent"("reelId", "type");
