import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

const PLAN = {
  name: "Reelify Pro",
  price: 4,
  interval: "EVERY_30_DAYS",
};

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(`#graphql
    query CurrentBilling {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          test
          trialDays
          createdAt
          currentPeriodEnd
          lineItems {
            id
            plan { pricingDetails { __typename } }
          }
        }
      }
    }
  `);
  const data = await response.json();
  return { subscriptions: data?.data?.currentAppInstallation?.activeSubscriptions || [] };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const type = String(form.get("type") || "");

  if (type === "subscribe") {
    const returnUrl = new URL(request.url);
    returnUrl.pathname = "/app/billing";
    returnUrl.search = "?billing=returned";

    const response = await admin.graphql(`#graphql
      mutation CreateReelifyPro($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean, $trialDays: Int) {
        appSubscriptionCreate(
          name: $name
          lineItems: $lineItems
          returnUrl: $returnUrl
          test: $test
          trialDays: $trialDays
        ) {
          userErrors { field message }
          confirmationUrl
          appSubscription { id status name test }
        }
      }
    `, {
      variables: {
        name: PLAN.name,
        returnUrl: returnUrl.toString(),
        test: process.env.BILLING_TEST_MODE !== "false",
        trialDays: Number(process.env.BILLING_TRIAL_DAYS || 0) || null,
        lineItems: [{ plan: { appRecurringPricingDetails: { price: { amount: PLAN.price, currencyCode: "USD" }, interval: PLAN.interval } } }],
      },
    });
    const data = await response.json();
    const result = data?.data?.appSubscriptionCreate;
    if (result?.userErrors?.length) return { error: result.userErrors.map((e) => e.message).join(", ") };
    return { confirmationUrl: result?.confirmationUrl || null };
  }

  if (type === "cancel") {
    const id = String(form.get("id") || "");
    const response = await admin.graphql(`#graphql
      mutation CancelReelifyPro($id: ID!) {
        appSubscriptionCancel(id: $id, prorate: false) {
          userErrors { field message }
          appSubscription { id status }
        }
      }
    `, { variables: { id } });
    const data = await response.json();
    const result = data?.data?.appSubscriptionCancel;
    if (result?.userErrors?.length) return { error: result.userErrors.map((e) => e.message).join(", ") };
    return { success: true };
  }

  return { error: "Unknown billing action." };
};

export default function Billing() {
  const { subscriptions } = useLoaderData();
  const fetcher = useFetcher();
  const active = subscriptions[0];

  const subscribe = () => fetcher.submit({ type: "subscribe" }, { method: "post" });

  useEffect(() => {
    if (fetcher.data?.confirmationUrl && typeof window !== "undefined") window.top.location.href = fetcher.data.confirmationUrl;
  }, [fetcher.data]);

  return <s-page heading="Billing" inlineSize="large">
    <s-section>
      <div style={{ maxWidth: 620, margin: "0 auto", border: "1px solid #e1e3e5", borderRadius: 22, padding: 28, background: "#fff", boxShadow: "0 10px 30px rgba(0,0,0,.05)" }}>
        <div style={{ display: "inline-flex", padding: "6px 10px", borderRadius: 999, background: "#e9f7ef", color: "#137333", fontWeight: 700 }}>PRO PLAN</div>
        <h1 style={{ fontSize: 36, margin: "14px 0 4px" }}>$4 <span style={{ fontSize: 16, color: "#6d7175", fontWeight: 400 }}>/ month</span></h1>
        <p style={{ color: "#6d7175" }}>Reelify Pro unlocks the full shoppable video toolkit.</p>
        <ul style={{ lineHeight: 1.9 }}><li>Unlimited playlists</li><li>Multiple Reel sections and Video Pages</li><li>Premium design presets</li><li>Storefront analytics</li><li>Advanced slider, volume and cart controls</li></ul>
        {active ? <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: "#f6f6f6" }}><strong>Active: {active.name}</strong><br /><small>Status: {active.status}{active.test ? " · Test subscription" : ""}</small><div style={{ marginTop: 12 }}><fetcher.Form method="post"><input type="hidden" name="type" value="cancel" /><input type="hidden" name="id" value={active.id} /><s-button type="submit" variant="secondary">Cancel subscription</s-button></fetcher.Form></div></div> : <s-button variant="primary" onClick={subscribe} disabled={fetcher.state !== "idle"}>{fetcher.state !== "idle" ? "Opening Shopify billing…" : "Start Pro · $4/month"}</s-button>}
        {fetcher.data?.error && <p style={{ color: "#c00" }}>{fetcher.data.error}</p>}
      </div>
    </s-section>
    <s-section heading="Production billing note"><s-paragraph>For development stores, set BILLING_TEST_MODE=true so Shopify does not charge the store. Before public launch, configure the $4/month plan in Shopify App Pricing/Partner Dashboard and switch production billing to real charges.</s-paragraph></s-section>
  </s-page>;
}
