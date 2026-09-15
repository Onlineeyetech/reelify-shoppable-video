import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [events, topReels] = await Promise.all([
    prisma.analyticsEvent.groupBy({ by: ["type"], where: { shop: session.shop, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.analyticsEvent.groupBy({ by: ["reelId"], where: { shop: session.shop, reelId: { not: null }, type: "reel_view", createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { reelId: "desc" } }, take: 10 }),
  ]);
  const ids = topReels.map((x) => x.reelId).filter(Boolean);
  const reels = await prisma.reel.findMany({ where: { id: { in: ids }, shop: session.shop }, select: { id: true, title: true } });
  const reelMap = new Map(reels.map((r) => [r.id, r.title]));
  return { events, topReels: topReels.map((x) => ({ title: reelMap.get(x.reelId) || "Deleted Reel", views: x._count._all })) };
};

export default function Analytics() {
  const { events, topReels } = useLoaderData();
  const map = Object.fromEntries(events.map((x) => [x.type, x._count._all]));
  const cards = [
    ["Reel views", map.reel_view || 0],
    ["Product clicks", map.product_click || 0],
    ["Add to cart", map.add_to_cart || 0],
    ["Plays", map.reel_play || 0],
  ];
  return <s-page heading="Analytics" inlineSize="large"><s-section><p style={{ color: "#6d7175" }}>Last 30 days · storefront events collected from Reelify blocks.</p><div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 14 }}>{cards.map(([label,value]) => <div key={label} style={{ border: "1px solid #e1e3e5", borderRadius: 16, padding: 18, background: "#fff" }}><small>{label}</small><h2 style={{ margin: "8px 0 0" }}>{value}</h2></div>)}</div></s-section><s-section heading="Top Reels"><div style={{ display: "grid", gap: 8 }}>{topReels.map((r, i) => <div key={r.title} style={{ display: "flex", justifyContent: "space-between", padding: 12, borderBottom: "1px solid #eee" }}><span>{i + 1}. {r.title}</span><strong>{r.views}</strong></div>)}{!topReels.length && <p>No Reel views yet.</p>}</div></s-section></s-page>;
}
