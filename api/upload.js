import { google } from "googleapis";
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: { bodyParser: false },
};

// Decode RKG date from bytes 0x09..0x0B
function rkgDateFromBuffer(buf) {
  if (!buf || buf.length < 0x0c) return "";
  const b9 = buf[0x09];
  const bA = buf[0x0a];
  const bB = buf[0x0b];

  const yearRel = ((b9 & 0x0f) << 3) | (bA >> 5);
  const month = (bA >> 1) & 0x0f;
  const day = ((bA & 0x01) << 4) | (bB >> 4);
  const year = 2000 + yearRel;

  // basic validity check
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";

  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  // return dd.mm.yyyy (your GAS now supports this too)
  return `${dd}.${mm}.${year}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const form = formidable();

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: err.message });

    const file = files?.file?.[0];
    if (!file) return res.status(400).json({ error: "No file received" });

    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );

      oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      });

      const drive = google.drive({ version: "v3", auth: oauth2Client });

      // Extract RKG date (only if .rkg)
      let rkgDate = "";
      const originalName = file.originalFilename || "";
      if (originalName.toLowerCase().endsWith(".rkg")) {
        const buf = fs.readFileSync(file.filepath);
        rkgDate = rkgDateFromBuffer(buf);
      }

      // Upload to Drive
      const driveRes = await drive.files.create({
        requestBody: {
          name: originalName || "upload",
          parents: [process.env.DRIVE_FOLDER_ID],
        },
        media: {
          mimeType: file.mimetype || "application/octet-stream",
          body: fs.createReadStream(file.filepath),
        },
      });

      const fileId = driveRes.data.id;
      const driveLink = fileId ? `https://drive.google.com/file/d/${fileId}/view` : "";

      return res.status(200).json({
        success: true,
        fileId,
        filename: originalName || "(unknown)",
        driveLink,
        rkgDate, // dd.mm.yyyy (or "")
      });
    } catch (error) {
      console.error("Upload failed:", error);
      return res.status(500).json({
        error: "Upload failed",
        details: error?.message || String(error),
      });
    }
  });
}
