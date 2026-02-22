import OpenAI from "openai";
import { supabaseServer } from "../../../lib/supabase-server";

export const config = {
  api: {
    bodyParser: false, // we are receiving multipart/form-data
  },
};

function readFormData(req) {
  // Minimal multipart parser using built-in Web APIs isn’t available in Next pages router.
  // We’ll use a tiny dependency-free approach by using "formidable".
  // Add formidable to package.json if you don't have it.
  throw new Error("formidable_required");
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // If you see formidable_required, follow the note below.
    const { images } = await readFormData(req);

    if (!images?.length) return res.status(400).json({ error: "No images uploaded" });

    const sb = supabaseServer();

    // Upload images to Supabase Storage
    const uploaded = [];
    for (const file of images.slice(0, 2)) {
      const path = `listings/${Date.now()}-${file.originalFilename || file.newFilename}`;
      const { data, error } = await sb.storage
        .from("listing-images")
        .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });

      if (error) throw error;

      // Public URL (if bucket is public). If private, you’ll need signed URLs later.
      const { data: pub } = sb.storage.from("listing-images").getPublicUrl(data.path);
      uploaded.push(pub.publicUrl);
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `You generate marketplace listing fields from photos.
Return ONLY valid JSON with keys:
title (<=150 chars), category, condition (new|like_new|good|fair|poor),
description, price (number), confidence_score (0-1).`;

    const input = [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: "Generate a listing from these photos." },
          ...uploaded.map((url) => ({ type: "image_url", image_url: { url } })),
        ],
      },
    ];

    const resp = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: input,
      response_format: { type: "json_object" },
    });

    const raw = resp.choices?.[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: "Model returned invalid JSON", raw });
    }

    // Save to DB
    const row = {
      title: parsed.title || null,
      price: typeof parsed.price === "number" ? parsed.price : null,
      condition: parsed.condition || null,
      description: parsed.description || null,
      category: parsed.category || null,
      image_url: uploaded[0] || null,
      images: uploaded,
      confidence_score: typeof parsed.confidence_score === "number" ? parsed.confidence_score : null,
      raw_ai: parsed,
    };

    const { data: saved, error: insertErr } = await sb
      .from("listings")
      .insert(row)
      .select("*")
      .single();

    if (insertErr) throw insertErr;

    return res.status(200).json(saved);
  } catch (e) {
    if (e.message === "formidable_required") {
      return res.status(500).json({
        error:
          "Need multipart parser. Install formidable and I’ll give you the exact readFormData() code.",
      });
    }
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
