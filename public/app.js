const savedTheme = localStorage.getItem("theme") || "dark";
document.documentElement.setAttribute("data-theme", savedTheme);

const state = {
  user: null,
  activeTab: "overview",
  settings: null,
  replies: [],
  users: [],
  conversations: [],
  selectedConversationId: null,
  installSnippet: ""
};

const pageMeta = {
  overview: ["الرئيسية", ""],
  conversations: ["المحادثات", ""],
  replies: ["الردود التلقائية", ""],
  users: ["المستخدمون", ""],
  settings: ["الإعدادات", ""],
  install: ["كود الربط", ""]
};

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function toast(message, type = "info") {
  const node = $("#toast");
  const types = {
    success: { title: "تمت العملية", icon: "✓" },
    error: { title: "تنبيه", icon: "!" },
    info: { title: "إشعار", icon: "i" }
  };
  const meta = types[type] || types.info;

  node.className = `toast toast-${type}`;
  node.innerHTML = `
    <div class="toast-body">
      <span class="toast-icon" aria-hidden="true">${meta.icon}</span>
      <div>
        <p class="toast-title">${meta.title}</p>
        <p class="toast-message">${escapeHtml(message)}</p>
      </div>
      <button class="toast-close" type="button" aria-label="إغلاق">×</button>
    </div>
    <span class="toast-progress" aria-hidden="true"></span>
  `;
  node.classList.add("show");
  clearTimeout(node._timer);
  $(".toast-close", node).addEventListener("click", () => node.classList.remove("show"));
  node._timer = setTimeout(() => node.classList.remove("show"), 4200);
}

async function api(path, options = {}) {
  const request = {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  };

  if (options.body !== undefined) {
    request.headers["Content-Type"] = "application/json";
    request.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, request);
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    if (response.status === 401) showLogin();
    throw new Error(data.message || "حدث خطأ في الاتصال.");
  }

  return data;
}

function showLogin() {
  $("#loginView").classList.remove("hidden");
  $("#appView").classList.add("hidden");
}

function showApp() {
  $("#loginView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  $("#currentUser").textContent = `${state.user.name} - ${state.user.role === "admin" ? "مدير" : "موظف"}`;
  $$(".admin-only").forEach((node) => node.classList.toggle("hidden", state.user.role !== "admin"));
}

async function init() {
  bindEvents();

  try {
    const data = await api("/api/me");
    state.user = data.user;
    showApp();
    await loadSettings();
    await switchTab("overview");
  } catch {
    showLogin();
  }
}

function bindEvents() {
  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: {
          email: form.get("email"),
          password: form.get("password")
        }
      });
      state.user = data.user;
      showApp();
      await loadSettings();
      await switchTab("overview");
      toast("تم تسجيل الدخول بنجاح.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });

  $("#logoutBtn").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    state.user = null;
    showLogin();
  });

  const updateThemeIcon = (theme) => {
    const btn = $("#themeToggleBtn");
    if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
  };
  updateThemeIcon(savedTheme);

  $("#themeToggleBtn").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    updateThemeIcon(next);
  });

  $("#refreshBtn").addEventListener("click", () => loadActiveTab());
  $("#menuBtn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $("#reloadConversationsBtn").addEventListener("click", loadConversations);
  $("#newRuleBtn").addEventListener("click", () => openRuleModal());
  $("#newUserBtn").addEventListener("click", () => openUserModal());
  $("#copySnippetBtn").addEventListener("click", copyInstallSnippet);

  $$(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  document.addEventListener("click", (event) => {
    const tabLink = event.target.closest("[data-tab-link]");
    if (tabLink) {
      switchTab(tabLink.dataset.tabLink);
      return;
    }

    const action = event.target.closest("[data-action]");
    if (!action) return;
    handleAction(action.dataset.action, action.dataset.id);
  });

  $("#quickTestForm").addEventListener("submit", quickTest);
  $("#settingsForm").addEventListener("submit", saveSettings);
}

async function switchTab(tab) {
  state.activeTab = tab;
  $$(".screen").forEach((screen) => screen.classList.add("hidden"));
  $(`#${tab}Screen`).classList.remove("hidden");

  $$(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });

  $("#sidebar").classList.remove("open");
  const meta = pageMeta[tab] || pageMeta.overview;
  $("#pageTitle").textContent = meta[0];
  $("#pageSubtitle").textContent = meta[1];
  await loadActiveTab();
}

async function loadActiveTab() {
  try {
    if (state.activeTab === "overview") await loadOverview();
    if (state.activeTab === "conversations") await loadConversations();
    if (state.activeTab === "replies") await loadReplies();
    if (state.activeTab === "users") await loadUsers();
    if (state.activeTab === "settings") await renderSettings();
    if (state.activeTab === "install") await loadInstallCode();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function loadSettings() {
  const data = await api("/api/settings");
  state.settings = data.settings;
  $("#botStatusText").textContent = state.settings.botEnabled ? "Bot Active" : "Bot Paused";
}

async function loadOverview() {
  const data = await api("/api/stats");
  const stats = data.stats;

  $("#statsGrid").innerHTML = [
    ["إجمالي المحادثات", stats.conversations],
    ["ردود البوت", stats.botReplies],
    ["بانتظار موظف", stats.waiting],
    ["ردود فعالة", stats.activeRules]
  ]
    .map(
      ([label, value]) => `
        <article class="stat-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  $("#recentConversations").innerHTML =
    data.recentConversations.length === 0
      ? `<p>لا توجد محادثات.</p>`
      : data.recentConversations.map(conversationCard).join("");
}

async function quickTest(event) {
  event.preventDefault();
  if (!state.settings) await loadSettings();
  const message = new FormData(event.currentTarget).get("message");
  if (!message.trim()) {
    toast("اكتب رسالة العميل.", "info");
    return;
  }

  try {
    const data = await api("/api/widget/message", {
      method: "POST",
      body: {
        siteKey: state.settings.widgetSiteKey,
        sessionId: `dashboard_test_${Date.now()}`,
        message,
        visitorName: "اختبار لوحة التحكم",
        visitorUrl: location.href
      }
    });
    $("#quickTestOutput").textContent = data.reply;
  } catch (error) {
    $("#quickTestOutput").textContent = error.message;
  }
}

async function loadReplies() {
  const data = await api("/api/replies");
  state.replies = data.replies;
  $("#rulesTable").innerHTML =
    state.replies.length === 0
      ? `<tr><td colspan="6">لا توجد ردود تلقائية.</td></tr>`
      : state.replies.map(ruleRow).join("");
}

function ruleRow(rule) {
  const keywords = (rule.keywords || []).map((keyword) => `<span class="badge gray">${escapeHtml(keyword)}</span>`).join(" ");
  return `
    <tr>
      <td><strong>${escapeHtml(rule.name)}</strong></td>
      <td>${keywords}</td>
      <td>${escapeHtml(rule.reply).slice(0, 130)}${rule.reply.length > 130 ? "..." : ""}</td>
      <td>${Number(rule.priority || 0)}</td>
      <td><span class="badge ${rule.active ? "green" : "gray"}">${rule.active ? "فعال" : "متوقف"}</span></td>
      <td>
        <div class="row-actions">
          <button class="btn secondary" data-action="edit-rule" data-id="${rule.id}" type="button">تعديل</button>
          <button class="btn danger" data-action="delete-rule" data-id="${rule.id}" type="button">حذف</button>
        </div>
      </td>
    </tr>
  `;
}

function openRuleModal(rule = null) {
  openModal(`
    <div class="modal-card">
      <div class="modal-head">
        <h2>${rule ? "تعديل رد تلقائي" : "إضافة رد تلقائي"}</h2>
        <button class="icon-btn" data-action="close-modal" type="button">×</button>
      </div>
      <form id="ruleForm" class="stack">
        <label>
          اسم الرد
          <input name="name" value="${escapeHtml(rule?.name || "")}" required />
        </label>
        <label>
          الكلمات المفتاحية
          <input name="keywords" value="${escapeHtml((rule?.keywords || []).join(", "))}" required />
        </label>
        <label>
          نص الرد أو العرض
          <textarea name="reply" rows="6" required>${escapeHtml(rule?.reply || "")}</textarea>
        </label>
        <div class="settings-grid">
          <label>
            الأولوية
            <input name="priority" type="number" value="${Number(rule?.priority || 10)}" />
          </label>
          <label>
            طريقة المطابقة
            <select name="matchMode">
              <option value="contains" ${rule?.matchMode !== "exact" ? "selected" : ""}>تحتوي على الكلمة</option>
              <option value="exact" ${rule?.matchMode === "exact" ? "selected" : ""}>مطابقة كاملة</option>
            </select>
          </label>
        </div>
        <label class="toggle-row">
          <input name="active" type="checkbox" ${rule?.active === false ? "" : "checked"} />
          الرد فعال
        </label>
        <div class="form-actions">
          <button class="btn secondary" data-action="close-modal" type="button">إلغاء</button>
          <button class="btn primary" type="submit">حفظ</button>
        </div>
      </form>
    </div>
  `);

  $("#ruleForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      name: form.get("name"),
      keywords: form.get("keywords"),
      reply: form.get("reply"),
      priority: form.get("priority"),
      matchMode: form.get("matchMode"),
      active: event.currentTarget.active.checked
    };

    try {
      await api(rule ? `/api/replies/${rule.id}` : "/api/replies", {
        method: rule ? "PUT" : "POST",
        body
      });
      closeModal();
      await loadReplies();
      toast("تم حفظ الرد.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

async function loadConversations() {
  const data = await api("/api/conversations");
  state.conversations = data.conversations;
  if (!state.selectedConversationId && state.conversations[0]) {
    state.selectedConversationId = state.conversations[0].id;
  }
  renderConversations();
}

function renderConversations() {
  $("#conversationList").innerHTML =
    state.conversations.length === 0
      ? `<p>لا توجد محادثات حتى الآن.</p>`
      : state.conversations
          .map(
            (conversation) => `
              <button class="conversation-card ${conversation.id === state.selectedConversationId ? "active" : ""}" data-action="select-conversation" data-id="${conversation.id}" type="button">
                <strong>${escapeHtml(conversation.visitorName || conversation.phone || "زائر")}</strong>
                <span>${escapeHtml(conversation.phone || conversation.externalId || "")}</span>
                <span>${escapeHtml(conversation.lastMessage?.text || "بدون رسائل").slice(0, 90)}</span>
                <span class="conversation-meta">
                  <span>${conversation.channel === "whatsapp" ? "WhatsApp" : "Website"}</span>
                  <span>${formatDate(conversation.updatedAt)}</span>
                </span>
              </button>
            `
          )
          .join("");

  renderConversationDetail();
}

function renderConversationDetail() {
  const conversation = state.conversations.find((item) => item.id === state.selectedConversationId);
  if (!conversation) {
    $("#conversationDetail").innerHTML = `<div class="panel-head"><h2>اختر محادثة</h2></div>`;
    return;
  }

  const messages = (conversation.messages || [])
    .map(
      (message) => {
        let avatar = "";
        let senderName = "";
        if (message.from === "user") {
          avatar = "👤";
          senderName = "العميل";
        } else if (message.from === "bot") {
          avatar = "🤖";
          senderName = "البوت";
        } else {
          avatar = "🧑‍💻";
          senderName = "الموظف";
        }
        return `<div class="message-wrapper ${message.from}"><span class="message-avatar">${avatar}</span><div class="message ${message.from}"><div class="message-text">${escapeHtml(message.text)}</div><small class="message-meta">${senderName} • ${formatDate(message.createdAt)}</small></div></div>`;
      }
    )
    .join("");

  $("#conversationDetail").innerHTML = `
    <div class="chat-head">
      <div class="panel-head">
        <button class="btn secondary mobile-back-btn" data-action="back-to-list" type="button">← عودة</button>
        <div>
          <h2>${escapeHtml(conversation.visitorName || conversation.phone || "زائر")}</h2>
          <p>${escapeHtml([conversation.phone, conversation.visitorUrl].filter(Boolean).join(" - ") || conversation.externalId)}</p>
        </div>
        <span class="badge ${conversation.status === "human" ? "amber" : "green"}">${conversation.status === "human" ? "موظف" : "بوت"}</span>
      </div>
    </div>
    <div class="chat-log">${messages || "<p>لا توجد رسائل.</p>"}</div>
    <form id="sendMessageForm" class="chat-form">
      <input name="text" placeholder="اكتب رد يدوي..." autocomplete="off" />
      <button class="btn primary" type="submit">إرسال</button>
    </form>
  `;

  const chatLog = $(".chat-log", $("#conversationDetail"));
  chatLog.scrollTop = chatLog.scrollHeight;

  $("#sendMessageForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = new FormData(event.currentTarget).get("text");
    if (!text.trim()) return;
    try {
      const data = await api(`/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: { text }
      });
      const index = state.conversations.findIndex((item) => item.id === conversation.id);
      state.conversations[index] = data.conversation;
      renderConversations();
      toast("تم إرسال الرد.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

async function loadUsers() {
  if (state.user.role !== "admin") {
    toast("إدارة المستخدمين متاحة للمدير فقط.", "error");
    await switchTab("overview");
    return;
  }
  const data = await api("/api/users");
  state.users = data.users;
  $("#usersTable").innerHTML = state.users.map(userRow).join("");
}

function userRow(user) {
  return `
    <tr>
      <td><strong>${escapeHtml(user.name)}</strong></td>
      <td>${escapeHtml(user.email)}</td>
      <td>${user.role === "admin" ? "مدير" : "موظف"}</td>
      <td><span class="badge ${user.active ? "green" : "gray"}">${user.active ? "نشط" : "متوقف"}</span></td>
      <td>
        <div class="row-actions">
          <button class="btn secondary" data-action="edit-user" data-id="${user.id}" type="button">تعديل</button>
          <button class="btn danger" data-action="delete-user" data-id="${user.id}" type="button">حذف</button>
        </div>
      </td>
    </tr>
  `;
}

function openUserModal(user = null) {
  openModal(`
    <div class="modal-card">
      <div class="modal-head">
        <h2>${user ? "تعديل مستخدم" : "إضافة مستخدم"}</h2>
        <button class="icon-btn" data-action="close-modal" type="button">×</button>
      </div>
      <form id="userForm" class="stack">
        <label>
          الاسم
          <input name="name" value="${escapeHtml(user?.name || "")}" required />
        </label>
        <label>
          البريد الإلكتروني
          <input name="email" type="text" value="${escapeHtml(user?.email || "")}" required />
        </label>
        <label>
          كلمة المرور
          <input name="password" type="password" ${user ? 'placeholder="كلمة مرور جديدة"' : "required"} />
        </label>
        <label>
          الدور
          <select name="role">
            <option value="admin" ${user?.role === "admin" ? "selected" : ""}>مدير</option>
            <option value="agent" ${user?.role === "agent" ? "selected" : ""}>موظف</option>
          </select>
        </label>
        <label class="toggle-row">
          <input name="active" type="checkbox" ${user?.active === false ? "" : "checked"} />
          الحساب نشط
        </label>
        <div class="form-actions">
          <button class="btn secondary" data-action="close-modal" type="button">إلغاء</button>
          <button class="btn primary" type="submit">حفظ</button>
        </div>
      </form>
    </div>
  `);

  $("#userForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(user ? `/api/users/${user.id}` : "/api/users", {
        method: user ? "PUT" : "POST",
        body: {
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          role: form.get("role"),
          active: event.currentTarget.active.checked
        }
      });
      closeModal();
      await loadUsers();
      toast("تم حفظ المستخدم.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

async function renderSettings() {
  await loadSettings();
  const form = $("#settingsForm");
  form.businessName.value = state.settings.businessName || "";
  form.widgetSiteKey.value = state.settings.widgetSiteKey || "";
  form.verifyToken.value = state.settings.verifyToken || "";
  form.phoneNumberId.value = state.settings.phoneNumberId || "";
  form.wabaId.value = state.settings.wabaId || "";
  form.graphVersion.value = state.settings.graphVersion || "v25.0";
  form.fallbackReply.value = state.settings.fallbackReply || "";
  form.botEnabled.checked = Boolean(state.settings.botEnabled);
  form.whatsappAccessToken.value = "";
  $("#maskedToken").textContent = state.settings.whatsappAccessTokenMasked
    ? `Access Token: ${state.settings.whatsappAccessTokenMasked}`
    : "Access Token غير محفوظ.";

  const exportBtn = $("#exportEnvBtn");
  if (exportBtn) {
    exportBtn.href = "/api/settings/env";
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    const result = await api("/api/settings", {
      method: "PUT",
      body: {
        businessName: data.get("businessName"),
        widgetSiteKey: data.get("widgetSiteKey"),
        verifyToken: data.get("verifyToken"),
        phoneNumberId: data.get("phoneNumberId"),
        wabaId: data.get("wabaId"),
        graphVersion: data.get("graphVersion"),
        whatsappAccessToken: data.get("whatsappAccessToken"),
        fallbackReply: data.get("fallbackReply"),
        botEnabled: form.botEnabled.checked
      }
    });
    state.settings = result.settings;
    toast("تم حفظ الإعدادات.", "success");
    await renderSettings();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function loadInstallCode() {
  await loadSettings();
  const data = await api("/api/install-code");
  state.installSnippet = data.snippet;
  $("#installSnippet").textContent = data.snippet;
  $("#webhookUrl").textContent = data.webhookUrl;
  $("#installVerifyToken").textContent = state.settings.verifyToken;
}

async function copyInstallSnippet() {
  if (!state.installSnippet) await loadInstallCode();
  try {
    await navigator.clipboard.writeText(state.installSnippet);
    toast("تم نسخ كود الربط.", "success");
  } catch {
    toast("انسخ الكود يدويا من الصندوق.", "info");
  }
}

function conversationCard(conversation) {
  const name = conversation.visitorName || conversation.phone || "زائر";
  const last = conversation.lastMessage?.text || "بدون رسائل";
  return `
    <article class="conversation-card">
      <strong>${escapeHtml(name)}</strong>
      <span>${escapeHtml(conversation.phone || conversation.externalId || "")}</span>
      <span>${escapeHtml(last).slice(0, 110)}</span>
      <span class="conversation-meta">
        <span>${conversation.channel === "whatsapp" ? "WhatsApp" : "Website"}</span>
        <span>${formatDate(conversation.updatedAt)}</span>
      </span>
    </article>
  `;
}

async function handleAction(action, id) {
  if (action === "close-modal") {
    closeModal();
    return;
  }

  if (action === "edit-rule") {
    openRuleModal(state.replies.find((rule) => rule.id === id));
    return;
  }

  if (action === "delete-rule") {
    if (!confirm("حذف هذا الرد التلقائي؟")) return;
    try {
      await api(`/api/replies/${id}`, { method: "DELETE" });
      await loadReplies();
      toast("تم حذف الرد.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
    return;
  }

  if (action === "select-conversation") {
    state.selectedConversationId = id;
    renderConversations();
    const chatLayout = $(".chat-layout");
    if (chatLayout) chatLayout.classList.add("chat-active");
    return;
  }

  if (action === "back-to-list") {
    const chatLayout = $(".chat-layout");
    if (chatLayout) chatLayout.classList.remove("chat-active");
    return;
  }

  if (action === "edit-user") {
    openUserModal(state.users.find((user) => user.id === id));
    return;
  }

  if (action === "delete-user") {
    if (!confirm("حذف هذا المستخدم؟")) return;
    try {
      await api(`/api/users/${id}`, { method: "DELETE" });
      await loadUsers();
      toast("تم حذف المستخدم.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  }
}

function openModal(html) {
  const modal = $("#modal");
  modal.innerHTML = html;
  modal.classList.remove("hidden");
}

function closeModal() {
  const modal = $("#modal");
  modal.classList.add("hidden");
  modal.innerHTML = "";
}

init();
