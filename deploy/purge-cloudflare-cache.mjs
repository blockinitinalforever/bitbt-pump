import fs from "node:fs";

const envFile = process.env.PUMP_CDN_ENV || "/etc/bitbt-pump-cdn.env";
const values = Object.create(null);
for (const rawLine of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  const separator = line.indexOf("=");
  if (separator < 1) throw new Error(`Invalid CDN environment line in ${envFile}`);
  values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
}

const zoneId = values.CLOUDFLARE_ZONE_ID;
const apiToken = values.CLOUDFLARE_API_TOKEN;
if (!/^[a-f0-9]{32}$/i.test(zoneId || "")) throw new Error("CLOUDFLARE_ZONE_ID is missing or invalid");
if (!apiToken) throw new Error("CLOUDFLARE_API_TOKEN is missing");

const files = [
  "https://bitbt.fun/pump",
  "https://bitbt.fun/en/pump",
  "https://bitbt.fun/zh/pump",
  "https://bitbt.fun/launchpad/bitbt-wallet-ui.html",
  "https://bitbt.fun/launchpad/bitbt-launch-ui-app.html",
  "https://bitbt.fun/launchpad/launch-logo-upload.js",
  "https://bitbt.fun/launchpad/launchpad-live.js",
  "https://bitbt.fun/launchpad/walletconnect-provider.js",
];

const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ files }),
});
const payload = await response.json().catch(() => null);
if (!response.ok || payload?.success !== true) {
  throw new Error(`Cloudflare cache purge failed with HTTP ${response.status}`);
}
console.log(`Purged ${files.length} exact Cloudflare cache URLs.`);
