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

  // Respond to preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = formidable();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(500).json({ error: "Form parse error" });
    }

    const file = files.file[0];

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
          mimeType: file.mimetype,
          body: fs.createReadStream(file.filepath),
        },
      });

      res.status(200).json({
        success: true,
        fileId: response.data.id,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Upload failed" });
    }
  });
}
