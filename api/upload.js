import { google } from "googleapis";
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = formidable();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Form parse error:", err);
      return res.status(500).json({
        error: "Form parse error",
        details: err.message || String(err),
      });
    }

    const file = files?.file?.[0];
    if (!file) {
      return res.status(400).json({
        error: "No file received",
      });
    }

    try {
      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
        scopes: ["https://www.googleapis.com/auth/drive"],
      });

      const drive = google.drive({ version: "v3", auth });

      const response = await drive.files.create({
        requestBody: {
          name: file.originalFilename,
          parents: [process.env.DRIVE_FOLDER_ID],
        },
        media: {
          mimeType: file.mimetype || "application/octet-stream",
          body: fs.createReadStream(file.filepath),
        },
      });

      return res.status(200).json({
        success: true,
        fileId: response.data.id,
      });
    } catch (error) {
      console.error("Google Drive upload failed:", error);

      return res.status(500).json({
        error: "Upload failed",
        details:
          error?.response?.data?.error?.message ||
          error?.message ||
          String(error),
      });
    }
  });
}
