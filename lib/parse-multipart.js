import formidable from "formidable";
import fs from "fs";

export async function parseMultipart(req) {
  const form = formidable({
    multiples: true,
    maxFiles: 6,
    maxFileSize: 10 * 1024 * 1024, // 10MB each
    filter: ({ mimetype }) => Boolean(mimetype && mimetype.startsWith("image/")),
  });

  const { fields, files } = await new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });

  let images = files.images || [];
  if (!Array.isArray(images)) images = [images];

  const normalized = images
    .filter(Boolean)
    .slice(0, 2)
    .map((f) => ({
      originalFilename: f.originalFilename,
      mimetype: f.mimetype,
      buffer: fs.readFileSync(f.filepath),
    }));

  return { fields, images: normalized };
}
