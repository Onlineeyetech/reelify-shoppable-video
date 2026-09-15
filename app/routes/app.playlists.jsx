import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const [playlists, reels] = await Promise.all([
    prisma.playlist.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      include: { reels: { orderBy: { position: "asc" }, include: { reel: true } } },
    }),
    prisma.reel.findMany({
      where: { shop: session.shop, status: { not: "INACTIVE" } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  return { playlists, reels };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const type = form.get("type");

  if (type === "create") {
    const name = String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();
    if (!name) return { error: "Playlist name is required." };
    const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "playlist";
    let slug = slugBase;
    let i = 2;
    while (await prisma.playlist.findUnique({ where: { shop_slug: { shop: session.shop, slug } } })) slug = `${slugBase}-${i++}`;
    const playlist = await prisma.playlist.create({ data: { shop: session.shop, name, description: description || null, slug } });
    return { success: true, playlistId: playlist.id };
  }

  if (type === "delete") {
    const id = String(form.get("playlistId") || "");
    await prisma.playlist.deleteMany({ where: { id, shop: session.shop } });
    return { success: true };
  }

  if (type === "add") {
    const playlistId = String(form.get("playlistId") || "");
    const reelIds = form.getAll("reelIds").map(String);
    const playlist = await prisma.playlist.findFirst({ where: { id: playlistId, shop: session.shop } });
    if (!playlist) return { error: "Playlist not found." };
    const existing = await prisma.playlistReel.findMany({ where: { playlistId }, select: { reelId: true, position: true } });
    const existingIds = new Set(existing.map((x) => x.reelId));
    let position = existing.length ? Math.max(...existing.map((x) => x.position)) + 1 : 0;
    for (const reelId of reelIds) {
      if (existingIds.has(reelId)) continue;
      const reel = await prisma.reel.findFirst({ where: { id: reelId, shop: session.shop } });
      if (!reel) continue;
      await prisma.playlistReel.create({ data: { playlistId, reelId, position: position++ } });
    }
    return { success: true };
  }

  if (type === "remove") {
    const playlistId = String(form.get("playlistId") || "");
    const reelId = String(form.get("reelId") || "");
    await prisma.playlistReel.deleteMany({ where: { playlistId, reelId } });
    const remaining = await prisma.playlistReel.findMany({ where: { playlistId }, orderBy: { position: "asc" } });
    await prisma.$transaction(remaining.map((row, index) => prisma.playlistReel.update({ where: { id: row.id }, data: { position: index } })));
    return { success: true };
  }

  if (type === "move") {
    const playlistId = String(form.get("playlistId") || "");
    const reelId = String(form.get("reelId") || "");
    const direction = String(form.get("direction") || "");
    const rows = await prisma.playlistReel.findMany({ where: { playlistId }, orderBy: { position: "asc" } });
    const index = rows.findIndex((row) => row.reelId === reelId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= rows.length) return { success: true };
    const a = rows[index], b = rows[target];
    await prisma.$transaction([
      prisma.playlistReel.update({ where: { id: a.id }, data: { position: b.position } }),
      prisma.playlistReel.update({ where: { id: b.id }, data: { position: a.position } }),
    ]);
    return { success: true };
  }

  return { error: "Unknown action." };
};

const cardStyle = { border: "1px solid #e1e3e5", borderRadius: 16, padding: 18, background: "#fff" };

export default function Playlists() {
  const { playlists, reels } = useLoaderData();
  const fetcher = useFetcher();
  const [selected, setSelected] = useState(playlists[0]?.id || "");
  const active = playlists.find((p) => p.id === selected) || playlists[0];

  return (
    <s-page heading="Playlists" inlineSize="large">
      <s-button slot="primary-action" variant="primary" onClick={() => document.getElementById("create-playlist")?.showModal?.()}>+ Create playlist</s-button>
      <s-section>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, .8fr) minmax(0, 2fr)", gap: 18 }}>
          <div style={{ ...cardStyle }}>
            <h3 style={{ marginTop: 0 }}>Your playlists</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {playlists.map((playlist) => (
                <button key={playlist.id} onClick={() => setSelected(playlist.id)} style={{ textAlign: "left", border: selected === playlist.id ? "2px solid #111" : "1px solid #e1e3e5", borderRadius: 12, padding: 12, background: selected === playlist.id ? "#f6f6f6" : "#fff", cursor: "pointer" }}>
                  <strong>{playlist.name}</strong><br /><small>{playlist.reels.length} reels · /{playlist.slug}</small>
                </button>
              ))}
              {!playlists.length && <p style={{ color: "#6d7175" }}>Create your first playlist.</p>}
            </div>
          </div>

          <div style={{ ...cardStyle }}>
            {!active ? <p>Create a playlist to start grouping Reels.</p> : <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                <div><h2 style={{ margin: 0 }}>{active.name}</h2><p style={{ color: "#6d7175" }}>{active.description || "No description"}</p><code>{active.id}</code></div>
                <fetcher.Form method="post"><input type="hidden" name="type" value="delete" /><input type="hidden" name="playlistId" value={active.id} /><s-button tone="critical" variant="secondary" type="submit">Delete</s-button></fetcher.Form>
              </div>
              <hr />
              <h3>Reel order</h3>
              <div style={{ display: "grid", gap: 8 }}>
                {active.reels.map((row, index) => (
                  <div key={row.id} style={{ display: "grid", gridTemplateColumns: "36px 1fr auto", gap: 12, alignItems: "center", border: "1px solid #e1e3e5", borderRadius: 12, padding: 10 }}>
                    <strong>{index + 1}</strong>
                    <div><strong>{row.reel.title}</strong><br /><small>{row.reel.status}</small></div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <fetcher.Form method="post"><input type="hidden" name="type" value="move" /><input type="hidden" name="playlistId" value={active.id} /><input type="hidden" name="reelId" value={row.reelId} /><input type="hidden" name="direction" value="up" /><s-button type="submit" variant="secondary" disabled={index === 0}>↑</s-button></fetcher.Form>
                      <fetcher.Form method="post"><input type="hidden" name="type" value="move" /><input type="hidden" name="playlistId" value={active.id} /><input type="hidden" name="reelId" value={row.reelId} /><input type="hidden" name="direction" value="down" /><s-button type="submit" variant="secondary" disabled={index === active.reels.length - 1}>↓</s-button></fetcher.Form>
                      <fetcher.Form method="post"><input type="hidden" name="type" value="remove" /><input type="hidden" name="playlistId" value={active.id} /><input type="hidden" name="reelId" value={row.reelId} /><s-button type="submit" variant="secondary">Remove</s-button></fetcher.Form>
                    </div>
                  </div>
                ))}
                {!active.reels.length && <p style={{ color: "#6d7175" }}>No reels in this playlist yet.</p>}
              </div>
              <details style={{ marginTop: 18 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Add reels to this playlist</summary>
                <fetcher.Form method="post" style={{ marginTop: 12 }}>
                  <input type="hidden" name="type" value="add" /><input type="hidden" name="playlistId" value={active.id} />
                  <div style={{ maxHeight: 280, overflow: "auto", display: "grid", gap: 8 }}>
                    {reels.map((reel) => <label key={reel.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: 8, border: "1px solid #eee", borderRadius: 8 }}><input type="checkbox" name="reelIds" value={reel.id} /> <span>{reel.title}</span></label>)}
                  </div>
                  <s-button type="submit" variant="primary" style={{ marginTop: 12 }}>Add selected reels</s-button>
                </fetcher.Form>
              </details>
            </>}
          </div>
        </div>
      </s-section>
      <dialog id="create-playlist" style={{ border: 0, borderRadius: 16, padding: 24, width: "min(520px, 90vw)" }}>
        <fetcher.Form method="post" onSubmit={() => document.getElementById("create-playlist")?.close()}>
          <input type="hidden" name="type" value="create" />
          <h2>Create playlist</h2>
          <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>Name<input name="name" required placeholder="Summer Collection" style={{ padding: 10, border: "1px solid #bbb", borderRadius: 8 }} /></label>
          <label style={{ display: "grid", gap: 6, marginBottom: 16 }}>Description<textarea name="description" placeholder="Optional playlist description" style={{ padding: 10, border: "1px solid #bbb", borderRadius: 8 }} /></label>
          <div style={{ display: "flex", gap: 8, justifyContent: "end" }}><s-button type="button" variant="secondary" onClick={() => document.getElementById("create-playlist")?.close()}>Cancel</s-button><s-button type="submit" variant="primary">Create</s-button></div>
        </fetcher.Form>
      </dialog>
    </s-page>
  );
}
