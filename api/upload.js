import { google } from "googleapis";
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: { bodyParser: false },
};

// Decode RKG date from bytes 0x09..0x0B (same bitfield logic as your Python)
function rkgDateFromBuffer(buf) {
  if (!buf || buf.length < 0x0c) return "";

  const b9 = buf[0x09];
  const bA = buf[0x0a];
  const bB = buf[0x0b];

  const yearRel = ((b9 & 0x0f) << 3) | (bA >> 5); // year-2000 (0..127)
  const month = (bA >> 1) & 0x0f;                 // 1..12
  const day = ((bA & 0x01) << 4) | (bB >> 4);     // 1..31

  const year = 2000 + yearRel;

  // sanity check
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";

  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  return `${dd}.${mm}.${year}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
      const sheets = google.sheets({ version: "v4", auth: oauth2Client });

      // Read bytes to extract RKG date (only meaningful for .rkg)
      let rkgDate = "";
      const filenameOriginal = file.originalFilename || "";
      if (filenameOriginal.toLowerCase().endsWith(".rkg")) {
        const buf = fs.readFileSync(file.filepath);
        rkgDate = rkgDateFromBuffer(buf);
      }

      // 1) Upload to Drive
      const driveRes = await drive.files.create({
        requestBody: {
          name: file.originalFilename,
          parents: [process.env.DRIVE_FOLDER_ID],
        },
        media: {
          mimeType: file.mimetype || "application/octet-stream",
          body: fs.createReadStream(file.filepath),
        },
      });

      const fileId = driveRes.data.id;
      const filename = file.originalFilename || "(unknown)";
      const uploadedAt = new Date().toISOString();
      const driveLink = fileId
        ? `https://drive.google.com/file/d/${fileId}/view`
        : "";

      // optional form fields (Formidable often returns arrays)
      const track = Array.isArray(fields.track) ? fields.track[0] : (fields.track ?? "");
      const time = Array.isArray(fields.time) ? fields.time[0] : (fields.time ?? "");

      // 2) Append a row to Google Sheets
      if (!process.env.SHEET_ID) {
        throw new Error("Missing SHEET_ID env var");
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SHEET_ID,
        range: "Sheet1!A1",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [[uploadedAt, filename, fileId, driveLink, track, time, rkgDate]],
        },
      });


      return res.status(200).json({
        success: true,
        fileId,
        filename,
        driveLink,
        rkgDate,
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
