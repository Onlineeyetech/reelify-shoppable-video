import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const PRESETS = [
  { key: "classic", name: "Classic", subtitle: "Clean vertical cards", config: { radius: 20, overlay: "dark", buttons: "pill" } },
  { key: "editorial", name: "Editorial", subtitle: "Minimal magazine look", config: { radius: 8, overlay: "soft", buttons: "square" } },
  { key: "commerce", name: "Commerce", subtitle: "Strong product CTA", config: { radius: 16, overlay: "strong", buttons: "solid" } },
  { key: "social", name: "Social", subtitle: "Bold creator style", config: { radius: 28, overlay: "gradient", buttons: "floating" } },
];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  for (const preset of PRESETS) {
    await prisma.designPreset.upsert({
      where: { shop_key: { shop: session.shop, key: preset.key } },
      update: { name: preset.name, configJson: JSON.stringify(preset.config) },
      create: { shop: session.shop, name: preset.name, key: preset.key, configJson: JSON.stringify(preset.config), isActive: preset.key === "classic" },
    });
  }
  const designs = await prisma.designPreset.findMany({ where: { shop: session.shop }, orderBy: { createdAt: "asc" } });
  return { designs };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  if (form.get("type") !== "activate") return { error: "Unknown action." };
  const key = String(form.get("key") || "");
  await prisma.designPreset.updateMany({ where: { shop: session.shop }, data: { isActive: false } });
  await prisma.designPreset.updateMany({ where: { shop: session.shop, key }, data: { isActive: true } });
  return { success: true };
};

export default function Designs() {
  const { designs } = useLoaderData();
  const fetcher = useFetcher();
  return (
    <s-page heading="Customise design" inlineSize="large">
      <s-section>
        <p style={{ color: "#6d7175" }}>Choose a storefront Reel style. The selected design is used as the default for new Reelify sections.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(180px,1fr))", gap: 16 }}>
          {designs.map((design) => {
            const config = JSON.parse(design.configJson || "{}");
            return <div key={design.id} style={{ border: design.isActive ? "2px solid #111" : "1px solid #e1e3e5", borderRadius: 18, overflow: "hidden", background: "#fff" }}>
              <div style={{ height: 270, background: design.key === "editorial" ? "linear-gradient(180deg,#f5f5f5,#c9c9c9)" : design.key === "commerce" ? "linear-gradient(180deg,#d8d8d8,#444)" : design.key === "social" ? "linear-gradient(180deg,#e8d5f5,#51345f)" : "linear-gradient(180deg,#ead7bd,#6f4a2f)", position: "relative", display: "flex", alignItems: "end", padding: 14 }}>
                <div style={{ width: "100%", borderRadius: config.radius, background: design.key === "editorial" ? "#fff" : design.key === "commerce" ? "rgba(15,15,15,.9)" : design.key === "social" ? "rgba(70,35,90,.82)" : "rgba(0,0,0,.7)", color: design.key === "editorial" ? "#111" : "#fff", padding: 12, boxShadow: design.key === "social" ? "0 10px 30px rgba(0,0,0,.25)" : "none" }}><strong>Story title/subtitle</strong><div style={{ marginTop: 6 }}>Rs 399 <s style={{ opacity: .6 }}>Rs 799</s></div><button style={{ marginTop: 8, border: 0, borderRadius: 999, padding: "8px 16px" }}>Shop Now</button></div>
              </div>
              <div style={{ padding: 14 }}><h3 style={{ margin: 0 }}>{design.name}</h3><p style={{ color: "#6d7175" }}>{PRESETS.find((x) => x.key === design.key)?.subtitle || "Reel style"}</p>
                <fetcher.Form method="post"><input type="hidden" name="type" value="activate" /><input type="hidden" name="key" value={design.key} /><s-button type="submit" variant={design.isActive ? "secondary" : "primary"}>{design.isActive ? "✓ In use" : "Use this design"}</s-button></fetcher.Form>
              </div>
            </div>;
          })}
        </div>
      </s-section>
    </s-page>
  );
}
