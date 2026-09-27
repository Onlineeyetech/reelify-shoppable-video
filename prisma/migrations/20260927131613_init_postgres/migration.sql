-- CreateEnum
CREATE TYPE "ReelStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reel" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "shopifyFileId" TEXT,
    "status" "ReelStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReelProduct" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReelProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistReel" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaylistReel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoPage" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "playlistId" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoPageReel" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoPageReel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignPreset" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "configJson" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "reelId" TEXT,
    "playlistId" TEXT,
    "type" TEXT NOT NULL,
    "sessionKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reel_shop_idx" ON "Reel"("shop");

-- CreateIndex
CREATE INDEX "Reel_status_idx" ON "Reel"("status");

-- CreateIndex
CREATE INDEX "Reel_shopifyFileId_idx" ON "Reel"("shopifyFileId");

-- CreateIndex
CREATE INDEX "ReelProduct_productId_idx" ON "ReelProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ReelProduct_reelId_productId_key" ON "ReelProduct"("reelId", "productId");

-- CreateIndex
CREATE INDEX "Playlist_shop_idx" ON "Playlist"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Playlist_shop_slug_key" ON "Playlist"("shop", "slug");

-- CreateIndex
CREATE INDEX "PlaylistReel_playlistId_position_idx" ON "PlaylistReel"("playlistId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistReel_playlistId_reelId_key" ON "PlaylistReel"("playlistId", "reelId");

-- CreateIndex
CREATE INDEX "VideoPage_shop_idx" ON "VideoPage"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "VideoPage_shop_slug_key" ON "VideoPage"("shop", "slug");

-- CreateIndex
CREATE INDEX "VideoPageReel_pageId_position_idx" ON "VideoPageReel"("pageId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "VideoPageReel_pageId_reelId_key" ON "VideoPageReel"("pageId", "reelId");

-- CreateIndex
CREATE INDEX "DesignPreset_shop_idx" ON "DesignPreset"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "DesignPreset_shop_key_key" ON "DesignPreset"("shop", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_shop_key_key" ON "AppSetting"("shop", "key");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_shop_createdAt_idx" ON "AnalyticsEvent"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_shop_type_idx" ON "AnalyticsEvent"("shop", "type");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_reelId_type_idx" ON "AnalyticsEvent"("reelId", "type");

-- AddForeignKey
ALTER TABLE "ReelProduct" ADD CONSTRAINT "ReelProduct_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistReel" ADD CONSTRAINT "PlaylistReel_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistReel" ADD CONSTRAINT "PlaylistReel_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoPage" ADD CONSTRAINT "VideoPage_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoPageReel" ADD CONSTRAINT "VideoPageReel_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "VideoPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoPageReel" ADD CONSTRAINT "VideoPageReel_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
