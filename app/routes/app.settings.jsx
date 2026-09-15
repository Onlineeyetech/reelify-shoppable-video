import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const rows = await prisma.appSetting.findMany({ where: { shop: session.shop } });
  return { settings: Object.fromEntries(rows.map((r) => [r.key, r.value])), shop: session.shop };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const keys = ["defaultLimit", "defaultDesktopCount", "defaultMobileCount", "showVolume", "showArrows"];
  for (const key of keys) {
    const value = String(form.get(key) ?? "");
    await prisma.appSetting.upsert({ where: { shop_key: { shop: session.shop, key } }, update: { value }, create: { shop: session.shop, key, value } });
  }
  return { success: true };
};

export default function Settings() {
  const { settings, shop } = useLoaderData();
  const fetcher = useFetcher();
  return <s-page heading="Settings" inlineSize="large"><s-section heading="Storefront defaults"><fetcher.Form method="post" style={{ display: "grid", gap: 14, maxWidth: 620 }}>
    <label>Default Reel limit<input name="defaultLimit" defaultValue={settings.defaultLimit || "6"} type="number" min="1" max="24" style={{ display: "block", padding: 10, width: "100%" }} /></label>
    <label>Desktop cards<input name="defaultDesktopCount" defaultValue={settings.defaultDesktopCount || "4"} type="number" min="2" max="6" style={{ display: "block", padding: 10, width: "100%" }} /></label>
    <label>Mobile cards<input name="defaultMobileCount" defaultValue={settings.defaultMobileCount || "1"} type="number" min="1" max="2" style={{ display: "block", padding: 10, width: "100%" }} /></label>
    <label><input name="showVolume" value="true" type="checkbox" defaultChecked={settings.showVolume !== "false"} /> Show volume button</label>
    <label><input name="showArrows" value="true" type="checkbox" defaultChecked={settings.showArrows !== "false"} /> Show slider arrows</label>
    <s-button type="submit" variant="primary">Save settings</s-button>
  </fetcher.Form>{fetcher.data?.success && <p>Settings saved.</p>}</s-section><s-section heading="Store"><s-paragraph>Connected store: {shop}</s-paragraph></s-section></s-page>;
}
