import prisma from "../db.server";
import { authenticate } from "../shopify.server";

const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });

export const action = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ ok: false }, { status: 401 });

  try {
    const body = await request.json();
    const type = String(body?.type || "").slice(0, 40);
    if (!type) return json({ ok: false }, { status: 400 });

    const reelId = body?.reelId ? String(body.reelId) : null;
    const playlistId = body?.playlistId ? String(body.playlistId) : null;

    if (reelId) {
      const reel = await prisma.reel.findFirst({
        where: { id: reelId, shop: session.shop },
        select: { id: true },
      });
      if (!reel) return json({ ok: false }, { status: 404 });
    }

    if (playlistId) {
      const playlist = await prisma.playlist.findFirst({
        where: { id: playlistId, shop: session.shop },
        select: { id: true },
      });
      if (!playlist) return json({ ok: false }, { status: 404 });
    }

    await prisma.analyticsEvent.create({
      data: {
        shop: session.shop,
        reelId,
        playlistId,
        type,
        sessionKey: body?.sessionKey ? String(body.sessionKey).slice(0, 120) : null,
      },
    });

    return json({ ok: true });
  } catch (error) {
    console.error("PUBLIC ANALYTICS ERROR:", error);
    return json({ ok: false }, { status: 500 });
  }
};

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.public.appProxy(request);

  if (!session || !admin) {
    return json({ reels: [] }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const design = await prisma.designPreset.findFirst({ where: { shop: session.shop, isActive: true }, select: { key: true } });

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 12), 1), 24);
  const playlistId = url.searchParams.get("playlist") || null;
  const playlistSlug = url.searchParams.get("playlist_slug") || null;

  let playlist = null;
  if (playlistId || playlistSlug) {
    playlist = await prisma.playlist.findFirst({
      where: {
        shop: session.shop,
        ...(playlistId ? { id: playlistId } : { slug: playlistSlug }),
      },
      select: { id: true, name: true },
    });
  }

  let reels;
  if (playlist) {
    const playlistRows = await prisma.playlistReel.findMany({
      where: { playlistId: playlist.id, reel: { shop: session.shop, status: "ACTIVE" } },
      orderBy: { position: "asc" },
      take: limit,
      include: { reel: { include: { products: true } } },
    });
    reels = playlistRows.map((row) => row.reel);
  } else if (playlistId || playlistSlug) {
    reels = [];
  } else {
    reels = await prisma.reel.findMany({
      where: { shop: session.shop, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { products: true },
    });
  }

  const productIds = [...new Set(reels.flatMap((reel) => reel.products.map((item) => item.productId)))];
  let products = [];

  if (productIds.length) {
    const response = await admin.graphql(
      `#graphql
      query ReelProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            handle
            onlineStoreUrl
            featuredImage { url }
            variants(first: 1) { nodes { id price title } }
          }
        }
      }`,
      { variables: { ids: productIds.slice(0, 250) } },
    );
    const data = await response.json();
    products = data?.data?.nodes || [];
  }

  const productMap = new Map(products.filter(Boolean).map((product) => [product.id, product]));

  const fileIds = [...new Set(reels.map((reel) => reel.shopifyFileId).filter(Boolean))];
  const videoMap = new Map();

  if (fileIds.length) {
    const response = await admin.graphql(
      `#graphql
      query ReelVideos($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Video {
            id
            status
            fileStatus
            sources { url format mimeType width height }
            preview { image { url } }
          }
        }
      }`,
      { variables: { ids: fileIds.slice(0, 250) } },
    );
    const data = await response.json();
    for (const video of data?.data?.nodes || []) {
      if (!video?.id) continue;
      const mp4 = video.sources?.find((source) => source.format === "mp4" || source.mimeType === "video/mp4");
      videoMap.set(video.id, {
        videoUrl: mp4?.url || null,
        thumbnailUrl: video.preview?.image?.url || null,
        ready: video.status === "READY" || video.fileStatus === "READY",
      });
    }
  }

  const result = reels.map((reel) => {
    const product = productMap.get(reel.products[0]?.productId) || null;
    const variant = product?.variants?.nodes?.[0] || null;
    const liveVideo = reel.shopifyFileId ? videoMap.get(reel.shopifyFileId) : null;

    return {
      id: reel.id,
      title: reel.title,
      videoUrl: liveVideo?.videoUrl || reel.videoUrl,
      thumbnailUrl: liveVideo?.thumbnailUrl || reel.thumbnailUrl,
      product: product
        ? {
            id: product.id,
            title: product.title,
            handle: product.handle,
            url: product.onlineStoreUrl || `/products/${product.handle}`,
            image: product.featuredImage?.url || null,
            variantId: variant?.id || null,
            price: variant?.price || null,
          }
        : null,
    };
  });

  return json(
    { reels: result, playlist: playlist || null, designKey: design?.key || "classic" },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
};
