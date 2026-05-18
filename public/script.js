/* =============================================================
   Domain — slots data & form logic
   ============================================================= */

/** Fallback when GET /api/slots is unavailable (offline dev, DB down). */
const FALLBACK_SLOTS = [
  { id: "s01", title: "Поддержка семьи",                       total: 190000, funded: 0, participant: "" },
  { id: "s02", title: "Краска для стен",                       total: 42000,  funded: 0, participant: "" },
  { id: "s03", title: "Камазы земли для территории",           total: 21000,  funded: 0, participant: "" },
  { id: "s04", title: "Деревья",                               total: 150000, funded: 0, participant: "" },
  { id: "s05", title: "Книги в библиотеку",                    total: 30000,  funded: 0, participant: "" },
  { id: "s06", title: "Гардероб",                              total: 50000,  funded: 0, participant: "" },
  { id: "s07", title: "Баскетбольное кольцо",                  total: 7100,   funded: 0, participant: "" },
  { id: "s08", title: "Шуруповёрт",                            total: 4100,   funded: 0, participant: "" },
  { id: "s09", title: "Расстоечный шкаф для хлеба",            total: 55000,  funded: 0, participant: "" },
  { id: "s10", title: "Барабанная установка",                  total: 21000,  funded: 0, participant: "" },
  { id: "s11", title: "Прожекторы для театра",                 total: 4700,   funded: 0, participant: "" },
  { id: "s12", title: "Театральный занавес",                   total: 20000,  funded: 0, participant: "" },
  { id: "s13", title: "Складные стулья для актового зала",     total: 32000,  funded: 0, participant: "" },
  { id: "s14", title: "Посудомоечная машина",                  total: 45000,  funded: 0, participant: "" }
];

const slots = FALLBACK_SLOTS.map((s) => ({ ...s }));

function mapApiSlot(apiSlot) {
  return {
    id: apiSlot.id,
    title: apiSlot.title,
    total: apiSlot.goal,
    funded: apiSlot.funded,
    participant: "",
  };
}

async function loadSlots() {
  try {
    const response = await fetch("/api/slots", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("slots api unavailable");
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error("empty slots");
    slots.length = 0;
    data.forEach((item) => slots.push(mapApiSlot(item)));
  } catch {
    slots.length = 0;
    FALLBACK_SLOTS.forEach((item) => slots.push({ ...item }));
  }
  renderSlots();
}

const slotsGrid = document.getElementById("slotsGrid");
const slotSelect = document.getElementById("slotSelect");
const supportForm = document.getElementById("supportForm");
const customAmountWrap = document.getElementById("customAmountWrap");
const customAmountInput = document.getElementById("customAmount");
const formMessage = document.getElementById("formMessage");
const amountPresetInputs = document.querySelectorAll('input[name="amountPreset"]');
const frequencyInputs = document.querySelectorAll('input[name="frequency"]');
const offerAcceptedCheckbox = document.getElementById("offerAccepted");
const privacyAcceptedCheckbox = document.getElementById("privacyAccepted");
const recurringConsentWrap = document.getElementById("recurringConsentWrap");
const recurringAcceptedCheckbox = document.getElementById("recurringAccepted");

const LEGAL_VERSION = "2026-05-18";

const rub = (value) => `${value.toLocaleString("ru-RU")} ₽`;

function renderSlots() {
  slotsGrid.innerHTML = "";
  slotSelect.innerHTML = "";

  slots.forEach((slot, index) => {
    const card = document.createElement("article");
    card.className = "slot-card";
    card.dataset.reveal = "";
    card.style.setProperty("--reveal-delay", `${index * 80}ms`);
    const progress = Math.min(Math.round((slot.funded / slot.total) * 100), 100);
    const remainder = Math.max(slot.total - slot.funded, 0);

    card.innerHTML = `
      <h3>${slot.title}</h3>
      <p class="slot-meta"><span>Цель</span><strong>${rub(slot.total)}</strong></p>
      <p class="slot-meta"><span>Собрано</span><strong>${rub(slot.funded)} · ${progress}%</strong></p>
      <p class="slot-meta"><span>Осталось</span><strong>${rub(remainder)}</strong></p>
      <div class="slot-progress"><div class="slot-progress-fill" style="width: ${progress}%"></div></div>
    `;
    slotsGrid.appendChild(card);

    const option = document.createElement("option");
    option.value = slot.id;
    option.textContent = `${slot.title} (осталось ${rub(remainder)})`;
    if (remainder === 0) {
      option.disabled = true;
      option.textContent += " — закрыт";
    }
    slotSelect.appendChild(option);
  });

  attachReveal(slotsGrid.querySelectorAll("[data-reveal]"));
}

function getSelectedAmountPreset() {
  const selected = Array.from(amountPresetInputs).find((item) => item.checked);
  return selected ? selected.value : "500";
}

function getSelectedFrequency() {
  const selected = Array.from(frequencyInputs).find((item) => item.checked);
  return selected ? selected.value : "monthly";
}

function syncCustomAmountVisibility() {
  const isCustom = getSelectedAmountPreset() === "custom";
  customAmountWrap.classList.toggle("hidden", !isCustom);
  customAmountInput.required = isCustom;
}

function syncRecurringConsentVisibility() {
  const isMonthly = getSelectedFrequency() === "monthly";
  recurringConsentWrap.classList.toggle("is-hidden", !isMonthly);
  recurringAcceptedCheckbox.required = isMonthly;
  if (!isMonthly) {
    recurringAcceptedCheckbox.checked = false;
  }
}

amountPresetInputs.forEach((input) => {
  input.addEventListener("change", syncCustomAmountVisibility);
});

frequencyInputs.forEach((input) => {
  input.addEventListener("change", syncRecurringConsentVisibility);
});

/* =============================================================
   Phone — autoformat as user types: (999) 123-45-67
   Stored value (returned by getPhoneDigits) is bare 10 digits.
   ============================================================= */

const phoneInput = document.getElementById("phone");

function formatPhoneDigits(digits) {
  // digits = 0..10 raw digits, no +7
  const a = digits.slice(0, 3);
  const b = digits.slice(3, 6);
  const c = digits.slice(6, 8);
  const d = digits.slice(8, 10);
  let out = "";
  if (a) out += `(${a}`;
  if (a.length === 3) out += `)`;
  if (b) out += ` ${b}`;
  if (c) out += `-${c}`;
  if (d) out += `-${d}`;
  return out;
}

function getPhoneDigits() {
  return (phoneInput.value || "").replace(/\D/g, "").slice(0, 10);
}

if (phoneInput) {
  phoneInput.addEventListener("input", () => {
    let digits = phoneInput.value.replace(/\D/g, "");
    // если пользователь начал вводить и первая цифра 7 или 8 — отрезаем (это код страны)
    if (digits.length > 10 && (digits.startsWith("7") || digits.startsWith("8"))) {
      digits = digits.slice(1);
    }
    digits = digits.slice(0, 10);
    phoneInput.value = formatPhoneDigits(digits);
  });

  // Если пользователь вставил «+7 (999) …» или «8 999 …» — нормализуем
  phoneInput.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text");
    let digits = text.replace(/\D/g, "");
    if (digits.startsWith("7") || digits.startsWith("8")) digits = digits.slice(1);
    digits = digits.slice(0, 10);
    phoneInput.value = formatPhoneDigits(digits);
  });
}

function setFormError(text) {
  formMessage.textContent = text;
  formMessage.classList.add("is-error");
}

function setFormSuccess(text) {
  formMessage.textContent = text;
  formMessage.classList.remove("is-error");
}

supportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormSuccess("");

  const slot = slots.find((item) => item.id === slotSelect.value);
  if (!slot) {
    setFormError("Выберите доступный слот.");
    return;
  }

  const participantName = document.getElementById("participantName").value.trim();
  const email = document.getElementById("email").value.trim();
  const phoneDigits = getPhoneDigits();
  const preset = getSelectedAmountPreset();
  const frequency = getSelectedFrequency();
  const remainder = Math.max(slot.total - slot.funded, 0);

  if (!participantName) {
    setFormError("Укажите ФИО или наименование организации.");
    document.getElementById("participantName").focus();
    return;
  }

  if (!email) {
    setFormError("Укажите email — на него придёт счёт и отчёт.");
    document.getElementById("email").focus();
    return;
  }
  if (!email.includes("@") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setFormError("Email должен содержать знак @ — например, name@example.com.");
    document.getElementById("email").focus();
    return;
  }

  if (phoneDigits.length === 0) {
    setFormError("Укажите телефон для связи.");
    phoneInput.focus();
    return;
  }
  if (phoneDigits.length !== 10) {
    setFormError(
      `В номере не хватает цифр: введено ${phoneDigits.length} из 10. Полный формат: +7 (999) 123-45-67.`
    );
    phoneInput.focus();
    return;
  }

  if (!offerAcceptedCheckbox.checked) {
    setFormError("Для отправки заявки необходимо принять условия Оферты.");
    offerAcceptedCheckbox.focus();
    return;
  }
  if (!privacyAcceptedCheckbox.checked) {
    setFormError("Для отправки заявки необходимо согласие с Политикой обработки персональных данных.");
    privacyAcceptedCheckbox.focus();
    return;
  }
  const isMonthly = frequency === "monthly";
  if (isMonthly && !recurringAcceptedCheckbox.checked) {
    setFormError(
      "Для ежемесячного платежа необходимо согласие на регулярное списание и ознакомление с порядком отмены подписки."
    );
    recurringAcceptedCheckbox.focus();
    return;
  }

  if (remainder === 0) {
    setFormError("Этот слот уже полностью закрыт. Выберите другой.");
    return;
  }

  let paymentAmount;
  if (preset === "custom") {
    paymentAmount = Number(customAmountInput.value);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      setFormError("Введите корректную сумму пожертвования.");
      return;
    }
  } else {
    paymentAmount = Number(preset);
  }

  if (paymentAmount > remainder) {
    setFormError(`Максимальная сумма для этого слота: ${rub(remainder)}.`);
    return;
  }

  // ---- Submit to backend ----
  const submitBtn = supportForm.querySelector('button[type="submit"]');
  const originalHTML = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.classList.add("is-loading");
  submitBtn.innerHTML = '<span>Отправляем…</span>';

  try {
    const response = await fetch("/api/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        slot: slot.id,
        slotTitle: slot.title,
        participantName,
        email,
        phone: `+7${phoneDigits}`,
        amount: paymentAmount,
        frequency,
        offerAccepted: true,
        privacyAccepted: true,
        recurringAccepted: isMonthly && recurringAcceptedCheckbox.checked,
        cancellationTermsAccepted: isMonthly && recurringAcceptedCheckbox.checked,
        offerVersion: LEGAL_VERSION,
        privacyPolicyVersion: LEGAL_VERSION,
        subscriptionTermsVersion: LEGAL_VERSION,
        consentClientTimestamp: new Date().toISOString(),
      }),
    });

    let data = {};
    try { data = await response.json(); } catch { /* non-JSON body */ }

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Не удалось отправить заявку. Попробуйте ещё раз.");
    }

    await loadSlots();

    const pledgeType = frequency === "monthly" ? "ежемесячное" : "разовое";
    setFormSuccess(
      `Принято ${pledgeType} пожертвование на ${rub(paymentAmount)}. Вам на email будет отправлен счёт на оплату. Позже вам будет предоставлен отчёт по реализации слота. Спасибо!`
    );

    supportForm.reset();
    document.querySelector('input[name="amountPreset"][value="500"]').checked = true;
    document.getElementById("freqMonthly").checked = true;
    syncCustomAmountVisibility();
    syncRecurringConsentVisibility();
  } catch (err) {
    setFormError(err.message || "Что-то пошло не так. Попробуйте ещё раз.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove("is-loading");
    submitBtn.innerHTML = originalHTML;
  }
});

/* =============================================================
   Motion — scroll-reveal with stagger
   ============================================================= */

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const revealObserver = "IntersectionObserver" in window
  ? new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "-8% 0px -8% 0px", threshold: 0.05 }
    )
  : null;

function attachReveal(nodes) {
  if (!revealObserver || prefersReducedMotion) {
    nodes.forEach((n) => n.classList.add("is-visible"));
    return;
  }
  nodes.forEach((node) => {
    if (node.dataset.revealDelay) {
      node.style.setProperty("--reveal-delay", `${node.dataset.revealDelay}ms`);
    }
    revealObserver.observe(node);
  });
}

// Stagger children inside reveal-stagger groups
document.querySelectorAll("[data-reveal-stagger]").forEach((group) => {
  Array.from(group.children).forEach((child, idx) => {
    if (!child.hasAttribute("data-reveal")) child.dataset.reveal = "";
    if (!child.dataset.revealDelay) child.dataset.revealDelay = String(idx * 80);
  });
});

attachReveal(document.querySelectorAll("[data-reveal]"));

/* =============================================================
   Hero — cursor spotlight
   ============================================================= */

const hero = document.querySelector("[data-spotlight]");
if (hero && !prefersReducedMotion && window.matchMedia("(pointer: fine)").matches) {
  let frame = 0;
  hero.addEventListener("pointermove", (e) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      const rect = hero.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      hero.style.setProperty("--mx", `${x}%`);
      hero.style.setProperty("--my", `${y}%`);
      frame = 0;
    });
  });
}

/* =============================================================
   Magnetic CTA buttons
   ============================================================= */

if (!prefersReducedMotion && window.matchMedia("(pointer: fine)").matches) {
  document.querySelectorAll("[data-magnetic]").forEach((el) => {
    let frame = 0;
    const STRENGTH = 0.25;
    el.addEventListener("pointermove", (e) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const dx = (e.clientX - (rect.left + rect.width / 2)) * STRENGTH;
        const dy = (e.clientY - (rect.top + rect.height / 2)) * STRENGTH;
        el.style.transform = `translate(${dx}px, ${dy - 1}px)`;
        frame = 0;
      });
    });
    el.addEventListener("pointerleave", () => {
      el.style.transform = "";
    });
  });
}

/* =============================================================
   Animated counters in hero stats
   ============================================================= */

const formatNumber = (n) => Math.round(n).toLocaleString("ru-RU");

function animateCounter(el) {
  const target = Number(el.dataset.counter || 0);
  const suffix = el.dataset.counterSuffix || "";
  if (!target) return;
  if (prefersReducedMotion) {
    el.textContent = formatNumber(target) + suffix;
    return;
  }
  const duration = 1400;
  const start = performance.now();
  const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const value = target * easeOutExpo(t);
    el.textContent = formatNumber(value) + suffix;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

if ("IntersectionObserver" in window) {
  const counterObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.4 }
  );
  document.querySelectorAll("[data-counter]").forEach((el) => counterObserver.observe(el));
} else {
  document.querySelectorAll("[data-counter]").forEach(animateCounter);
}

/* =============================================================
   Init
   ============================================================= */

loadSlots();
syncCustomAmountVisibility();
syncRecurringConsentVisibility();
