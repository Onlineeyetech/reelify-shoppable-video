import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useLoaderData, useNavigate } from "react-router";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const [totalReels, liveReels, recentReels] = await Promise.all([
    prisma.reel.count({ where: { shop: session.shop } }),
    prisma.reel.count({ where: { shop: session.shop, status: "ACTIVE" } }),
    prisma.reel.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { products: true },
    }),
  ]);

  return {
    totalReels,
    liveReels,
    recentReels,
    shop: session.shop,
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
};

export default function Index() {
  const { totalReels, liveReels, recentReels, shop, apiKey } = useLoaderData();
  const navigate = useNavigate();

  const openThemeEditor = () => {
    const url = `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${apiKey}/reelify-reels`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <s-page heading="Reelify" inlineSize="large">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => navigate("/app/reels")}
      >
        + Add Reel
      </s-button>

      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Turn product videos into sales</s-heading>
          <s-paragraph>
            Upload vertical videos, connect products, and publish a shoppable
            Reel experience directly on your Shopify storefront.
          </s-paragraph>
          <s-stack direction="inline" gap="base">
            <s-button variant="primary" onClick={() => navigate("/app/reels")}>
              Manage Reels
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Overview">
        <s-grid
          gridTemplateColumns="repeat(3, minmax(0, 1fr))"
          gap="base"
        >
          <s-card>
            <s-stack direction="block" gap="small">
              <s-text tone="subdued">Total Reels</s-text>
              <s-heading>{totalReels}</s-heading>
              <s-text tone="subdued">Videos created</s-text>
            </s-stack>
          </s-card>

          <s-card>
            <s-stack direction="block" gap="small">
              <s-text tone="subdued">Live Reels</s-text>
              <s-heading>{liveReels}</s-heading>
              <s-text tone="subdued">Currently visible on storefront</s-text>
            </s-stack>
          </s-card>

          <s-card>
            <s-stack direction="block" gap="small">
              <s-text tone="subdued">Storefront</s-text>
              <s-heading>{liveReels > 0 ? "Live" : "Ready"}</s-heading>
              <s-text tone="subdued">
                Add the Reelify block from Theme Editor
              </s-text>
            </s-stack>
          </s-card>
        </s-grid>
      </s-section>

      <s-section heading="Recent Reels">
        {recentReels.length === 0 ? (
          <s-card>
            <s-stack direction="block" gap="base">
              <s-heading>No Reels yet</s-heading>
              <s-paragraph>
                Upload your first shoppable video to get started.
              </s-paragraph>
              <s-button variant="primary" onClick={() => navigate("/app/reels")}>
                Upload Reel
              </s-button>
            </s-stack>
          </s-card>
        ) : (
          <s-stack direction="block" gap="small">
            {recentReels.map((reel) => (
              <s-card key={reel.id}>
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-stack direction="block" gap="small" inlineSize="fill">
                    <s-heading>{reel.title}</s-heading>
                    <s-text tone="subdued">
                      {reel.status === "ACTIVE" ? "Live" : reel.status}
                    </s-text>
                  </s-stack>
                  <s-button
                    variant="secondary"
                    onClick={() => navigate("/app/reels")}
                  >
                    Manage
                  </s-button>
                </s-stack>
              </s-card>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section heading="Storefront setup">
        <s-card>
          <s-stack direction="block" gap="small">
            <s-heading>Add Reelify to your theme</s-heading>
            <s-paragraph>
              After the app extension is deployed, open Theme Editor and add
              the Reelify block to the section where you want your shoppable
              videos to appear.
            </s-paragraph>
            <s-stack direction="inline" gap="small">
              <s-button variant="primary" onClick={openThemeEditor}>
                Add to Theme
              </s-button>
              <s-button variant="secondary" onClick={() => navigate("/app/reels")}>
                Manage Reels
              </s-button>
            </s-stack>
          </s-stack>
        </s-card>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
