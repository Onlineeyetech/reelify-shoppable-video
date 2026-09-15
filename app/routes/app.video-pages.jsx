import { useMemo, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const [pages, playlists, reels] = await Promise.all([
    prisma.videoPage.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      include: {
        playlist: true,
        reels: { orderBy: { position: "asc" }, include: { reel: { select: { id: true, title: true, status: true } } } },
      },
    }),
    prisma.playlist.findMany({ where: { shop: session.shop }, orderBy: { name: "asc" } }),
    prisma.reel.findMany({
      where: { shop: session.shop, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, status: true },
    }),
  ]);
  return { pages, playlists, reels };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const type = String(form.get("type") || "");

  if (type === "create") {
    const title = String(form.get("title") || "").trim();
    const sourceType = String(form.get("sourceType") || "reels");
    const playlistId = sourceType === "playlist" ? (String(form.get("playlistId") || "") || null) : null;
    const reelIds = sourceType === "reels" ? [...new Set(form.getAll("reelIds").map(String).filter(Boolean))] : [];

    if (!title) return { error: "Page title is required." };
    if (sourceType === "playlist" && !playlistId) return { error: "Choose a playlist." };
    if (sourceType === "reels" && reelIds.length === 0) return { error: "Select at least one Reel." };

    if (playlistId) {
      const playlist = await prisma.playlist.findFirst({ where: { id: playlistId, shop: session.shop }, select: { id: true } });
      if (!playlist) return { error: "Selected playlist was not found." };
    }

    const validReels = reelIds.length
      ? await prisma.reel.findMany({
          where: { id: { in: reelIds }, shop: session.shop, status: "ACTIVE" },
          select: { id: true },
        })
      : [];

    if (reelIds.length && validReels.length !== reelIds.length) {
      return { error: "One or more selected Reels are no longer active." };
    }

    const slugBase = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "video-page";
    let slug = slugBase;
    let i = 2;
    while (await prisma.videoPage.findUnique({ where: { shop_slug: { shop: session.shop, slug } } })) slug = `${slugBase}-${i++}`;

    const page = await prisma.videoPage.create({
      data: {
        shop: session.shop,
        title,
        slug,
        playlistId,
        published: false,
        reels: reelIds.length
          ? { create: validReels.map((reel, index) => ({ reelId: reel.id, position: index })) }
          : undefined,
      },
    });

    return { success: true, pageId: page.id };
  }

  if (type === "toggle") {
    const id = String(form.get("id") || "");
    const page = await prisma.videoPage.findFirst({ where: { id, shop: session.shop } });
    if (!page) return { error: "Page not found." };
    await prisma.videoPage.update({ where: { id }, data: { published: !page.published } });
    return { success: true };
  }

  return { error: "Unknown action." };
};

const cardStyle = { border: "1px solid #e1e3e5", borderRadius: 16, padding: 18, background: "#fff" };

export default function VideoPages() {
  const { pages, playlists, reels } = useLoaderData();
  const fetcher = useFetcher();
  const [search, setSearch] = useState("");
  const [sourceType, setSourceType] = useState("reels");

  const filteredReels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reels;
    return reels.filter((reel) => reel.title.toLowerCase().includes(q));
  }, [reels, search]);

  return (
    <s-page heading="Video Pages" inlineSize="large">
      <s-section>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1fr) 1.4fr", gap: 18 }}>
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Create a video page</h2>
            <p style={{ color: "#6d7175", marginTop: 0 }}>
              Choose exactly which Reels this page should show, or use a playlist.
            </p>
            <fetcher.Form method="post" style={{ display: "grid", gap: 14 }}>
              <input type="hidden" name="type" value="create" />
              <label>
                Page title
                <input name="title" required placeholder="Summer Reels" style={{ display: "block", width: "100%", marginTop: 6, padding: 10, borderRadius: 8, border: "1px solid #bbb", boxSizing: "border-box" }} />
              </label>

              <div>
                <strong>What should this page show?</strong>
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", padding: 10, border: sourceType === "reels" ? "2px solid #111" : "1px solid #e5e7e9", borderRadius: 10 }}>
                    <input type="radio" name="sourceType" value="reels" checked={sourceType === "reels"} onChange={() => setSourceType("reels")} />
                    <span><strong>Selected Reels</strong><br /><small style={{ color: "#6d7175" }}>Choose exactly which active Reels appear on this page.</small></span>
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", padding: 10, border: sourceType === "playlist" ? "2px solid #111" : "1px solid #e5e7e9", borderRadius: 10 }}>
                    <input type="radio" name="sourceType" value="playlist" checked={sourceType === "playlist"} onChange={() => setSourceType("playlist")} />
                    <span><strong>Playlist</strong><br /><small style={{ color: "#6d7175" }}>Use the playlist's saved Reel order.</small></span>
                  </label>
                </div>
              </div>

              <label>
                Playlist
                <select name="playlistId" disabled={sourceType !== "playlist"} required={sourceType === "playlist"} style={{ display: "block", width: "100%", marginTop: 6, padding: 10, borderRadius: 8, border: "1px solid #bbb", opacity: sourceType === "playlist" ? 1 : 0.55 }}>
                  <option value="">Choose a playlist</option>
                  {playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>

              <div style={{ opacity: sourceType === "reels" ? 1 : 0.55, pointerEvents: sourceType === "reels" ? "auto" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <strong>Reels to show</strong>
                  <span style={{ fontSize: 12, color: "#6d7175" }}>Select one or more</span>
                </div>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search active Reels..."
                  style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #bbb", boxSizing: "border-box", marginBottom: 8 }}
                />
                <div style={{ maxHeight: 300, overflow: "auto", display: "grid", gap: 7, padding: 2 }}>
                  {filteredReels.map((reel) => (
                    <label key={reel.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: 10, border: "1px solid #e5e7e9", borderRadius: 10, cursor: "pointer" }}>
                      <input type="checkbox" name="reelIds" value={reel.id} />
                      <span style={{ flex: 1 }}><strong>{reel.title}</strong><br /><small style={{ color: "#6d7175" }}>Active</small></span>
                    </label>
                  ))}
                  {!filteredReels.length && <p style={{ color: "#6d7175" }}>No active Reels found.</p>}
                </div>
              </div>

              <div style={{ padding: 11, borderRadius: 10, background: "#f6f6f7", fontSize: 13, color: "#4f5357" }}>
                <strong>Selected Reels:</strong> only the checked Reels will be attached to this page. You can change the selection later by creating another page.
              </div>
              {fetcher.data?.error && <div style={{ color: "#c21d2b", fontSize: 13 }}>{fetcher.data.error}</div>}
              <s-button type="submit" variant="primary">Create page</s-button>
            </fetcher.Form>
          </div>

          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Your pages</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {pages.map((page) => (
                <div key={page.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
                  <div>
                    <strong>{page.title}</strong><br />
                    <small>
                      /{page.slug} · {page.playlist?.name || `${page.reels.length} selected Reel${page.reels.length === 1 ? "" : "s"}`} · {page.published ? "Published" : "Draft"}
                    </small>
                    {page.reels.length > 0 && (
                      <div style={{ marginTop: 6, color: "#6d7175", fontSize: 12 }}>
                        {page.reels.map((row) => row.reel.title).join(" • ")}
                      </div>
                    )}
                  </div>
                  <fetcher.Form method="post">
                    <input type="hidden" name="type" value="toggle" />
                    <input type="hidden" name="id" value={page.id} />
                    <s-button type="submit" variant={page.published ? "secondary" : "primary"}>{page.published ? "Unpublish" : "Publish"}</s-button>
                  </fetcher.Form>
                </div>
              ))}
              {!pages.length && <p style={{ color: "#6d7175" }}>No video pages yet.</p>}
            </div>
          </div>
        </div>
      </s-section>
    </s-page>
  );
}
