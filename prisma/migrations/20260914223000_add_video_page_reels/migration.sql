-- CreateTable
CREATE TABLE "VideoPageReel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VideoPageReel_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "VideoPage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VideoPageReel_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoPageReel_pageId_reelId_key" ON "VideoPageReel"("pageId", "reelId");

-- CreateIndex
CREATE INDEX "VideoPageReel_pageId_position_idx" ON "VideoPageReel"("pageId", "position");
