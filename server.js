const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR =
  process.env.STORE_DIR ||
  (process.env.VERCEL ? path.join(os.tmpdir(), "whatsapp-bot-dashboard-data") : path.join(ROOT, "data"));
const STORE_PATH = path.join(DATA_DIR, "store.json");
const STORE_KEY = process.env.STORE_KEY || "whatsapp_bot_dashboard_store";
const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString("hex")}`;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, passwordHash) {
  if (!passwordHash || !passwordHash.salt || !passwordHash.hash) return false;
  const incoming = hashPassword(password, passwordHash.salt).hash;
  return crypto.timingSafeEqual(Buffer.from(incoming, "hex"), Buffer.from(passwordHash.hash, "hex"));
}

function seedStore() {
  const createdAt = now();
  const adminName = process.env.BOOTSTRAP_ADMIN_NAME || "مدير النظام";
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@example.com";
  if (process.env.VERCEL && !process.env.BOOTSTRAP_ADMIN_PASSWORD) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD is required on Vercel.");
  }
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || "admin123456";
  return {
    appSecret: process.env.APP_SECRET || crypto.randomBytes(32).toString("hex"),
    users: [
      {
        id: id("user"),
        name: adminName,
        email: adminEmail,
        role: "admin",
        active: true,
        passwordHash: hashPassword(adminPassword),
        createdAt,
        updatedAt: createdAt
      }
    ],
    rules: [
      {
        id: id("rule"),
        name: "استفسار الأسعار",
        keywords: ["السعر", "سعر", "تكلفة", "بكام", "price"],
        reply: "أهلا بك. الأسعار بتختلف حسب الخدمة المطلوبة. تحب تعرف عروض المواقع، المتاجر، ولا الهوية البصرية؟",
        active: true,
        priority: 30,
        matchMode: "contains",
        createdAt,
        updatedAt: createdAt
      },
      {
        id: id("rule"),
        name: "مواقع إلكترونية",
        keywords: ["موقع", "ويب سايت", "website", "landing"],
        reply: "ممتاز. عندنا باقات للمواقع التعريفية والمتاجر الإلكترونية والـ Landing Pages. ابعتلي نوع الموقع وعدد الصفحات المطلوب.",
        active: true,
        priority: 20,
        matchMode: "contains",
        createdAt,
        updatedAt: createdAt
      },
      {
        id: id("rule"),
        name: "ترحيب",
        keywords: ["السلام", "مرحبا", "اهلا", "أهلا", "hello", "hi"],
        reply: "أهلا وسهلا بك. قولّي محتاج إيه وأنا أساعدك فورًا.",
        active: true,
        priority: 10,
        matchMode: "contains",
        createdAt,
        updatedAt: createdAt
      }
    ],
    conversations: [],
    settings: {
      businessName: "WhatsApp Bot",
      botEnabled: true,
      fallbackReply: "وصلت رسالتك. من فضلك اكتب نوع الخدمة المطلوبة أو كلمة السعر لعرض الباقات.",
      widgetSiteKey: crypto.randomBytes(8).toString("hex"),
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "my_verify_token",
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
      wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",
      whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
      graphVersion: process.env.WHATSAPP_GRAPH_VERSION || "v25.0"
    },
    createdAt,
    updatedAt: createdAt
  };
}

function hasKvStorage() {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
      (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
  );
}

async function kvCommand(command) {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const response = await fetch(redisUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  if (!response.ok) {
    throw new Error(`KV request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data.result;
}

function normalizeStore(store) {
  store.users ||= [];
  store.rules ||= [];
  store.conversations ||= [];
  store.settings ||= {};
  store.settings.businessName ||= "WhatsApp Bot";
  store.settings.fallbackReply ||= "وصلت رسالتك. من فضلك وضح طلبك أكثر.";
  store.settings.widgetSiteKey ||= crypto.randomBytes(8).toString("hex");

  // Important:
  // Environment variables are used only as first-time defaults.
  // After saving from the dashboard settings screen, the stored values
  // remain the source of truth so the fields show exactly what was entered.
  store.settings.verifyToken ||= process.env.WHATSAPP_VERIFY_TOKEN || "my_verify_token";
  store.settings.phoneNumberId ||= process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  store.settings.wabaId ||= process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
  store.settings.whatsappAccessToken ||= process.env.WHATSAPP_ACCESS_TOKEN || "";
  store.settings.graphVersion ||= process.env.WHATSAPP_GRAPH_VERSION || "v25.0";

  store.appSecret ||= process.env.APP_SECRET || crypto.randomBytes(32).toString("hex");
  return store;
}

async function loadStore() {
  if (hasKvStorage()) {
    const rawStore = await kvCommand(["GET", STORE_KEY]);
    if (rawStore) {
      return normalizeStore(typeof rawStore === "string" ? JSON.parse(rawStore) : rawStore);
    }

    const seeded = seedStore();
    await saveStore(seeded);
    return seeded;
  }

  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    const seeded = seedStore();
    await saveStore(seeded);
    return seeded;
  }

  const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  return normalizeStore(store);
}

async function saveStore(store) {
  store.updatedAt = now();

  if (hasKvStorage()) {
    await kvCommand(["SET", STORE_KEY, JSON.stringify(store)]);
    return;
  }

  ensureDataDir();
  const tmpPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(tmpPath, STORE_PATH);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F]/g, "")
    .trim();
}

function findBotReply(store, text) {
  const normalized = normalizeText(text);
  const rules = store.rules
    .filter((rule) => rule.active)
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));

  for (const rule of rules) {
    const keywords = Array.isArray(rule.keywords) ? rule.keywords : [];
    const matched = keywords.some((keyword) => {
      const candidate = normalizeText(keyword);
      if (!candidate) return false;
      return rule.matchMode === "exact" ? normalized === candidate : normalized.includes(candidate);
    });

    if (matched) {
      return { reply: rule.reply, rule };
    }
  }

  return { reply: store.settings.fallbackReply, rule: null };
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: Boolean(user.active),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function publicSettings(settings) {
  const token = settings.whatsappAccessToken || "";
  return {
    businessName: settings.businessName || "",
    botEnabled: Boolean(settings.botEnabled),
    fallbackReply: settings.fallbackReply || "",
    widgetSiteKey: settings.widgetSiteKey || "",
    verifyToken: settings.verifyToken || "",
    phoneNumberId: settings.phoneNumberId || "",
    wabaId: settings.wabaId || "",
    graphVersion: settings.graphVersion || "v25.0",
    whatsappAccessTokenMasked: token ? `${token.slice(0, 6)}...${token.slice(-4)}` : ""
  };
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function createSessionToken(user, secret) {
  const payload = Buffer.from(
    JSON.stringify({
      uid: user.id,
      exp: Date.now() + 1000 * 60 * 60 * 12
    })
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

function readSessionToken(req, store) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.session;
  if (!token || !token.includes(".")) return null;

  const [payload, signature] = token.split(".");
  if (signature !== sign(payload, store.appSecret)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Date.now() > parsed.exp) return null;
    return store.users.find((user) => user.id === parsed.uid && user.active) || null;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  return header.split(";").reduce((cookies, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (key) cookies[key] = decodeURIComponent(rest.join("="));
    return cookies;
  }, {});
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function allowWidgetCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function readJson(req) {
  if (req.body !== undefined) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        const params = new URLSearchParams(req.body);
        return Object.fromEntries(params.entries());
      }
    }

    if (Buffer.isBuffer(req.body)) {
      const body = req.body.toString("utf8");
      try {
        return JSON.parse(body);
      } catch {
        const params = new URLSearchParams(body);
        return Object.fromEntries(params.entries());
      }
    }

    return req.body || {};
  }

  const body = await readBody(req);
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    const params = new URLSearchParams(body);
    return Object.fromEntries(params.entries());
  }
}

function requireAuth(req, res, store) {
  const user = readSessionToken(req, store);
  if (!user) {
    sendJson(res, 401, { error: "unauthorized", message: "يجب تسجيل الدخول أولا." });
    return null;
  }
  return user;
}

function requireAdmin(user, res) {
  if (user.role !== "admin") {
    sendJson(res, 403, { error: "forbidden", message: "هذه العملية متاحة للمدير فقط." });
    return false;
  }
  return true;
}

function stats(store) {
  const conversations = store.conversations;
  const messages = conversations.flatMap((conversation) => conversation.messages || []);
  return {
    conversations: conversations.length,
    botReplies: messages.filter((message) => message.from === "bot").length,
    waiting: conversations.filter((conversation) => conversation.status === "human").length,
    activeRules: store.rules.filter((rule) => rule.active).length,
    users: store.users.length
  };
}

function upsertConversation(store, details) {
  let conversation = store.conversations.find(
    (item) => item.channel === details.channel && item.externalId === details.externalId
  );

  if (!conversation) {
    conversation = {
      id: id("conv"),
      channel: details.channel,
      externalId: details.externalId,
      siteKey: details.siteKey || "",
      visitorName: details.visitorName || "زائر جديد",
      visitorUrl: details.visitorUrl || "",
      phone: details.phone || "",
      status: "bot",
      assignedTo: "",
      messages: [],
      createdAt: now(),
      updatedAt: now()
    };
    store.conversations.unshift(conversation);
  }

  conversation.visitorName = details.visitorName || conversation.visitorName;
  conversation.visitorUrl = details.visitorUrl || conversation.visitorUrl;
  conversation.phone = details.phone || conversation.phone;
  conversation.updatedAt = now();
  return conversation;
}

function addMessage(conversation, from, text, meta = {}) {
  const message = {
    id: id("msg"),
    from,
    text: String(text || ""),
    meta,
    createdAt: now()
  };
  conversation.messages.push(message);
  conversation.updatedAt = message.createdAt;
  return message;
}

function postJsonOverHttps(endpoint, payload, token) {
  return new Promise((resolve, reject) => {
    const target = new URL(endpoint);
    const body = JSON.stringify(payload);
    const req = https.request(
      target,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Bearer ${token}`
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          let parsed = data;
          try {
            parsed = JSON.parse(data);
          } catch {
            // Keep the raw response for diagnostics.
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function sendWhatsAppText(store, to, text) {
  const { phoneNumberId, whatsappAccessToken, graphVersion } = store.settings;
  if (!phoneNumberId || !whatsappAccessToken) {
    return { skipped: true, reason: "missing_whatsapp_credentials" };
  }

  const endpoint = `https://graph.facebook.com/${graphVersion || "v25.0"}/${phoneNumberId}/messages`;
  return postJsonOverHttps(
    endpoint,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: text
      }
    },
    whatsappAccessToken
  );
}

function serveStatic(req, res, pathname) {
  const cleanPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, cleanPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    const indexPath = path.join(PUBLIC_DIR, "index.html");
    const html = fs.readFileSync(indexPath, "utf8");
    sendText(res, 200, html, MIME_TYPES[".html"]);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  sendText(res, 200, fs.readFileSync(filePath), MIME_TYPES[ext] || "application/octet-stream");
}

function widgetScript(siteKey) {
  return `
(function () {
  var script = document.currentScript;
  var apiBase = new URL(script.src).origin;
  var siteKey = ${JSON.stringify(siteKey || "")};
  var storageKey = "wb_widget_session_" + siteKey;
  var contactStorageKey = "wb_widget_contact_" + siteKey;
  var sessionId = localStorage.getItem(storageKey) || ("visitor_" + Math.random().toString(16).slice(2) + Date.now());
  var visitorInfo = getVisitorInfo();
  localStorage.setItem(storageKey, sessionId);

  var styles = document.createElement("style");
  styles.textContent = [
    ".wb-chat-button{position:fixed;right:22px;bottom:22px;z-index:2147483000;width:58px;height:58px;border:0;border-radius:50%;background:#16a34a;color:#fff;font:700 24px system-ui;box-shadow:0 16px 34px rgba(15,23,42,.24);cursor:pointer}",
    ".wb-chat-panel{position:fixed;right:22px;bottom:92px;z-index:2147483000;width:min(360px,calc(100vw - 32px));height:480px;display:none;overflow:hidden;border:1px solid #d8e0dc;border-radius:12px;background:#fff;box-shadow:0 20px 52px rgba(15,23,42,.2);font-family:system-ui,-apple-system,Segoe UI,sans-serif;direction:rtl}",
    ".wb-chat-panel.is-open{display:flex;flex-direction:column}",
    ".wb-chat-head{padding:14px 16px;background:#0f172a;color:#fff;font-weight:800}",
    ".wb-lead-form{display:grid;gap:10px;padding:14px;background:#fff}",
    ".wb-lead-form label{display:grid;gap:6px;color:#344054;font-size:13px;font-weight:800}",
    ".wb-lead-form input{width:100%;border:1px solid #d1d5db;border-radius:8px;padding:10px;font:inherit;outline:none}",
    ".wb-lead-form input:focus{border-color:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,.14)}",
    ".wb-lead-submit{height:42px;border:0;border-radius:8px;background:#16a34a;color:#fff;font-weight:900;cursor:pointer}",
    ".wb-lead-error{min-height:18px;color:#dc2626;font-size:12px;line-height:1.5}",
    ".wb-hidden{display:none!important}",
    ".wb-chat-log{flex:1;overflow:auto;background:#f6f8f7;padding:14px;display:flex;flex-direction:column;gap:10px}",
    ".wb-msg{max-width:82%;padding:10px 12px;border-radius:10px;font-size:14px;line-height:1.55;white-space:pre-wrap}",
    ".wb-user{align-self:flex-start;background:#dcfce7}",
    ".wb-bot{align-self:flex-end;background:#fff;border:1px solid #e5e7eb}",
    ".wb-chat-form{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb}",
    ".wb-chat-input{flex:1;border:1px solid #d1d5db;border-radius:8px;padding:10px;font:inherit;min-width:0}",
    ".wb-chat-send{border:0;border-radius:8px;background:#16a34a;color:#fff;font-weight:800;padding:0 14px;cursor:pointer}"
  ].join("");
  document.head.appendChild(styles);

  var button = document.createElement("button");
  button.className = "wb-chat-button";
  button.type = "button";
  button.setAttribute("aria-label", "افتح المحادثة");
  button.textContent = "↗";

  var panel = document.createElement("section");
  panel.className = "wb-chat-panel";
  panel.innerHTML = '<div class="wb-chat-head">تحدث معنا</div><form class="wb-lead-form"><label>الاسم<input class="wb-lead-name" autocomplete="name" placeholder="اكتب اسمك" required /></label><label>رقم الهاتف<input class="wb-lead-phone" type="tel" autocomplete="tel" placeholder="اكتب رقم هاتفك" required /></label><p class="wb-lead-error"></p><button class="wb-lead-submit" type="submit">ابدأ المحادثة</button></form><div class="wb-chat-log wb-hidden"></div><form class="wb-chat-form wb-hidden"><input class="wb-chat-input" autocomplete="off" placeholder="اكتب رسالتك..." /><button class="wb-chat-send" type="submit">إرسال</button></form>';

  document.body.appendChild(button);
  document.body.appendChild(panel);

  var leadForm = panel.querySelector(".wb-lead-form");
  var leadName = panel.querySelector(".wb-lead-name");
  var leadPhone = panel.querySelector(".wb-lead-phone");
  var leadError = panel.querySelector(".wb-lead-error");
  var log = panel.querySelector(".wb-chat-log");
  var form = panel.querySelector(".wb-chat-form");
  var input = panel.querySelector(".wb-chat-input");

  function getVisitorInfo() {
    try {
      return JSON.parse(localStorage.getItem(contactStorageKey) || "null");
    } catch (error) {
      return null;
    }
  }

  function isValidPhone(phone) {
    return String(phone || "").replace(/[^0-9+]/g, "").length >= 7;
  }

  function showChat() {
    leadForm.classList.add("wb-hidden");
    log.classList.remove("wb-hidden");
    form.classList.remove("wb-hidden");
    if (!log.dataset.ready) {
      addMessage("bot", "أهلا " + visitorInfo.name + ". كيف نقدر نساعدك؟");
      log.dataset.ready = "true";
    }
    input.focus();
  }

  function addMessage(type, text) {
    var node = document.createElement("div");
    node.className = "wb-msg " + (type === "user" ? "wb-user" : "wb-bot");
    node.textContent = text;
    log.appendChild(node);
    log.scrollTop = log.scrollHeight;
  }

  if (visitorInfo && visitorInfo.name && isValidPhone(visitorInfo.phone)) {
    showChat();
  }

  button.addEventListener("click", function () {
    panel.classList.toggle("is-open");
    if (panel.classList.contains("is-open")) {
      if (visitorInfo && visitorInfo.name && isValidPhone(visitorInfo.phone)) {
        showChat();
      } else {
        leadName.focus();
      }
    }
  });

  leadForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var name = leadName.value.trim();
    var phone = leadPhone.value.trim();

    if (!name || !isValidPhone(phone)) {
      leadError.textContent = "من فضلك اكتب الاسم ورقم هاتف صحيح.";
      return;
    }

    visitorInfo = { name: name, phone: phone };
    localStorage.setItem(contactStorageKey, JSON.stringify(visitorInfo));
    leadError.textContent = "";
    showChat();
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var message = input.value.trim();
    if (!message) return;
    input.value = "";
    addMessage("user", message);

    try {
      var response = await fetch(apiBase + "/api/widget/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteKey: siteKey,
          sessionId: sessionId,
          message: message,
          visitorUrl: location.href,
          visitorName: visitorInfo.name,
          visitorPhone: visitorInfo.phone
        })
      });
      var data = await response.json();
      if (data.sessionId) {
        sessionId = data.sessionId;
        localStorage.setItem(storageKey, sessionId);
      }
      addMessage("bot", data.reply || "تم استلام رسالتك.");
    } catch (error) {
      addMessage("bot", "حدث خطأ في الاتصال. حاول مرة أخرى.");
    }
  });
}());
`;
}

async function handleWidgetMessage(req, res, store) {
  const body = await readJson(req);
  const settings = store.settings;

  if (!body.siteKey || body.siteKey !== settings.widgetSiteKey) {
    sendJson(res, 403, { error: "invalid_site_key", message: "Widget key is not valid." });
    return;
  }

  const sessionId = body.sessionId || id("visitor");
  const message = String(body.message || "").trim();
  if (!message) {
    sendJson(res, 400, { error: "message_required", message: "اكتب رسالة أولا." });
    return;
  }

  const conversation = upsertConversation(store, {
    channel: "widget",
    externalId: sessionId,
    siteKey: body.siteKey,
    visitorName: body.visitorName,
    visitorUrl: body.visitorUrl,
    phone: body.visitorPhone || body.phone
  });
  addMessage(conversation, "user", message, { source: "widget" });

  const botResult = settings.botEnabled
    ? findBotReply(store, message)
    : { reply: "البوت متوقف حاليا. تم استلام رسالتك وسيتم الرد عليك قريبا.", rule: null };

  addMessage(conversation, "bot", botResult.reply, {
    matchedRuleId: botResult.rule ? botResult.rule.id : null
  });
  await saveStore(store);

  sendJson(res, 200, {
    sessionId,
    conversationId: conversation.id,
    reply: botResult.reply,
    matchedRule: botResult.rule ? { id: botResult.rule.id, name: botResult.rule.name } : null
  });
}

async function handleWhatsAppWebhook(req, res, parsedUrl, store) {
  if (req.method === "GET") {
    const mode = parsedUrl.searchParams.get("hub.mode");
    const token = parsedUrl.searchParams.get("hub.verify_token");
    const challenge = parsedUrl.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === store.settings.verifyToken) {
      sendText(res, 200, challenge || "");
      return;
    }

    sendText(res, 403, "Verification failed");
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  const payload = await readJson(req);
  const messages = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      for (const message of value.messages || []) {
        if (message.type === "text" && message.text && message.from) {
          messages.push({
            from: message.from,
            text: message.text.body || "",
            messageId: message.id || "",
            timestamp: message.timestamp || ""
          });
        }
      }
    }
  }

  for (const message of messages) {
    const conversation = upsertConversation(store, {
      channel: "whatsapp",
      externalId: message.from,
      phone: message.from,
      visitorName: message.from
    });
    addMessage(conversation, "user", message.text, {
      source: "whatsapp",
      whatsappMessageId: message.messageId,
      timestamp: message.timestamp
    });

    if (store.settings.botEnabled) {
      const botResult = findBotReply(store, message.text);
      addMessage(conversation, "bot", botResult.reply, {
        matchedRuleId: botResult.rule ? botResult.rule.id : null
      });
      sendWhatsAppText(store, message.from, botResult.reply).catch((error) => {
        console.error("WhatsApp send failed:", error.message);
      });
    }
  }

  if (messages.length > 0) await saveStore(store);
  sendJson(res, 200, { ok: true, processed: messages.length });
}

function listConversations(store) {
  return store.conversations.map((conversation) => ({
    ...conversation,
    messages: conversation.messages || [],
    lastMessage: (conversation.messages || []).slice(-1)[0] || null
  }));
}

function validateRule(body) {
  const keywords = Array.isArray(body.keywords)
    ? body.keywords
    : String(body.keywords || "")
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean);

  if (!String(body.reply || "").trim()) {
    return { error: "نص الرد مطلوب." };
  }

  if (keywords.length === 0) {
    return { error: "أضف كلمة مفتاحية واحدة على الأقل." };
  }

  return {
    rule: {
      name: String(body.name || keywords[0]).trim(),
      keywords,
      reply: String(body.reply).trim(),
      active: body.active === true || body.active === "true" || body.active === "on",
      priority: Number(body.priority || 10),
      matchMode: body.matchMode === "exact" ? "exact" : "contains"
    }
  };
}

async function handleApi(req, res, parsedUrl) {
  const store = await loadStore();
  const pathParts = parsedUrl.pathname.split("/").filter(Boolean).slice(1);
  const route = `/${pathParts.join("/")}`;

  if (route === "/health") {
    sendJson(res, 200, { ok: true, time: now() });
    return;
  }

  if (route === "/widget/message" && req.method === "POST") {
    await handleWidgetMessage(req, res, store);
    return;
  }

  if (route === "/webhook" || route === "/whatsapp/webhook") {
    await handleWhatsAppWebhook(req, res, parsedUrl, store);
    return;
  }

  if (route === "/login" && req.method === "POST") {
    const body = await readJson(req);
    const user = store.users.find(
      (candidate) => candidate.email.toLowerCase() === String(body.email || "").toLowerCase() && candidate.active
    );

    if (!user || !verifyPassword(String(body.password || ""), user.passwordHash)) {
      sendJson(res, 401, { error: "invalid_login", message: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
      return;
    }

    const token = createSessionToken(user, store.appSecret);
    setSessionCookie(res, token);
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  const currentUser = requireAuth(req, res, store);
  if (!currentUser) return;

  if (route === "/logout" && req.method === "POST") {
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (route === "/me" && req.method === "GET") {
    sendJson(res, 200, { user: publicUser(currentUser) });
    return;
  }

  if (route === "/stats" && req.method === "GET") {
    sendJson(res, 200, { stats: stats(store), recentConversations: listConversations(store).slice(0, 6) });
    return;
  }

  if (route === "/settings") {
    if (req.method === "GET") {
      sendJson(res, 200, { settings: publicSettings(store.settings) });
      return;
    }

    if (req.method === "PUT") {
      if (!requireAdmin(currentUser, res)) return;
      const body = await readJson(req);
      store.settings.businessName = String(body.businessName || store.settings.businessName || "").trim();
      store.settings.botEnabled = body.botEnabled === true || body.botEnabled === "true" || body.botEnabled === "on";
      store.settings.fallbackReply = String(body.fallbackReply || "").trim();
      store.settings.widgetSiteKey = String(body.widgetSiteKey || store.settings.widgetSiteKey || "").trim();
      store.settings.verifyToken = String(body.verifyToken || store.settings.verifyToken || "").trim();
      store.settings.phoneNumberId = String(body.phoneNumberId || "").trim();
      store.settings.wabaId = String(body.wabaId || "").trim();
      store.settings.graphVersion = String(body.graphVersion || "v25.0").trim();
      if (String(body.whatsappAccessToken || "").trim()) {
        store.settings.whatsappAccessToken = String(body.whatsappAccessToken).trim();
      }
      await saveStore(store);
      sendJson(res, 200, { settings: publicSettings(store.settings) });
      return;
    }
  }

  if (route === "/settings/env" && req.method === "GET") {
    if (!requireAdmin(currentUser, res)) return;
    const s = store.settings || {};
    const envText = [
      "NODE_ENV=production",
      "PORT=3000",
      `MONGODB_URI=${process.env.MONGODB_URI || ""}`,
      `MONGODB_COLLECTION=${process.env.MONGODB_COLLECTION || "stores"}`,
      `WHATSAPP_VERIFY_TOKEN=${s.verifyToken || ""}`,
      `WHATSAPP_ACCESS_TOKEN=${s.whatsappAccessToken || ""}`,
      `WHATSAPP_PHONE_NUMBER_ID=${s.phoneNumberId || ""}`,
      `WHATSAPP_BUSINESS_ACCOUNT_ID=${s.wabaId || ""}`,
      `WHATSAPP_GRAPH_VERSION=${s.graphVersion || "v25.0"}`,
      `BOOTSTRAP_ADMIN_NAME=${process.env.BOOTSTRAP_ADMIN_NAME || "Admin"}`,
      `BOOTSTRAP_ADMIN_EMAIL=${process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@example.com"}`,
      `BOOTSTRAP_ADMIN_PASSWORD=${process.env.BOOTSTRAP_ADMIN_PASSWORD || "123456"}`,
      `APP_SECRET=${process.env.APP_SECRET || store.appSecret || ""}`,
      "VERCEL=1"
    ].join("\n");
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"dashboard-settings.env\""
    });
    res.end(envText);
    return;
  }

  if (route === "/replies" && req.method === "GET") {
    sendJson(res, 200, { replies: store.rules });
    return;
  }

  if (route === "/replies" && req.method === "POST") {
    const validation = validateRule(await readJson(req));
    if (validation.error) {
      sendJson(res, 400, { error: "invalid_rule", message: validation.error });
      return;
    }
    const createdAt = now();
    const rule = { id: id("rule"), ...validation.rule, createdAt, updatedAt: createdAt };
    store.rules.unshift(rule);
    await saveStore(store);
    sendJson(res, 201, { reply: rule });
    return;
  }

  if (pathParts[0] === "replies" && pathParts[1]) {
    const rule = store.rules.find((item) => item.id === pathParts[1]);
    if (!rule) {
      sendJson(res, 404, { error: "not_found", message: "الرد غير موجود." });
      return;
    }

    if (req.method === "PUT") {
      const validation = validateRule(await readJson(req));
      if (validation.error) {
        sendJson(res, 400, { error: "invalid_rule", message: validation.error });
        return;
      }
      Object.assign(rule, validation.rule, { updatedAt: now() });
      await saveStore(store);
      sendJson(res, 200, { reply: rule });
      return;
    }

    if (req.method === "DELETE") {
      store.rules = store.rules.filter((item) => item.id !== rule.id);
      await saveStore(store);
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  if (route === "/conversations" && req.method === "GET") {
    sendJson(res, 200, { conversations: listConversations(store) });
    return;
  }

  if (pathParts[0] === "conversations" && pathParts[1]) {
    const conversation = store.conversations.find((item) => item.id === pathParts[1]);
    if (!conversation) {
      sendJson(res, 404, { error: "not_found", message: "المحادثة غير موجودة." });
      return;
    }

    if (pathParts[2] === "messages" && req.method === "POST") {
      const body = await readJson(req);
      const text = String(body.text || "").trim();
      if (!text) {
        sendJson(res, 400, { error: "message_required", message: "اكتب رسالة أولا." });
        return;
      }

      addMessage(conversation, "agent", text, { userId: currentUser.id });
      conversation.status = "human";
      await saveStore(store);

      if (conversation.channel === "whatsapp" && conversation.phone) {
        sendWhatsAppText(store, conversation.phone, text).catch((error) => {
          console.error("WhatsApp manual send failed:", error.message);
        });
      }

      sendJson(res, 201, { conversation });
      return;
    }

    if (req.method === "PUT") {
      const body = await readJson(req);
      conversation.status = body.status === "human" ? "human" : "bot";
      conversation.assignedTo = String(body.assignedTo || "").trim();
      conversation.updatedAt = now();
      await saveStore(store);
      sendJson(res, 200, { conversation });
      return;
    }
  }

  if (route === "/users" && req.method === "GET") {
    if (!requireAdmin(currentUser, res)) return;
    sendJson(res, 200, { users: store.users.map(publicUser) });
    return;
  }

  if (route === "/users" && req.method === "POST") {
    if (!requireAdmin(currentUser, res)) return;
    const body = await readJson(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password || !String(body.name || "").trim()) {
      sendJson(res, 400, { error: "invalid_user", message: "الاسم والبريد وكلمة المرور مطلوبة." });
      return;
    }
    if (store.users.some((user) => user.email.toLowerCase() === email)) {
      sendJson(res, 409, { error: "email_exists", message: "هذا البريد موجود بالفعل." });
      return;
    }
    const createdAt = now();
    const user = {
      id: id("user"),
      name: String(body.name).trim(),
      email,
      role: body.role === "agent" ? "agent" : "admin",
      active: body.active !== false && body.active !== "false",
      passwordHash: hashPassword(password),
      createdAt,
      updatedAt: createdAt
    };
    store.users.push(user);
    await saveStore(store);
    sendJson(res, 201, { user: publicUser(user) });
    return;
  }

  if (pathParts[0] === "users" && pathParts[1]) {
    if (!requireAdmin(currentUser, res)) return;
    const user = store.users.find((item) => item.id === pathParts[1]);
    if (!user) {
      sendJson(res, 404, { error: "not_found", message: "المستخدم غير موجود." });
      return;
    }

    if (req.method === "PUT") {
      const body = await readJson(req);
      user.name = String(body.name || user.name).trim();
      user.email = String(body.email || user.email).trim().toLowerCase();
      user.role = body.role === "agent" ? "agent" : "admin";
      user.active = body.active !== false && body.active !== "false";
      if (String(body.password || "").trim()) {
        user.passwordHash = hashPassword(String(body.password).trim());
      }
      user.updatedAt = now();
      await saveStore(store);
      sendJson(res, 200, { user: publicUser(user) });
      return;
    }

    if (req.method === "DELETE") {
      if (user.id === currentUser.id) {
        sendJson(res, 400, { error: "cannot_delete_self", message: "لا يمكنك حذف حسابك الحالي." });
        return;
      }
      store.users = store.users.filter((item) => item.id !== user.id);
      await saveStore(store);
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  if (route === "/install-code" && req.method === "GET") {
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const origin = (process.env.PUBLIC_BASE_URL || `${protocol}://${host}`).replace(/\/$/, "");
    sendJson(res, 200, {
      snippet: `<script src="${origin}/widget.js?key=${store.settings.widgetSiteKey}" defer></script>`,
      webhookUrl: `${origin}/api/webhook`
    });
    return;
  }

  sendJson(res, 404, { error: "not_found", message: "المسار غير موجود." });
}

async function requestHandler(req, res) {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (parsedUrl.pathname === "/widget.js") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      sendText(res, 200, widgetScript(parsedUrl.searchParams.get("key")), "application/javascript; charset=utf-8");
      return;
    }

    if (parsedUrl.pathname === "/api/widget/message") {
      allowWidgetCors(res);
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    if (parsedUrl.pathname.startsWith("/api/")) {
      await handleApi(req, res, parsedUrl);
      return;
    }

    serveStatic(req, res, parsedUrl.pathname);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "server_error", message: "حدث خطأ في السيرفر." });
  }
}

if (require.main === module) {
  loadStore()
    .then(() => {
      http.createServer(requestHandler).listen(PORT, () => {
        console.log(`WhatsApp bot dashboard is running on http://localhost:${PORT}`);
      });
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = requestHandler;
module.exports.requestHandler = requestHandler;
