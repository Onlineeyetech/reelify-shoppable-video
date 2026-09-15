import { useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const jsonHeaders = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const [productsResponse, reels] = await Promise.all([
    admin.graphql(`
      #graphql
      query GetProducts {
        products(first: 100, sortKey: TITLE) {
          nodes {
            id
            title
            handle
            onlineStoreUrl
            featuredImage {
              url
            }
          }
        }
      }
    `),
    prisma.reel.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        products: true,
      },
    }),
  ]);

  const productData = await productsResponse.json();

  if (productData?.errors?.length) {
    console.error("PRODUCT GRAPHQL ERROR:", productData.errors);
  }

  const products = productData?.data?.products?.nodes || [];
  const productIds = [
    ...new Set(
      reels.flatMap((reel) =>
        reel.products.map((item) => item.productId)
      )
    ),
  ];

  const productMap = new Map(
    products.map((product) => [product.id, product])
  );

  const missingProductIds = productIds.filter(
    (id) => !productMap.has(id)
  );

  if (missingProductIds.length) {
    const missingResponse = await admin.graphql(
      `
        #graphql
        query GetReelProducts($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              handle
              onlineStoreUrl
              featuredImage {
                url
              }
            }
          }
        }
      `,
      {
        variables: { ids: missingProductIds.slice(0, 250) },
      }
    );

    const missingData = await missingResponse.json();

    for (const product of missingData?.data?.nodes || []) {
      if (product?.id) productMap.set(product.id, product);
    }
  }

  return {
    products,
    reels: reels.map((reel) => ({
      id: reel.id,
      title: reel.title,
      videoUrl: reel.videoUrl,
      thumbnailUrl: reel.thumbnailUrl,
      shopifyFileId: reel.shopifyFileId,
      status: reel.status,
      createdAt: reel.createdAt,
      product:
        productMap.get(reel.products[0]?.productId) || null,
    })),
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    return { error: "Invalid request format." };
  }

  const body = await request.json();
  const actionType = body?.action;

  if (actionType === "prepare") {
    const filename = body?.filename;
    const mimeType = body?.mimeType;
    const fileSize = body?.fileSize;

    if (!filename || !mimeType || !fileSize) {
      return { error: "Missing video upload information." };
    }

    if (!String(mimeType).startsWith("video/")) {
      return { error: "Please select a valid video file." };
    }

    try {
      const response = await admin.graphql(
        `
          #graphql
          mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
            stagedUploadsCreate(input: $input) {
              stagedTargets {
                url
                resourceUrl
                parameters { name value }
              }
              userErrors { field message }
            }
          }
        `,
        {
          variables: {
            input: [
              {
                filename: String(filename),
                mimeType: String(mimeType),
                fileSize: String(fileSize),
                httpMethod: "POST",
                resource: "VIDEO",
              },
            ],
          },
        }
      );

      const data = await response.json();

      if (data?.errors?.length) {
        return {
          error: data.errors.map((e) => e.message).join(", "),
        };
      }

      const result = data?.data?.stagedUploadsCreate;

      if (result?.userErrors?.length) {
        return {
          error: result.userErrors.map((e) => e.message).join(", "),
        };
      }

      const target = result?.stagedTargets?.[0];

      if (!target) {
        return { error: "Shopify did not return an upload target." };
      }

      return { success: true, step: "prepare", target };
    } catch (error) {
      console.error("STAGED UPLOAD ERROR:", error);
      return {
        error: error?.message || "Could not prepare Shopify upload.",
      };
    }
  }

  if (actionType === "finalize") {
    const title = body?.title;
    const productId = body?.productId;
    const resourceUrl = body?.resourceUrl;
    const filename = body?.filename;

    if (!title || !productId || !resourceUrl) {
      return { error: "Missing reel information." };
    }

    try {
      const fileResponse = await admin.graphql(
        `
          #graphql
          mutation fileCreate($files: [FileCreateInput!]!) {
            fileCreate(files: $files) {
              files {
                id
                fileStatus
                ... on Video { id status }
              }
              userErrors { field message }
            }
          }
        `,
        {
          variables: {
            files: [
              {
                contentType: "VIDEO",
                originalSource: String(resourceUrl),
                alt: String(title),
              },
            ],
          },
        }
      );

      const fileData = await fileResponse.json();

      if (fileData?.errors?.length) {
        return {
          error: fileData.errors.map((e) => e.message).join(", "),
        };
      }

      const fileCreate = fileData?.data?.fileCreate;

      if (fileCreate?.userErrors?.length) {
        return {
          error: fileCreate.userErrors.map((e) => e.message).join(", "),
        };
      }

      const shopifyFile = fileCreate?.files?.[0];

      if (!shopifyFile?.id) {
        return { error: "Shopify did not create the video file." };
      }

      const reel = await prisma.reel.create({
        data: {
          shop: session.shop,
          title: String(title),
          videoUrl: String(resourceUrl),
          thumbnailUrl: null,
          shopifyFileId: shopifyFile.id,
          status: "DRAFT",
          products: {
            create: { productId: String(productId) },
          },
        },
      });

      return {
        success: true,
        step: "finalize",
        reelId: reel.id,
        fileId: shopifyFile.id,
        filename: filename || null,
        fileStatus: shopifyFile.fileStatus || null,
        status: shopifyFile.status || null,
      };
    } catch (error) {
      console.error("FINALIZE ERROR:", error);
      return {
        error: error?.message || "Could not create Shopify video.",
      };
    }
  }

  if (actionType === "status") {
    const fileId = body?.fileId;
    const reelId = body?.reelId;

    if (!fileId || !reelId) {
      return { error: "Missing file or reel ID." };
    }

    try {
      const response = await admin.graphql(
        `
          #graphql
          query GetVideoStatus($id: ID!) {
            node(id: $id) {
              id
              ... on Video {
                id
                filename
                fileStatus
                status
                fileErrors { code message }
                mediaErrors { code message }
                sources { url format mimeType width height }
                originalSource { url format mimeType width height }
                preview {
                  status
                  image { url }
                }
              }
            }
          }
        `,
        { variables: { id: String(fileId) } }
      );

      const data = await response.json();

      if (data?.errors?.length) {
        return {
          error: data.errors.map((e) => e.message).join(", "),
        };
      }

      const video = data?.data?.node;

      if (!video) {
        return { error: "Shopify video was not found." };
      }

      if (
        video.status === "FAILED" ||
        video.fileStatus === "FAILED"
      ) {
        const errorMessage =
          video.fileErrors?.[0]?.message ||
          video.mediaErrors?.[0]?.message ||
          "Shopify could not process this video.";

        return {
          success: false,
          step: "status",
          status: video.status || "FAILED",
          fileStatus: video.fileStatus || "FAILED",
          error: errorMessage,
        };
      }

      if (
        video.status === "READY" ||
        video.fileStatus === "READY"
      ) {
        const mp4Source = video.sources?.find(
          (source) =>
            source.format === "mp4" ||
            source.mimeType === "video/mp4"
        );

        const videoUrl = mp4Source?.url || null;
        const thumbnailUrl = video.preview?.image?.url || null;

        console.log("SHOPIFY READY VIDEO SOURCES:", {
          fileId,
          status: video.status,
          fileStatus: video.fileStatus,
          sources: video.sources,
          selectedMp4: mp4Source,
        });

        // Never save Shopify's original upload URL as the storefront video.
        // The storefront player needs one of Shopify's processed MP4 sources.
        if (!videoUrl) {
          return {
            success: false,
            step: "status",
            status: video.status || "READY",
            fileStatus: video.fileStatus || "READY",
            error:
              "Shopify finished processing the Reel, but no MP4 video source is available yet. Please try again in a moment.",
          };
        }

        await prisma.reel.updateMany({
          where: {
            id: String(reelId),
            shop: session.shop,
          },
          data: {
            videoUrl,
            thumbnailUrl,
            status: "ACTIVE",
          },
        });

        return {
          success: true,
          step: "status",
          status: "READY",
          fileStatus: video.fileStatus || "READY",
          videoUrl,
          thumbnailUrl,
        };
      }

      return {
        success: true,
        step: "status",
        status: video.status || "PROCESSING",
        fileStatus: video.fileStatus || null,
      };
    } catch (error) {
      console.error("STATUS CHECK ERROR:", error);
      return {
        error: error?.message || "Could not check video status.",
      };
    }
  }

  if (actionType === "toggle") {
    const reelId = body?.reelId;
    const nextStatus = body?.status;

    if (!reelId || !["ACTIVE", "INACTIVE"].includes(nextStatus)) {
      return { error: "Invalid Reel status change." };
    }

    const result = await prisma.reel.updateMany({
      where: { id: String(reelId), shop: session.shop },
      data: { status: nextStatus },
    });

    if (!result.count) {
      return { error: "Reel not found." };
    }

    return { success: true, step: "toggle" };
  }

  if (actionType === "delete") {
    const reelId = body?.reelId;

    if (!reelId) return { error: "Missing Reel ID." };

    const result = await prisma.reel.deleteMany({
      where: { id: String(reelId), shop: session.shop },
    });

    if (!result.count) {
      return { error: "Reel not found." };
    }

    return { success: true, step: "delete" };
  }

  return { error: "Unknown action." };
};

export default function Reels() {
  const { products, reels } = useLoaderData();

  const prepareFetcher = useFetcher();
  const finalizeFetcher = useFetcher();
  const statusFetcher = useFetcher();
  const manageFetcher = useFetcher();

  const [videoFile, setVideoFile] = useState(null);
  const [videoName, setVideoName] = useState("");
  const [title, setTitle] = useState("");
  const [productId, setProductId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [fileId, setFileId] = useState(null);
  const [reelId, setReelId] = useState(null);
  const [pollCount, setPollCount] = useState(0);

  const prepareStartedRef = useRef(false);
  const finalizeStartedRef = useRef(false);
  const uploadFinishedRef = useRef(false);

  const handleSaveReel = () => {
    setError("");
    setSuccessMessage("");

    if (!title.trim()) return setError("Please enter a Reel title.");
    if (!videoFile) return setError("Please select a video.");
    if (!productId) return setError("Please select a product.");
    if (!videoFile.type.startsWith("video/")) {
      return setError("Please select a valid video file.");
    }

    setUploading(true);
    setUploadProgress(5);
    setUploadStep("Preparing secure Shopify upload...");
    setPollCount(0);
    setFileId(null);
    setReelId(null);
    prepareFetcher.reset();
    finalizeFetcher.reset();
    statusFetcher.reset();
    prepareStartedRef.current = true;
    finalizeStartedRef.current = false;
    uploadFinishedRef.current = false;

    prepareFetcher.submit(
      {
        action: "prepare",
        filename: videoFile.name,
        mimeType: videoFile.type,
        fileSize: videoFile.size,
      },
      {
        method: "post",
        encType: "application/json",
      }
    );
  };

  useEffect(() => {
    const data = prepareFetcher.data;
    if (!prepareStartedRef.current || !data) return;
    if (prepareFetcher.state !== "idle") return;

    if (data.error) {
      setError(data.error);
      setUploading(false);
      prepareStartedRef.current = false;
      return;
    }

    if (data.step !== "prepare" || !data.target) return;

    prepareStartedRef.current = false;

    const uploadVideo = async () => {
      try {
        const target = data.target;

        if (!videoFile) throw new Error("Video file is no longer available.");

        setUploadStep("Uploading video directly to Shopify...");
        setUploadProgress(20);

        const uploadForm = new FormData();

        for (const parameter of target.parameters || []) {
          uploadForm.append(parameter.name, parameter.value);
        }

        uploadForm.append("file", videoFile);

        const uploadResponse = await fetch(target.url, {
          method: "POST",
          body: uploadForm,
        });

        if (!uploadResponse.ok) {
          const text = await uploadResponse.text();
          console.error("SHOPIFY STAGED UPLOAD FAILED:", text);
          throw new Error(
            `Shopify video upload failed (${uploadResponse.status}).`
          );
        }

        setUploadProgress(70);
        setUploadStep("Creating Shopify video file...");
        finalizeStartedRef.current = true;

        finalizeFetcher.submit(
          {
            action: "finalize",
            title: title.trim(),
            productId,
            filename: videoFile.name,
            resourceUrl: target.resourceUrl,
          },
          {
            method: "post",
            encType: "application/json",
          }
        );
      } catch (uploadError) {
        console.error("DIRECT UPLOAD ERROR:", uploadError);
        setError(uploadError?.message || "Video upload failed.");
        setUploading(false);
      }
    };

    uploadVideo();
  }, [prepareFetcher.data, prepareFetcher.state]);

  useEffect(() => {
    const data = finalizeFetcher.data;
    if (!finalizeStartedRef.current || !data) return;
    if (finalizeFetcher.state !== "idle") return;

    if (data.error) {
      setError(data.error);
      setUploading(false);
      finalizeStartedRef.current = false;
      return;
    }

    if (data.step !== "finalize" || !data.fileId || !data.reelId) return;

    finalizeStartedRef.current = false;
    setFileId(data.fileId);
    setReelId(data.reelId);
    setUploadProgress(80);
    setUploadStep("Shopify is processing your video...");
    setPollCount(0);
  }, [finalizeFetcher.data, finalizeFetcher.state]);

  useEffect(() => {
    if (!uploading || !fileId || !reelId) return;
    if (statusFetcher.state !== "idle") return;
    if (uploadFinishedRef.current) return;
    if (pollCount >= 180) return;

    const timer = setTimeout(() => {
      statusFetcher.submit(
        {
          action: "status",
          fileId,
          reelId,
        },
        {
          method: "post",
          encType: "application/json",
        }
      );
    }, 2000);

    return () => clearTimeout(timer);
  }, [uploading, fileId, reelId, pollCount, statusFetcher.state]);

  useEffect(() => {
    const data = statusFetcher.data;
    if (!data || !uploading) return;
    if (statusFetcher.state !== "idle") return;

    if (data.error) {
      setError(data.error);
      setUploading(false);
      return;
    }

    if (data.status === "READY") {
      uploadFinishedRef.current = true;
      setUploadProgress(100);
      setUploadStep("Video is live on your storefront.");
      setSuccessMessage("Reel created and published successfully!");
      setUploading(false);
      setVideoFile(null);
      setVideoName("");
      setTitle("");
      setProductId("");
      setFileId(null);
      setReelId(null);
      return;
    }

    if (data.status === "FAILED" || data.fileStatus === "FAILED") {
      setError(data.error || "Shopify could not process the video.");
      setUploading(false);
      return;
    }

    const nextCount = pollCount + 1;
    setPollCount(nextCount);
    setUploadProgress(80 + Math.min(Math.floor((nextCount / 180) * 18), 18));
    setUploadStep(
      `Shopify is processing your video... (${data.fileStatus || data.status || "PROCESSING"})`
    );

    if (nextCount >= 180) {
      setError(
        "Video uploaded, but Shopify is still processing it. You can refresh the page and check the Reel status."
      );
      setUploading(false);
    }
  }, [statusFetcher.data, statusFetcher.state]);

  const runManageAction = (action, id, status) => {
    setError("");
    setSuccessMessage("");
    manageFetcher.submit(
      { action, reelId: id, status },
      {
        method: "post",
        encType: "application/json",
      }
    );
  };

  useEffect(() => {
    if (manageFetcher.state !== "idle" || !manageFetcher.data) return;
    if (manageFetcher.data.error) {
      setError(manageFetcher.data.error);
    } else if (manageFetcher.data.step === "toggle") {
      setSuccessMessage("Reel status updated.");
    } else if (manageFetcher.data.step === "delete") {
      setSuccessMessage("Reel deleted.");
    }
  }, [manageFetcher.data, manageFetcher.state]);

  return (
    <s-page heading="Reels" inlineSize="large">
      <s-button
        slot="primary-action"
        variant="primary"
        disabled={uploading}
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        + Add Reel
      </s-button>

      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Create a shoppable Reel</s-heading>
          <s-paragraph>
            Upload a vertical video, connect a product, and publish it directly
            to your storefront.
          </s-paragraph>

          {error && <s-banner tone="critical">{error}</s-banner>}
          {successMessage && <s-banner tone="success">{successMessage}</s-banner>}

          <s-text-field
            label="Reel title"
            value={title}
            required
            placeholder="e.g. Summer Collection"
            disabled={uploading}
            onChange={(event) => setTitle(event.target.value)}
          />

          <s-box>
            <s-stack direction="block" gap="small">
              <s-text>Video</s-text>
              <s-text tone="subdued">
                MP4 or another browser-compatible vertical video is recommended.
              </s-text>
              <input
                type="file"
                accept="video/*"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  setVideoFile(file || null);
                  setVideoName(file?.name || "");
                  setError("");
                  setSuccessMessage("");
                }}
              />
              {videoName && (
                <s-text>Selected: {videoName}</s-text>
              )}
            </s-stack>
          </s-box>

          <s-select
            label="Connect product"
            value={productId}
            required
            disabled={uploading}
            onChange={(event) => setProductId(event.target.value)}
          >
            <s-option value="">Select a product</s-option>
            {products.map((product) => (
              <s-option key={product.id} value={product.id}>
                {product.title}
              </s-option>
            ))}
          </s-select>

          {uploading && (
            <s-box>
              <s-stack direction="block" gap="small">
                <s-text>{uploadStep}</s-text>
                <s-text tone="subdued">{uploadProgress}% complete</s-text>
              </s-stack>
            </s-box>
          )}

          <s-button
            variant="primary"
            disabled={uploading || !title.trim() || !videoFile || !productId}
            onClick={handleSaveReel}
          >
            {uploading ? "Publishing..." : "Publish Reel"}
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading={`Your Reels (${reels.length})`}>
        {reels.length === 0 ? (
          <s-card>
            <s-stack direction="block" gap="small">
              <s-heading>No Reels yet</s-heading>
              <s-paragraph>
                Upload your first video above and it will appear here.
              </s-paragraph>
            </s-stack>
          </s-card>
        ) : (
          <s-stack direction="block" gap="base">
            {reels.map((reel) => (
              <s-card key={reel.id}>
                <s-stack direction="inline" gap="base" alignItems="center">
                  {reel.thumbnailUrl ? (
                    <img
                      src={reel.thumbnailUrl}
                      alt={reel.title}
                      style={{
                        width: "88px",
                        height: "120px",
                        objectFit: "cover",
                        borderRadius: "10px",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "88px",
                        height: "120px",
                        borderRadius: "10px",
                        background: "#f1f1f1",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      🎬
                    </div>
                  )}

                  <s-stack direction="block" gap="small" inlineSize="fill">
                    <s-heading>{reel.title}</s-heading>
                    <s-text tone="subdued">
                      {reel.product?.title || "Product unavailable"}
                    </s-text>
                    <s-text>
                      Status: {reel.status === "ACTIVE" ? "Live" : reel.status}
                    </s-text>

                    <s-stack direction="inline" gap="small">
                      <s-button
                        variant={reel.status === "ACTIVE" ? "secondary" : "primary"}
                        onClick={() =>
                          runManageAction(
                            "toggle",
                            reel.id,
                            reel.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"
                          )
                        }
                        disabled={manageFetcher.state !== "idle"}
                      >
                        {reel.status === "ACTIVE" ? "Take Offline" : "Publish"}
                      </s-button>

                      <s-button
                        variant="secondary"
                        tone="critical"
                        onClick={() => {
                          if (window.confirm("Delete this Reel?")) {
                            runManageAction("delete", reel.id);
                          }
                        }}
                        disabled={manageFetcher.state !== "idle"}
                      >
                        Delete
                      </s-button>
                    </s-stack>
                  </s-stack>
                </s-stack>
              </s-card>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
