const CONFIG = {
  // 將這裡替換成 Google Apps Script、Make、Zapier 或自家 API endpoint。
  // endpoint 需接受 JSON POST。留空時會保存到瀏覽器 localStorage，方便 CMS 上線前測試。
  endpoint: "https://script.google.com/macros/s/AKfycbxF2BDIxK8rRnJE7gR4gvtmnrB_JSlZyHqxrK2sKDEfPL76cq0zc0j2Ybasnoz6r6AjSw/exec",
  storageKey: "skm_mens_service_room_bookings",
};

const timeSlots = [
  "11:00-12:00",
  "12:00-13:00",
  "13:00-14:00",
  "14:00-15:00",
  "15:00-16:00",
  "16:00-17:00",
  "17:00-18:00",
  "18:00-19:00",
  "19:00-20:00",
  "20:00-21:00",
];

const form = document.querySelector("#bookingForm");
const steps = [...document.querySelectorAll(".form-step")];
const indicators = [...document.querySelectorAll("[data-step-indicator]")];
const prevBtn = document.querySelector("#prevBtn");
const nextBtn = document.querySelector("#nextBtn");
const submitBtn = document.querySelector("#submitBtn");
const introStartBtn = document.querySelector("#introStartBtn");
const brandSelect = document.querySelector("#brandSelect");
const brandOtherField = document.querySelector("#brandOtherField");
const brandOtherInput = document.querySelector("#brandOtherInput");
const message = document.querySelector("#formMessage");
const reviewCard = document.querySelector("#reviewCard");
const recordCount = document.querySelector("#recordCount");
const downloadCsv = document.querySelector("#downloadCsv");
let currentStep = 0;

function init() {
  renderTimeSlots();
  setMinBookingDate();
  updateBrandOtherField();
  updateStep();
  updateRecordCount();
}

function renderTimeSlots() {
  const container = document.querySelector("#timeOptions");
  container.innerHTML = `
    <option value="">請選擇時段</option>
    ${timeSlots.map((slot) => `<option value="${slot}">${slot}</option>`).join("")}
  `;
}

function setMinBookingDate() {
  const dateInput = form.elements.date;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  dateInput.min = tomorrow.toISOString().slice(0, 10);
}

function updateStep() {
  steps.forEach((step, index) => step.classList.toggle("is-active", index === currentStep));
  indicators.forEach((indicator, index) => indicator.classList.toggle("is-active", index === currentStep));
  prevBtn.style.display = currentStep === 0 ? "none" : "inline-flex";
  nextBtn.style.display = currentStep === steps.length - 1 ? "none" : "inline-flex";
  nextBtn.textContent = currentStep === 0 ? "開始預約" : "下一步";
  submitBtn.style.display = currentStep === steps.length - 1 ? "inline-flex" : "none";
  document.body.dataset.step = String(currentStep + 1);
  message.textContent = "";
  message.className = "form-message";
  if (currentStep === steps.length - 1) renderReview();
  requestAnimationFrame(() => {
    steps[currentStep].scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });
}

function validateCurrentStep() {
  const activeStep = steps[currentStep];
  const fields = [...activeStep.querySelectorAll("input, select, textarea")];
  let isValid = true;

  fields.forEach((field) => {
    const valid = field.checkValidity();
    field.classList.toggle("is-invalid", !valid);
    field.closest("label")?.classList.toggle("is-invalid", !valid);
    if (!valid) isValid = false;
  });

  if (currentStep === 2 && brandSelect.value === "其他" && !brandOtherInput.value.trim()) {
    brandOtherInput.classList.add("is-invalid");
    brandOtherInput.closest("label")?.classList.add("is-invalid");
    isValid = false;
  }

  const timeChecked = form.elements.time?.value;
  if (currentStep === 2 && !timeChecked) isValid = false;

  if (!isValid) {
    message.textContent = "請先完成必填欄位，再繼續下一步。";
  }

  return isValid;
}

function getPayload() {
  const data = new FormData(form);
  const brandValue = data.get("brands") === "其他" ? data.get("brandOther")?.trim() : data.get("brands")?.trim();
  return {
    id: `SKMM-${Date.now()}`,
    submittedAt: new Date().toISOString(),
    source: "SKM MEN'S CMS booking page",
    name: data.get("name")?.trim(),
    phone: data.get("phone")?.trim(),
    email: data.get("email")?.trim(),
    referrer: data.get("referrer")?.trim() || "無",
    style: data.get("style")?.trim(),
    brands: brandValue,
    date: data.get("date"),
    time: data.get("time"),
    colorConsult: data.get("colorConsult"),
    notes: data.get("notes")?.trim() || "無",
  };
}

function updateBrandOtherField() {
  const showOther = brandSelect.value === "其他";
  brandOtherField.hidden = !showOther;
  brandOtherInput.required = showOther;
  if (!showOther) {
    brandOtherInput.value = "";
    brandOtherInput.classList.remove("is-invalid");
    brandOtherInput.closest("label")?.classList.remove("is-invalid");
  }
}

function renderReview() {
  const payload = getPayload();
  const rows = [
    ["姓名", payload.name],
    ["手機", payload.phone],
    ["電子郵件", payload.email],
    ["預約日期", payload.date],
    ["預約時段", payload.time],
    ["穿搭風格", payload.style],
    ["喜歡品牌", payload.brands],
    ["色彩鑑定", payload.colorConsult],
    ["介紹人", payload.referrer],
  ];

  reviewCard.innerHTML = `
    <dl class="review-list">
      ${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value || "未填寫")}</dd></div>`).join("")}
    </dl>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readRecords() {
  return JSON.parse(localStorage.getItem(CONFIG.storageKey) || "[]");
}

function saveLocalRecord(payload) {
  const records = readRecords();
  records.push(payload);
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(records));
  updateRecordCount();
}

async function submitBooking(payload) {
  if (!CONFIG.endpoint) {
    saveLocalRecord(payload);
    return { mode: "local" };
  }

  if (CONFIG.endpoint.includes("script.google.com")) {
    await fetch(CONFIG.endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    saveLocalRecord(payload);
    return { mode: "remote" };
  }

  const response = await fetch(CONFIG.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error("submit_failed");
  saveLocalRecord(payload);
  return { mode: "remote" };
}

function updateRecordCount() {
  const count = readRecords().length;
  recordCount.textContent = `目前 ${count} 筆測試紀錄`;
}

function downloadRecordsCsv() {
  const records = readRecords();
  if (!records.length) {
    message.textContent = "目前沒有可匯出的資料。";
    return;
  }

  const headers = Object.keys(records[0]);
  const body = records.map((record) =>
    headers
      .map((header) => {
        const value = String(record[header] ?? "").replaceAll('"', '""');
        return `"${value}"`;
      })
      .join(","),
  );
  const csv = [headers.join(","), ...body].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `skm-mens-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

nextBtn.addEventListener("click", () => {
  if (!validateCurrentStep()) return;
  form.classList.remove("is-backward");
  form.classList.add("is-forward");
  currentStep += 1;
  updateStep();
});

introStartBtn.addEventListener("click", () => {
  form.classList.remove("is-backward");
  form.classList.add("is-forward");
  currentStep = 1;
  updateStep();
});

prevBtn.addEventListener("click", () => {
  form.classList.remove("is-forward");
  form.classList.add("is-backward");
  currentStep -= 1;
  updateStep();
});

form.addEventListener("input", (event) => {
  event.target.classList.remove("is-invalid");
  event.target.closest("label")?.classList.remove("is-invalid");
});

form.addEventListener("change", (event) => {
  event.target.classList.remove("is-invalid");
  event.target.closest("label")?.classList.remove("is-invalid");
  if (event.target === brandSelect) updateBrandOtherField();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateCurrentStep()) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "送出中";

  try {
    const payload = getPayload();
    const result = await submitBooking(payload);
    const successTemplate = document.querySelector("#successTemplate");
    const successNode = successTemplate.content.cloneNode(true);
    const statusText =
      result.mode === "local" ? "測試模式：資料已保存於本機，可用下方 CSV 匯出。" : "資料已成功送出。";
    successNode.querySelector(".success-body").textContent += ` ${statusText}`;
    document.querySelector(".form-panel").classList.add("is-complete");
    form.replaceWith(successNode);
  } catch (error) {
    submitBtn.disabled = false;
    submitBtn.textContent = "送出預約";
    message.textContent = "送出時發生問題，請稍後再試或改撥預約專線。";
  }
});

downloadCsv.addEventListener("click", downloadRecordsCsv);

init();
