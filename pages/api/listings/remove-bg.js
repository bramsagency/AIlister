// pages/api/listings/remove-bg.js
import OpenAI from "openai";
import { supabaseServer } from "../../../lib/supabase-server";

export const config = {
  api: { bodyParser: true },
};

function toPublicPathFromPublicUrl(url) {
  // Ex: https://.../storage/v1/object/public/listing-images/listings/123.png
  const marker = "/storage/v1/object/public/listing-images/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

async function downloadAsBuffer(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to download image (${resp.status})`);
  const arr = await resp.arrayBuffer();
  return Buffer.from(arr);
}

async function removeBackgroundOpenAI({ client, imageBuffer, filename }) {
  // Uses OpenAI Image Edit with transparent background. :contentReference[oaicite:0]{index=0}
  const file = new File([imageBuffer], filename || "image.png", { type: "image/png" });

  const result = await client.images.edit({
    model: "gpt-image-1",
    image: file,
    prompt: "Remove the background. Keep the main product/object intact. Output with a transparent background.",
    background: "transparent",
    output_format: "png",
  });

  const b64 = result?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI did not return b64_json for the edited image");
  return Buffer.from(b64, "base64");
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { listing_id } = req.body || {};
    if (!listing_id) return res.status(400).json({ error: "Missing listing_id" });

    const sb = supabaseServer();

    const { data: listing, error: fetchErr } = await sb
      .from("listings")
      .select("*")
      .eq("id", listing_id)
      .single();

    if (fetchErr) throw fetchErr;

    const urls = Array.isArray(listing.images) && listing.images.length
      ? listing.images
      : listing.image_url
        ? [listing.image_url]
        : [];

    if (!urls.length) return res.status(400).json({ error: "No images found on listing" });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const newUrls = [];

    for (const url of urls) {
      const inputBuf = await downloadAsBuffer(url);

      const outPng = await removeBackgroundOpenAI({
        client,
        imageBuffer: inputBuf,
        filename: "input.png",
      });

      const originalPath = toPublicPathFromPublicUrl(url);
      const baseName = originalPath ? originalPath.split("/").pop() : `img-${Date.now()}.png`;
      const outName = String(baseName || "image.png").replace(/\.(jpg|jpeg|webp|png)$/i, "") + "-nobg.png";
      const outPath = `listings/nobg/${listing_id}/${Date.now()}-${outName}`;

      const { data: up, error: upErr } = await sb.storage
        .from("listing-images")
        .upload(outPath, outPng, { contentType: "image/png", upsert: false });

      if (upErr) throw upErr;

      const { data: pub } = sb.storage.from("listing-images").getPublicUrl(up.path);
      newUrls.push(pub.publicUrl);
    }

    const { data: updated, error: updErr } = await sb
      .from("listings")
      .update({
        images: newUrls,
        image_url: newUrls[0] || null,
      })
      .eq("id", listing_id)
      .select("*")
      .single();

    if (updErr) throw updErr;

    return res.status(200).json(updated);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
