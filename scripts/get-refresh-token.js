import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import open from "open";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cfgPath = path.join(__dirname, "config.json");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

const CLIENT_ID = cfg.client_id;
const CLIENT_SECRET = cfg.client_secret;

const REDIRECT_URI = "http://localhost:3000/oauth2callback";
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
];

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith("/oauth2callback")) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Waiting for OAuth callback...");
    return;
  }

  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get("code");

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Missing code");
    return;
  }

  const { tokens } = await oauth2Client.getToken(code);

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Auth complete. Check your terminal for the refresh token.\n");

  console.log("\n TOKENS:");
  console.log(tokens);

  console.log("\n Refresh token (store this in Vercel as GOOGLE_REFRESH_TOKEN):");
  console.log(tokens.refresh_token);

  server.close();
});

server.listen(3000, async () => {
  console.log("Opening browser for OAuth consent...");
  await open(authUrl);
});
