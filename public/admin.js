// =============================================================
// Admin frontend — login + applications dashboard
// =============================================================

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const STATUS_LABEL = {
  new: "Новая",
  in_progress: "В работе",
  done: "Закрыто",
  rejected: "Отклонено",
};

const fmtRub = (n) => Number(n || 0).toLocaleString("ru-RU") + " ₽";
const fmtNum = (n) => Number(n || 0).toLocaleString("ru-RU");
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T") + (iso.endsWith("Z") ? "" : "Z"));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};
const escapeHtml = (s) => String(s ?? "").replace(/[<>&"']/g, (c) =>
  ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c])
);

// =============================================================
// Auth flow
// =============================================================

async function checkAuth() {
  try {
    const r = await fetch("/api/auth/me", { credentials: "same-origin" });
    return r.ok;
  } catch {
    return false;
  }
}

function showLogin() {
  $("#loginView").hidden = false;
  $("#dashboardView").hidden = true;
  setTimeout(() => $("#loginUsername")?.focus(), 100);
}

function showDashboard() {
  $("#loginView").hidden = true;
  $("#dashboardView").hidden = false;
  bootstrapDashboard();
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = $("#loginError");
  errEl.textContent = "";
  const submitBtn = e.currentTarget.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  const original = submitBtn.innerHTML;
  submitBtn.innerHTML = '<span>Входим…</span>';

  try {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        username: $("#loginUsername").value,
        password: $("#loginPassword").value,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) {
      throw new Error(data.error || "Не удалось войти.");
    }
    showDashboard();
  } catch (err) {
    errEl.textContent = err.message || "Ошибка входа.";
    $("#loginPassword").focus();
    $("#loginPassword").select();
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = original;
  }
});

$("#logoutBtn")?.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  showLogin();
});

// =============================================================
// Dashboard state
// =============================================================

const state = {
  status: "",
  search: "",
  limit: 50,
  offset: 0,
  total: 0,
};

let searchTimer = null;

async function bootstrapDashboard() {
  await Promise.all([loadStats(), loadApplications()]);
}

// ---- Stats ----
async function loadStats() {
  try {
    const r = await fetch("/api/admin/stats", { credentials: "same-origin" });
    if (r.status === 401) return showLogin();
    if (!r.ok) return;
    const { stats } = await r.json();
    if (!stats) return;
    setStat("total", fmtNum(stats.total));
    setStat("new_count", fmtNum(stats.new_count));
    setStat("in_progress_count", fmtNum(stats.in_progress_count));
    setStat("done_count", fmtNum(stats.done_count));
    setStat("total_amount", fmtRub(stats.total_amount));
    setStat("monthly_amount", fmtRub(stats.monthly_amount));
  } catch (err) {
    console.error("[stats]", err);
  }
}

function setStat(key, value) {
  const el = document.querySelector(`[data-stat="${key}"]`);
  if (el) el.textContent = value;
}

// ---- Applications list ----
async function loadApplications() {
  const tbody = $("#appsTbody");
  tbody.innerHTML = `<tr class="empty"><td colspan="8" class="empty-cell">Загружаем…</td></tr>`;
  try {
    const params = new URLSearchParams();
    if (state.status) params.set("status", state.status);
    if (state.search) params.set("q", state.search);
    params.set("limit", state.limit);
    params.set("offset", state.offset);

    const r = await fetch(`/api/admin/applications?${params}`, { credentials: "same-origin" });
    if (r.status === 401) return showLogin();
    if (!r.ok) throw new Error("Не удалось загрузить заявки.");
    const { items, total } = await r.json();
    state.total = total;
    renderRows(items);
    renderPagination();
  } catch (err) {
    tbody.innerHTML = `<tr class="empty"><td colspan="8" class="empty-cell">Ошибка: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderRows(items) {
  const tbody = $("#appsTbody");
  if (!items.length) {
    tbody.innerHTML = `<tr class="empty"><td colspan="8" class="empty-cell">Заявок пока нет.</td></tr>`;
    return;
  }
  tbody.innerHTML = items.map((app) => `
    <tr data-id="${app.id}">
      <td class="row-date">${escapeHtml(fmtDate(app.created_at))}</td>
      <td>${escapeHtml(app.slot_title)}</td>
      <td class="row-name">${escapeHtml(app.participant_name)}</td>
      <td class="row-email">${escapeHtml(app.email)}</td>
      <td class="num row-amount">${escapeHtml(fmtRub(app.amount))}</td>
      <td>
        <span class="freq-tag ${app.frequency === "monthly" ? "is-monthly" : ""}">
          ${app.frequency === "monthly" ? "Ежемес." : "Разово"}
        </span>
      </td>
      <td>
        <select class="status-select s-${app.status}" data-id="${app.id}" aria-label="Статус заявки">
          ${["new", "in_progress", "done", "rejected"].map((s) => `
            <option value="${s}" ${s === app.status ? "selected" : ""}>${STATUS_LABEL[s]}</option>
          `).join("")}
        </select>
      </td>
      <td class="action">
        ${app.forwarded_to_telegram ? '<span class="tg-tick" title="Отправлено в Telegram">✓</span>' : '<span class="tg-cross" title="Не отправлено в Telegram">·</span>'}
      </td>
    </tr>
  `).join("");

  // Row click → detail
  tbody.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", (e) => {
      if (e.target.closest(".status-select")) return;
      openDetail(Number(tr.dataset.id));
    });
  });

  // Status change
  tbody.querySelectorAll(".status-select").forEach((sel) => {
    sel.addEventListener("click", (e) => e.stopPropagation());
    sel.addEventListener("change", async (e) => {
      const id = Number(sel.dataset.id);
      const status = sel.value;
      const previous = sel.querySelector("option[selected]")?.value;
      // optimistic class update
      sel.className = `status-select s-${status}`;
      try {
        const r = await fetch(`/api/admin/applications/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ status }),
        });
        if (!r.ok) throw new Error("Не удалось сохранить статус.");
        await loadStats();
      } catch (err) {
        // revert
        if (previous) sel.value = previous;
        sel.className = `status-select s-${previous || "new"}`;
        alert(err.message);
      }
    });
  });
}

function renderPagination() {
  const info = $("#paginationInfo");
  const prev = $("#prevPage");
  const next = $("#nextPage");

  const from = state.total === 0 ? 0 : state.offset + 1;
  const to = Math.min(state.offset + state.limit, state.total);
  info.textContent = state.total === 0
    ? "Заявок пока нет"
    : `${from}–${to} из ${state.total}`;

  prev.disabled = state.offset <= 0;
  next.disabled = to >= state.total;
}

$("#prevPage").addEventListener("click", () => {
  state.offset = Math.max(0, state.offset - state.limit);
  loadApplications();
});

$("#nextPage").addEventListener("click", () => {
  state.offset += state.limit;
  loadApplications();
});

// ---- Filters ----
$("#statusPills").addEventListener("click", (e) => {
  const btn = e.target.closest(".pill");
  if (!btn) return;
  $$(".pill", $("#statusPills")).forEach((p) => p.classList.remove("is-active"));
  btn.classList.add("is-active");
  state.status = btn.dataset.status || "";
  state.offset = 0;
  loadApplications();
});

$("#searchInput").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = e.target.value.trim();
    state.offset = 0;
    loadApplications();
  }, 250);
});

// =============================================================
// Detail dialog
// =============================================================

async function openDetail(id) {
  try {
    const r = await fetch(`/api/admin/applications/${id}`, { credentials: "same-origin" });
    if (!r.ok) return;
    const { item: app } = await r.json();
    if (!app) return;
    const dlg = $("#detailDialog");
      $("#detailBody").innerHTML = `
        <h2>${escapeHtml(app.slot_title)}</h2>
        <p class="muted">Заявка №${app.id} · ${escapeHtml(fmtDate(app.created_at))}</p>
        <dl class="detail-grid">
          <dt>Участник</dt><dd>${escapeHtml(app.participant_name)}</dd>
          <dt>Email</dt><dd><a href="mailto:${escapeHtml(app.email)}">${escapeHtml(app.email)}</a></dd>
          <dt>Сумма</dt><dd>${escapeHtml(fmtRub(app.amount))}</dd>
          <dt>Частота</dt><dd>${app.frequency === "monthly" ? "Ежемесячно" : "Разово"}</dd>
          <dt>Слот ID</dt><dd>${escapeHtml(app.slot)}</dd>
          <dt>Статус</dt><dd>${escapeHtml(STATUS_LABEL[app.status] || app.status)}</dd>
          <dt>Telegram</dt><dd>${app.forwarded_to_telegram ? "Отправлено ✓" : "Не отправлено"}</dd>
          <dt>IP</dt><dd>${escapeHtml(app.ip || "—")}</dd>
          <dt>User-Agent</dt><dd style="font-size: 0.8rem; color: var(--ink-muted)">${escapeHtml(app.user_agent || "—")}</dd>
          ${app.notes ? `<dt>Заметки</dt><dd>${escapeHtml(app.notes)}</dd>` : ""}
          <dt>Обновлено</dt><dd>${escapeHtml(fmtDate(app.updated_at))}</dd>
        </dl>
      `;
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  } catch (err) {
    console.error("[detail]", err);
  }
}

// =============================================================
// Boot
// =============================================================

(async function init() {
  const authed = await checkAuth();
  if (authed) showDashboard();
  else showLogin();
})();
