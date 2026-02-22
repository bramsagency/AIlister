// pages/index.js
import { useEffect, useMemo, useState } from "react";

async function compressImage(file, { maxW = 1280, maxH = 1280, quality = 0.75 } = {}) {
  const img = document.createElement("img");
  const url = URL.createObjectURL(file);

  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    let { width: w, height: h } = img;
    const scale = Math.min(maxW / w, maxH / h, 1);
    w = Math.round(w * scale);
    h = Math.round(h * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );

    if (!blob) throw new Error("Compression failed");

    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Home() {
  const [files, setFiles] = useState([]);
  const [removeBg, setRemoveBg] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const previews = useMemo(() => {
    return Array.from(files || []).slice(0, 6).map((f) => ({
      key: `${f.name}-${f.size}-${f.lastModified}`,
      name: f.name,
      url: URL.createObjectURL(f),
    }));
  }, [files]);

  useEffect(() => {
    return () => previews.forEach((p) => URL.revokeObjectURL(p.url));
  }, [previews]);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);

if (files.length < 2) return setError("Select at least 2 photos.");
if (files.length > 6) return setError("Max is 6 photos.");

const form = new FormData();
const picked = Array.from(files).slice(0, 6);
for (const f of picked) {
  const small = await compressImage(f);
  form.append("images", small);
}
    form.append("remove_bg", removeBg ? "1" : "0");

    setLoading(true);
    try {
      const res = await fetch("/api/listings/create", { method: "POST", body: form });
const text = await res.text();

let data;
try {
  data = JSON.parse(text);
} catch {
  throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
}

if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
setResult(data);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>Allister</h1>
      <p style={{ marginTop: 0, opacity: 0.8 }}>Upload 2-6 photos → get a structured listing.</p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <input type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} />

        {previews.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {previews.map((p) => (
              <div
                key={p.key}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  overflow: "hidden",
                  aspectRatio: "1 / 1",
                }}
              >
                <img
                  src={p.url}
                  alt={p.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            ))}
          </div>
        )}

        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={removeBg}
            onChange={(e) => setRemoveBg(e.target.checked)}
          />
          <span>Remove background (optional)</span>
        </label>

        <button disabled={loading} style={{ padding: 12, cursor: "pointer" }}>
          {loading ? "Processing..." : "Generate Listing"}
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 16, padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
          <h2 style={{ marginTop: 0 }}>Result</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </main>
  );
}
