// Read-only Telegram integration example. It never receives wallet private keys.
const token = process.env.TELEGRAM_BOT_TOKEN;
const apiBase = (process.env.BITBT_PUMP_PUBLIC_API || "https://bitbt.fun/api/pump").replace(/\/$/, "");
const pumpApiKey = process.env.BITBT_PUMP_API_KEY;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

let offset = 0;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const telegram = async (method, body) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(method === "getUpdates" ? 35_000 : 12_000),
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.ok) {
    const error = new Error(payload?.description || `Telegram HTTP ${response.status}`);
    error.retryAfter = Number(payload?.parameters?.retry_after || 0);
    throw error;
  }
  return payload;
};

const pump = async (path) => {
  const response = await fetch(`${apiBase}${path}`, {
    headers: pumpApiKey ? { "x-api-key": pumpApiKey } : {},
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload.data;
};

const short = (value) => `${value.slice(0, 6)}…${value.slice(-4)}`;
async function reply(chatId, text) { await telegram("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true }); }

async function command(message) {
  const [name, argument] = (message.text || "").trim().split(/\s+/, 2);
  if (name === "/start" || name === "/help") return reply(message.chat.id, "BitBT Pump: /trending, /token <address>, /trades <address>");
  if (name === "/trending") {
    const rows = await pump("/v1/pump/market");
    const list = Array.isArray(rows) ? rows : rows?.tokens || [];
    return reply(message.chat.id, list.slice(0, 10).map((item, index) => `${index + 1}. ${item.symbol} ${item.price || item.current_price_quote || "—"} ${short(item.token_address || item.contract_address)}`).join("\n") || "No live projects");
  }
  if ((name === "/token" || name === "/trades") && /^0x[0-9a-fA-F]{40}$/.test(argument || "")) {
    const path = name === "/token" ? `/v1/pump/detail?address=${argument}` : `/v1/pump/trades?token_address=${argument}&limit=10`;
    const data = await pump(path);
    return reply(message.chat.id, JSON.stringify(data, null, 2).slice(0, 3900));
  }
  return reply(message.chat.id, "Invalid command or token address. Use /help.");
}

let failures = 0;
for (;;) {
  try {
    const updates = await telegram("getUpdates", { offset, timeout: 25, allowed_updates: ["message"] });
    failures = 0;
    for (const update of updates.result || []) {
      offset = update.update_id + 1;
      if (!update.message) continue;
      try {
        await command(update.message);
      } catch (error) {
        await reply(update.message.chat.id, `Pump API error: ${error.message}`).catch(() => undefined);
      }
    }
  } catch (error) {
    failures += 1;
    const retryMs = error?.retryAfter > 0
      ? error.retryAfter * 1_000
      : Math.min(30_000, 1_000 * (2 ** Math.min(failures - 1, 5)));
    console.error(JSON.stringify({ event: "telegram_poll_failed", retry_ms: retryMs, error: String(error?.message || error) }));
    await sleep(retryMs);
  }
}
