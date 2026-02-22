// pages/api/listings/create.js
import OpenAI from "openai";
import { supabaseServer } from "../../../lib/supabase-server";
import { parseMultipart } from "../../../lib/parse-multipart";

export const config = {
  api: { bodyParser: false },
};

function asBool(v) {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "1" || s === "true" || s === "on" || s === "yes";
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { fields, images } = await parseMultipart(req);
    const removeBg = asBool(fields?.remove_bg);

    if (!images?.length) return res.status(400).json({ error: "Select 1–2 images." });

    const sb = supabaseServer();

    const uploaded = [];
    for (const file of images.slice(0, 2)) {
      const safeName = (file.originalFilename || "image").replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `listings/${Date.now()}-${safeName}`;

      const { data, error } = await sb.storage
        .from("listing-images")
        .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });

      if (error) throw error;

      const { data: pub } = sb.storage.from("listing-images").getPublicUrl(data.path);
      uploaded.push(pub.publicUrl);
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system =
      "Return ONLY valid JSON with keys: " +
      "title (<=150 chars), category, condition (new|like_new|good|fair|poor), " +
      "description, price (number), confidence_score (0-1).";

    const messages = [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: "Generate a marketplace listing from these photos." },
          ...uploaded.map((url) => ({ type: "image_url", image_url: { url } })),
        ],
      },
    ];

    const resp = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const raw = resp.choices?.[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: "Model returned invalid JSON", raw });
    }

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

    return res.status(200).json({ ...saved, remove_bg: removeBg });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
