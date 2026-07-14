/* global pdfjsLib, Tesseract */
"use strict";

pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";

const state = {
  passengers: [],
  selected: [],
  query: "",
  flightNumber: "",
  manifestExpectedCount: 0
};

const elements = {
  input: document.getElementById("pdf-input"),
  choose: document.getElementById("choose-file"),
  dropZone: document.getElementById("drop-zone"),
  fileStatus: document.getElementById("file-status"),
  search: document.getElementById("passenger-search"),
  clearSearch: document.getElementById("clear-search"),
  toggleBulkMatch: document.getElementById("toggle-bulk-match"),
  bulkMatchPanel: document.getElementById("bulk-match-panel"),
  bulkMatchInput: document.getElementById("bulk-match-input"),
  bulkMatchRun: document.getElementById("bulk-match-run"),
  bulkMatchClear: document.getElementById("bulk-match-clear"),
  bulkMatchResult: document.getElementById("bulk-match-result"),
  sourceList: document.getElementById("source-list"),
  selectedList: document.getElementById("selected-list"),
  message: document.getElementById("message-output"),
  totalCount: document.getElementById("total-count"),
  visibleCount: document.getElementById("visible-count"),
  selectedCount: document.getElementById("selected-count"),
  send: document.getElementById("send-whatsapp"),
  copy: document.getElementById("copy-message"),
  clearSelected: document.getElementById("clear-selected"),
  reset: document.getElementById("reset-all"),
  addManual: document.getElementById("add-manual"),
  alerts: document.getElementById("report-alerts"),
  alertsCount: document.getElementById("alerts-count"),
  imageImportPanel: document.getElementById("image-import-panel"),
  toggleImageImport: document.getElementById("toggle-image-import"),
  systemImageInput: document.getElementById("system-image-input"),
  chooseSystemImage: document.getElementById("choose-system-image"),
  analyzeSystemImage: document.getElementById("analyze-system-image"),
  systemImagePreviewWrap: document.getElementById("system-image-preview-wrap"),
  systemImagePreview: document.getElementById("system-image-preview"),
  ocrMatchFlash: document.getElementById("ocr-match-flash"),
  ocrStatus: document.getElementById("ocr-status"),
  ocrProgress: document.getElementById("ocr-progress-bar"),
  toast: document.getElementById("toast")
};

let searchClearTimer = null;
let systemImageFile = null;
let systemImageUrl = "";
let ocrIsAnalyzing = false;
let ocrAutoTimer = null;
let ocrMatchFlashTimer = null;

function normalize(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[،/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePassport(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function splitPassportValues(value) {
  return String(value || "")
    .toUpperCase()
    .split(/[\/،,\s]+/)
    .map(normalizePassport)
    .filter(Boolean);
}

function joinPassports(values) {
  const uniquePassports = [];
  values.forEach(value => {
    const passport = normalizePassport(value);
    if (passport && !uniquePassports.includes(passport)) uniquePassports.push(passport);
  });
  return uniquePassports.join("/");
}

function comparableOcrText(value) {
  return normalizePassport(value)
    .replace(/[OQD]/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/S/g, "5")
    .replace(/Z/g, "2")
    .replace(/G/g, "6");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function reportName(rawName) {
  const [surname = "", givenNames = ""] = rawName.split("/");
  const firstGivenName = givenNames.trim().split(/\s+/)[0] || "";
  return `${surname.trim()}, ${firstGivenName}`.replace(/\s+/g, " ").trim();
}

function parsePassengerLines(lines) {
  const passengers = [];
  // المقعد غالبًا رقمي مثل 034C، لكنه قد يأتي كرمز تشغيلي مثل JPX1.
const passengerPattern = /^(\d+)\.(.*?)\s+(?:(?:MR|MRS|MS|MISS|MSTR|PRCS)\s+)?[A-Z]\s+[A-Z]{3}\s+[A-Z]{3}\s+\S+\s+[A-Z]\s+([A-Z0-9]{2,5})$/i;
  const passportPattern = /^([A-Z]{3})\s+([A-Z0-9<]{5,})(?:\s|$)/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/\s+/g, " ").trim();
    const match = line.match(passengerPattern);
    if (!match) continue;

    const passports = [];
    let nationality = "";

    for (let next = index + 1; next < Math.min(lines.length, index + 5); next += 1) {
      const candidate = lines[next].replace(/\s+/g, " ").trim();
      if (/^\d+\./.test(candidate)) break;
      const passportMatch = candidate.match(passportPattern);
      if (passportMatch) {
        if (!nationality) nationality = passportMatch[1].toUpperCase();
        passports.push(passportMatch[2]);
      }
    }

    const passport = joinPassports(passports);
    passengers.push({
      id: `pdf-${match[1]}-${passport || index}`,
      sourceNumber: Number(match[1]),
      name: reportName(match[2].toUpperCase()),
      seat: match[3].toUpperCase(),
      passport,
      nationality
    });
  }

  return passengers;
}

function parseInkCloudPassengerLines(lines) {
  const passengers = [];
  const passengerPattern =
    /^(.+?)(MASTER|MRS|MISS|MSTR|MR|MS)\s+([A-Z0-9-]{1,5})\s+([A-Z]{3})\s+([A-Z0-9#/]+)\s+([A-Z]{3})-([A-Z]{3})$/i;

  lines.forEach(lineValue => {
    const line = lineValue.replace(/\s+/g, " ").trim();
    const match = line.match(passengerPattern);
    if (!match) return;

    const passport = joinPassports(match[5].split("/").map(value => value.replace(/#+$/, "")));
    passengers.push({
      id: `ink-${passengers.length + 1}-${passport}`,
      sourceNumber: passengers.length + 1,
      name: reportName(match[1].toUpperCase()),
      seat: match[3].toUpperCase(),
      passport,
      nationality: match[4].toUpperCase()
    });
  });

  return passengers;
}

function extractFlightNumber(lines) {
  for (const line of lines.slice(0, 25)) {
    const match = line.toUpperCase().match(/\b([A-Z]{2}\d{2,4})\b/);
    if (match) return match[1];
  }
  return "";
}

function extractManifestExpectedCount(lines) {
  const subtotalCount = lines.reduce((total, line) => {
    const match = line.replace(/\s+/g, " ").trim().match(/^Subtotal\s+(\d+)\s+Passengers\b/i);
    return total + (match ? Number(match[1]) : 0);
  }, 0);

  if (subtotalCount) return subtotalCount;

  for (const line of lines.slice(0, 30)) {
    const match = line.replace(/\s+/g, " ").trim().match(/\bCKI Counts\s*:\s*F(\d+)\s+J(\d+)\s+W(\d+)\s+Y(\d+)/i);
    if (match) {
      return match.slice(1).reduce((total, value) => total + Number(value), 0);
    }
  }

  return 0;
}

function linesFromTextContent(textContent) {
  const rows = [];

  textContent.items.forEach(item => {
    const text = item.str.trim();
    if (!text) return;
    const x = item.transform[4];
    const y = item.transform[5];
    let row = rows.find(entry => Math.abs(entry.y - y) < 2);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x, text });
  });

  return rows
    .sort((a, b) => b.y - a.y)
    .map(row => row.items.sort((a, b) => a.x - b.x).map(item => item.text).join(" "))
    .filter(Boolean);
}

async function extractPassengers(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const allLines = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    elements.fileStatus.textContent = `جاري قراءة الصفحة ${pageNumber} من ${pdf.numPages}...`;
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    allLines.push(...linesFromTextContent(textContent));
  }

  const alteaPassengers = parsePassengerLines(allLines);
  const inkCloudPassengers = parseInkCloudPassengerLines(allLines);

  return {
    passengers: inkCloudPassengers.length > alteaPassengers.length
      ? inkCloudPassengers
      : alteaPassengers,
    flightNumber: extractFlightNumber(allLines),
    manifestExpectedCount: extractManifestExpectedCount(allLines)
  };
}

async function handleFile(file) {
  if (!file || (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))) {
    showToast("يرجى اختيار ملف PDF صحيح.");
    return;
  }

  elements.dropZone.classList.remove("dragging");
  elements.choose.disabled = true;
  elements.fileStatus.textContent = `جاري فتح ${file.name}...`;

  try {
    const report = await extractPassengers(file);
    const passengers = report.passengers;
    if (!passengers.length) {
      throw new Error("لم يتم العثور على ركاب بالنمط المتوقع داخل الملف.");
    }
    state.passengers = passengers;
    state.selected = [];
    state.query = "";
    state.flightNumber = report.flightNumber;
    state.manifestExpectedCount = report.manifestExpectedCount;
    elements.search.value = "";
    const flightLabel = state.flightNumber ? ` - الرحلة ${state.flightNumber}` : "";
    const countLabel = state.manifestExpectedCount
      ? ` من أصل ${state.manifestExpectedCount}`
      : "";
    elements.fileStatus.textContent = `${file.name}${flightLabel} - تم استخراج ${passengers.length}${countLabel} راكب بنجاح`;
    updateOcrAvailability();
    render();
    showToast(`تم استخراج ${passengers.length} راكب.`);
    if (systemImageFile) scheduleAutoOcr();
  } catch (error) {
    console.error(error);
    elements.fileStatus.textContent = "تعذر قراءة البيان. تأكد أن الملف بنفس تنسيق تقرير Altea.";
    showToast(error.message || "حدث خطأ أثناء قراءة PDF.");
  } finally {
    elements.choose.disabled = false;
    elements.input.value = "";
  }
}

function updateOcrAvailability() {
  elements.analyzeSystemImage.disabled = !(systemImageFile && state.passengers.length) || ocrIsAnalyzing;
  if (!state.passengers.length) {
    elements.ocrStatus.textContent = "أرفق بيان PDF أولًا، ثم اختر صورة النظام.";
  } else if (!systemImageFile) {
    elements.ocrStatus.textContent = "تم تجهيز قائمة الركاب. اختر الآن صورة نظام الجوازات.";
  }
}

function scheduleAutoOcr() {
  clearTimeout(ocrAutoTimer);
  if (!systemImageFile || !state.passengers.length || ocrIsAnalyzing) return;
  ocrAutoTimer = setTimeout(() => {
    analyzeSystemImage({ automatic: true });
  }, 250);
}

function showOcrMatchesFlash(matches, addedCount) {
  clearTimeout(ocrMatchFlashTimer);

  if (!elements.ocrMatchFlash) return;

  if (!matches.length) {
    elements.ocrMatchFlash.innerHTML = `
      <div class="ocr-match-flash-card is-empty">
        <strong>لم يتم العثور على ركاب مطابقين</strong>
        <span>جرّب صورة أوضح أو قريبة من عمود أرقام الجوازات.</span>
      </div>
    `;
  } else {
    const preview = matches.slice(0, 6).map(passenger => `
      <span class="ocr-match-pill">
        <strong>${escapeHtml(passenger.name)}</strong>
        <small>P/${escapeHtml(passenger.passport || "غير متوفر")}</small>
      </span>
    `).join("");
    const extra = matches.length > 6 ? `<em>+${matches.length - 6} آخرين</em>` : "";
    elements.ocrMatchFlash.innerHTML = `
      <div class="ocr-match-flash-card">
        <div>
          <strong>تمت المطابقة مؤقتًا</strong>
          <span>${matches.length} مطابق / ${addedCount} جديد</span>
        </div>
        <div class="ocr-match-pills">${preview}${extra}</div>
      </div>
    `;
  }

  elements.ocrMatchFlash.classList.add("is-visible");
  ocrMatchFlashTimer = setTimeout(() => {
    elements.ocrMatchFlash.classList.remove("is-visible");
    setTimeout(() => {
      if (!elements.ocrMatchFlash.classList.contains("is-visible")) {
        elements.ocrMatchFlash.innerHTML = "";
      }
    }, 350);
  }, 6500);
}

function setSystemImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    showToast("يرجى اختيار صورة صحيحة بصيغة PNG أو JPG.");
    return;
  }

  if (systemImageUrl) URL.revokeObjectURL(systemImageUrl);
  systemImageFile = file;
  systemImageUrl = URL.createObjectURL(file);
  elements.systemImagePreview.src = systemImageUrl;
  elements.systemImagePreviewWrap.classList.remove("is-empty");
  elements.ocrProgress.style.width = "0";
  elements.ocrStatus.textContent = state.passengers.length
    ? `الصورة جاهزة: ${file.name} - سيبدأ التحليل تلقائيًا...`
    : "تم اختيار الصورة. أرفق بيان PDF قبل التحليل.";
  updateOcrAvailability();
  scheduleAutoOcr();
}

async function analyzeSystemImage(options = {}) {
  if (!systemImageFile || !state.passengers.length) {
    showToast("أرفق بيان PDF وصورة النظام أولًا.");
    return;
  }
  if (ocrIsAnalyzing) return;

  ocrIsAnalyzing = true;
  elements.analyzeSystemImage.disabled = true;
  elements.chooseSystemImage.disabled = true;
  elements.ocrProgress.style.width = "2%";
  elements.ocrStatus.textContent = options.automatic
    ? "تم استلام الصورة، جاري تحليلها تلقائيًا..."
    : "جاري تجهيز محرك قراءة الصورة...";

  let worker;
  try {
    let enhancedImage = null;
    const getEnhancedImage = async () => enhancedImage || (enhancedImage = await enhanceFullImage(systemImageFile));

    const ocrPasses = [
      { label: "قراءة الصورة الأصلية", rotateAuto: true, getSource: async () => systemImageFile },
      { label: "تحسين التباين وإزالة خطوط الجدول", getSource: getEnhancedImage },
      { label: "معالجة متقدمة للصورة الملتقطة", getSource: async () => createAdaptiveThresholdCanvas(await getEnhancedImage()) }
    ];
    let currentPass = 0;

    worker = await Tesseract.createWorker("eng", 1, {
      workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
      langPath: "https://tessdata.projectnaptha.com/4.0.0_fast",
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5",
      logger: message => {
        const sourceProgress = message.progress || 0;
        const overallProgress = Math.round(((currentPass + sourceProgress) / ocrPasses.length) * 100);
        elements.ocrProgress.style.width = `${Math.max(2, overallProgress)}%`;
        if (message.status === "recognizing text") {
          elements.ocrStatus.textContent =
            `${ocrPasses[currentPass]?.label || "تحليل الصورة"}... ${overallProgress}%`;
        }
      }
    });

    // مسافة وفاصلة مطلوبتان لقراءة الأسماء (وليس أرقام الجوازات فقط)، والمطابقة تتجاهل علامات الترقيم أصلاً.
    await worker.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/,.:- ",
      preserve_interword_spaces: "1",
      user_defined_dpi: "300"
    });

    let matches = [];
    for (currentPass = 0; currentPass < ocrPasses.length; currentPass += 1) {
      const source = await ocrPasses[currentPass].getSource();
      const words = await ocrWordsFromSource(worker, source, {
        rotateAuto: !!ocrPasses[currentPass].rotateAuto
      });
      const rowTexts = groupWordsIntoRows(words);
      // البحث عن رقم الجواز أولًا، ثم عن الاسم لأي راكب لم يُطابق برقم الجواز.
      matches = matchPassengersFromBulkText(rowTexts.join("\n"));
      if (matches.length) break;
    }

    let added = 0;
    matches.forEach(passenger => {
      if (!state.selected.some(selected => selected.id === passenger.id)) {
        state.selected.push({ ...passenger });
        added += 1;
      }
    });

    elements.ocrProgress.style.width = "100%";
    elements.ocrStatus.textContent = matches.length
      ? `تمت مطابقة ${matches.length} راكب وإضافة ${added} جديد إلى القائمة المختارة.`
      : "لم يتم العثور على راكب مطابق. جرّب صورة أوضح أو أقرب للجدول.";
    render();
    showOcrMatchesFlash(matches, added);
    showToast(matches.length ? `تم اختيار ${added} راكب من الصورة.` : "لم توجد مطابقات في الصورة.");
  } catch (error) {
    console.error("OCR error:", error);
    elements.ocrProgress.style.width = "0";
    elements.ocrStatus.textContent = "تعذر تحليل الصورة. تحقق من الاتصال ووضوح الصورة ثم حاول مجددًا.";
    showToast("حدث خطأ أثناء تحليل الصورة.");
  } finally {
    if (worker) await worker.terminate();
    ocrIsAnalyzing = false;
    elements.chooseSystemImage.disabled = false;
    updateOcrAvailability();
  }
}

function filteredPassengers() {
  const query = normalize(state.query);
  if (!query) return state.passengers;
  return state.passengers.filter(passenger =>
    normalize(`${passenger.name} ${passenger.passport} ${passenger.seat} ${passenger.nationality}`).includes(query)
  );
}

function extractPassportTokensFromText(text) {
  return splitPassportValues(text).filter(token => token.length >= 5 && /\d/.test(token));
}

function matchPassengerByPassportToken(token) {
  const compactToken = comparableOcrText(token);
  return state.passengers.find(passenger =>
    splitPassportValues(passenger.passport).some(passport => {
      if (passport === token) return true;
      const compactPassport = comparableOcrText(passport);
      if (compactPassport.length < 5 || compactToken.length < 5) return false;
      return compactPassport === compactToken || compactPassport.slice(-5) === compactToken.slice(-5);
    })
  );
}

function matchPassengersByNameLine(line) {
  const normalizedLine = normalize(line);
  if (normalizedLine.length < 3) return [];
  return state.passengers.filter(passenger => {
    const [surname = "", givenNames = ""] = passenger.name.split(",");
    const surnameNorm = normalize(surname);
    const givenNorm = normalize(givenNames).split(" ").filter(Boolean)[0] || "";
    if (!surnameNorm) return false;
    return givenNorm
      ? normalizedLine.includes(surnameNorm) && normalizedLine.includes(givenNorm)
      : normalizedLine.includes(surnameNorm);
  });
}

function matchPassengersFromBulkText(text) {
  const matched = new Map();
  const addMatch = passenger => {
    if (passenger && !matched.has(passenger.id)) matched.set(passenger.id, passenger);
  };

  extractPassportTokensFromText(text).forEach(token => addMatch(matchPassengerByPassportToken(token)));

  String(text || "").split(/\r?\n/).forEach(line => {
    if (line.trim()) matchPassengersByNameLine(line).forEach(addMatch);
  });

  return [...matched.values()];
}

function addPassenger(id) {
  if (state.selected.some(passenger => passenger.id === id)) return;
  const passenger = state.passengers.find(item => item.id === id);
  if (!passenger) return;
  state.selected.push({ ...passenger });
  render();

  if (state.query.trim()) {
    const queryAtSelection = state.query;
    clearTimeout(searchClearTimer);
    searchClearTimer = setTimeout(() => {
      if (state.query === queryAtSelection) {
        state.query = "";
        elements.search.value = "";
        renderSource();
      }
    }, 1000);
  }
}

function removePassenger(id) {
  state.selected = state.selected.filter(passenger => passenger.id !== id);
  render();
}

function movePassenger(id, direction) {
  const index = state.selected.findIndex(passenger => passenger.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.selected.length) return;
  [state.selected[index], state.selected[target]] = [state.selected[target], state.selected[index]];
  render();
}

function updatePassenger(id, field, value) {
  const passenger = state.selected.find(item => item.id === id);
  if (!passenger) return;
  passenger[field] = value.toUpperCase();
  renderMessage();
}

function renderSource() {
  const passengers = filteredPassengers();
  elements.visibleCount.textContent = passengers.length;

  if (!state.passengers.length) {
    elements.sourceList.innerHTML = `
      <div class="empty-state">
        <span>📄</span><strong>لم يتم إرفاق بيان بعد</strong>
        <p>ستظهر هنا أسماء الركاب فور قراءة ملف PDF.</p>
      </div>`;
    return;
  }

  if (!passengers.length) {
    elements.sourceList.innerHTML = `
      <div class="empty-state">
        <span>⌕</span><strong>لا توجد نتائج مطابقة</strong>
        <p>جرّب الاسم أو رقم الجواز أو رقم المقعد.</p>
      </div>`;
    return;
  }

  elements.sourceList.innerHTML = passengers.map(passenger => {
    const selected = state.selected.some(item => item.id === passenger.id);
    return `
      <div class="passenger-row ${selected ? "is-selected" : ""}" data-add-id="${escapeHtml(passenger.id)}">
        <span class="row-index">${passenger.sourceNumber}</span>
        <div class="passenger-main">
          <div class="passenger-name">${escapeHtml(passenger.name)}</div>
          <div class="passenger-meta">
            <span>P/${escapeHtml(passenger.passport || "غير متوفر")}</span>
            <span>${escapeHtml(passenger.nationality)}</span>
          </div>
        </div>
        ${selected ? '<span class="seat-badge">تمت الإضافة</span>' : `<span class="seat-badge">${escapeHtml(passenger.seat)}</span><span class="add-mark">＋</span>`}
      </div>`;
  }).join("");
}

function renderSelected() {
  if (!state.selected.length) {
    elements.selectedList.innerHTML = `
      <div class="empty-state">
        <span>👤</span><strong>القائمة فارغة</strong>
        <p>اختر الركاب من القائمة الأولى.</p>
      </div>`;
    return;
  }

  elements.selectedList.innerHTML = state.selected.map((passenger, index) => `
    <div class="passenger-row selected-row">
      <span class="row-index">${index + 1}</span>
      <div class="edit-fields">
        <input value="${escapeHtml(passenger.name)}" data-edit-id="${escapeHtml(passenger.id)}" data-field="name" aria-label="اسم الراكب">
        <input value="${escapeHtml(passenger.passport)}" data-edit-id="${escapeHtml(passenger.id)}" data-field="passport" aria-label="رقم الجواز" placeholder="الجواز">
        <input value="${escapeHtml(passenger.seat)}" data-edit-id="${escapeHtml(passenger.id)}" data-field="seat" aria-label="المقعد" placeholder="المقعد">
      </div>
      <div class="row-actions">
        <button class="icon-button" data-move-id="${escapeHtml(passenger.id)}" data-direction="-1" title="تحريك لأعلى">↑</button>
        <button class="icon-button" data-move-id="${escapeHtml(passenger.id)}" data-direction="1" title="تحريك لأسفل">↓</button>
        <button class="icon-button remove" data-remove-id="${escapeHtml(passenger.id)}" title="حذف">×</button>
      </div>
    </div>`).join("");
}

function messageText() {
  if (!state.selected.length) return "";

  const passengerLines = state.selected.map((passenger, index) =>
    `${index + 1}. ${passenger.name.trim()} ${passenger.seat.trim()}\n   P/${passenger.passport.trim()}`
  ).join("\n");

  return `الركاب المتبقين على رحلة (${state.flightNumber}) في نظام الجوازات\n\n${passengerLines}\n\nاشعارنا فوراً عند وصول اي راكب على البوابة`;
}

async function ocrWordsFromSource(worker, source, options = {}) {
  await worker.setParameters({ tessedit_pageseg_mode: options.pageMode || "11" });
  const result = await worker.recognize(source, { rotateAuto: !!options.rotateAuto });
  return (result.data.words || [])
    .filter(word => word.text && word.text.trim() && (word.confidence === undefined || word.confidence > 35))
    .map(word => ({
      text: word.text.trim(),
      x: (word.bbox.x0 + word.bbox.x1) / 2,
      y: (word.bbox.y0 + word.bbox.y1) / 2,
      height: Math.max(1, word.bbox.y1 - word.bbox.y0)
    }));
}

// يجمع كلمات OCR في صفوف حسب إحداثي y بدل الاعتماد على ترتيب القراءة التلقائي،
// كي تُقرأ جداول الأنظمة (اسم + جواز + جنسية...) بشكل صحيح بغض النظر عن ترتيب الأعمدة.
function groupWordsIntoRows(words) {
  if (!words.length) return [];
  const sorted = [...words].sort((a, b) => a.y - b.y);
  const heights = sorted.map(word => word.height).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 20;
  const rowThreshold = Math.max(9, medianHeight * 0.65);

  const rows = [];
  sorted.forEach(word => {
    const row = rows.find(candidate => Math.abs(candidate.y - word.y) <= rowThreshold);
    if (row) {
      row.words.push(word);
      row.y = row.words.reduce((sum, item) => sum + item.y, 0) / row.words.length;
    } else {
      rows.push({ y: word.y, words: [word] });
    }
  });

  return rows.map(row => row.words.sort((a, b) => a.x - b.x).map(word => word.text).join(" "));
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("تعذر فتح الصورة."));
    };
    image.src = url;
  });
}

function removeLongTableLines(canvas, pixels) {
  const { width, height } = canvas;
  const dark = index => pixels[index] < 105;
  const horizontalLines = [];
  const verticalLines = [];

  for (let y = 0; y < height; y += 1) {
    let darkPixels = 0;
    for (let x = 0; x < width; x += 3) {
      if (dark((y * width + x) * 4)) darkPixels += 1;
    }
    if (darkPixels > (width / 3) * 0.56) horizontalLines.push(y);
  }

  for (let x = 0; x < width; x += 1) {
    let darkPixels = 0;
    for (let y = 0; y < height; y += 4) {
      if (dark((y * width + x) * 4)) darkPixels += 1;
    }
    if (darkPixels > (height / 4) * 0.62) verticalLines.push(x);
  }

  horizontalLines.forEach(y => {
    for (let offset = -2; offset <= 2; offset += 1) {
      const yy = y + offset;
      if (yy < 0 || yy >= height) continue;
      for (let x = 0; x < width; x += 1) {
        const index = (yy * width + x) * 4;
        pixels[index] = pixels[index + 1] = pixels[index + 2] = 255;
      }
    }
  });

  verticalLines.forEach(x => {
    for (let offset = -2; offset <= 2; offset += 1) {
      const xx = x + offset;
      if (xx < 0 || xx >= width) continue;
      for (let y = 0; y < height; y += 1) {
        const index = (y * width + xx) * 4;
        pixels[index] = pixels[index + 1] = pixels[index + 2] = 255;
      }
    }
  });
}

async function enhanceFullImage(file) {
  const image = await loadImage(file);
  const scale = Math.max(1, Math.min(2.4, 1900 / Math.max(1, image.naturalWidth)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);

  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    const gray = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.6 + 148));
    pixels[index] = pixels[index + 1] = pixels[index + 2] = contrasted;
  }

  removeLongTableLines(canvas, pixels);
  context.putImageData(imageData, 0, 0);
  return canvas;
}

function createAdaptiveThresholdCanvas(sourceCanvas) {
  const blurredCanvas = document.createElement("canvas");
  blurredCanvas.width = sourceCanvas.width;
  blurredCanvas.height = sourceCanvas.height;
  const blurredContext = blurredCanvas.getContext("2d", { willReadFrequently: true });
  blurredContext.filter = "blur(18px)";
  blurredContext.drawImage(sourceCanvas, 0, 0);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = sourceCanvas.width;
  outputCanvas.height = sourceCanvas.height;
  const outputContext = outputCanvas.getContext("2d", { willReadFrequently: true });
  outputContext.drawImage(sourceCanvas, 0, 0);

  const sourceData = outputContext.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
  const blurredData = blurredContext.getImageData(0, 0, blurredCanvas.width, blurredCanvas.height);

  for (let index = 0; index < sourceData.data.length; index += 4) {
    const value = sourceData.data[index] < blurredData.data[index] - 16 ? 0 : 255;
    sourceData.data[index] = sourceData.data[index + 1] = sourceData.data[index + 2] = value;
    sourceData.data[index + 3] = 255;
  }

  outputContext.putImageData(sourceData, 0, 0);
  return outputCanvas;
}

function renderMessage() {
  const text = messageText();
  elements.message.textContent = text || "ستظهر الرسالة هنا بعد اختيار الركاب.";
  elements.selectedCount.textContent = state.selected.length;
  elements.send.disabled = !state.selected.length;
}

function reportWarnings() {
  const passportGroups = new Map();

  state.passengers.forEach(passenger => {
    splitPassportValues(passenger.passport).forEach(passport => {
      if (!passportGroups.has(passport)) passportGroups.set(passport, []);
      passportGroups.get(passport).push(passenger);
    });
  });

  const duplicates = [...passportGroups.entries()]
    .filter(([, passengers]) => passengers.length > 1)
    .map(([passport, passengers]) => ({ passport, passengers }));

  // المقاعد الصحيحة: أرقام فقط للطفل مثل 123،
  // أو رقم/أرقام وحرف للمقعد المعتاد مثل 6A و034C.
  // الرموز التشغيلية غير القياسية مثل JPX1 تظهر ضمن التنبيهات.
  const unclearSeats = state.passengers.filter(passenger =>
    passenger.seat && !/^\d{1,3}[A-Z]?$/i.test(passenger.seat)
  );

  const countMismatch = state.manifestExpectedCount && state.manifestExpectedCount !== state.passengers.length
    ? {
        expected: state.manifestExpectedCount,
        extracted: state.passengers.length
      }
    : null;

  return { duplicates, unclearSeats, countMismatch };
}

function renderAlerts() {
  if (!state.passengers.length) {
    elements.alertsCount.textContent = "0 تنبيه";
    elements.alerts.innerHTML = `
      <div class="alerts-empty">
        <span>✓</span><strong>لا توجد تنبيهات حاليًا</strong>
        <p>سيتم فحص البيان تلقائيًا بعد إرفاقه.</p>
      </div>`;
    return;
  }

  const { duplicates, unclearSeats, countMismatch } = reportWarnings();
  const count = duplicates.length + unclearSeats.length + (countMismatch ? 1 : 0);
  elements.alertsCount.textContent = `${count} ${count === 1 ? "تنبيه" : "تنبيهات"}`;

  if (!count) {
    elements.alerts.innerHTML = `
      <div class="alerts-empty">
        <span>✓</span><strong>تم فحص البيان ولا توجد ملاحظات</strong>
        <p>لا توجد جوازات مكررة أو مقاعد غير واضحة.</p>
      </div>`;
    return;
  }

  const duplicateCards = duplicates.map(group => {
    const passengerDetails = group.passengers.map(passenger =>
      `<p><strong>${escapeHtml(passenger.name)}</strong> - المقعد <code>${escapeHtml(passenger.seat || "غير واضح")}</code></p>`
    ).join("");

    return `
      <div class="report-alert duplicate">
        <span class="report-alert-icon">≋</span>
        <div>
          <h3>هناك ركاب بجواز سفر مكرر</h3>
          <p>رقم الجواز: <code>${escapeHtml(group.passport)}</code></p>
          ${passengerDetails}
        </div>
      </div>`;
  }).join("");

  const seatCards = unclearSeats.map(passenger => `
    <div class="report-alert seat-warning">
      <span class="report-alert-icon">!</span>
      <div>
        <h3>الراكب ليس لديه مقعد واضح</h3>
        <p><strong>${escapeHtml(passenger.name)}</strong></p>
        <p>الجواز: <code>${escapeHtml(passenger.passport || "غير متوفر")}</code> - المقعد: <code>${escapeHtml(passenger.seat)}</code></p>
      </div>
    </div>`).join("");

  const countCard = countMismatch ? `
    <div class="report-alert seat-warning">
      <span class="report-alert-icon">!</span>
      <div>
        <h3>عدد الركاب لا يطابق مجموع المنفست</h3>
        <p>المستخرج: <code>${escapeHtml(countMismatch.extracted)}</code> - مجموع البيان: <code>${escapeHtml(countMismatch.expected)}</code></p>
      </div>
    </div>` : "";

  elements.alerts.innerHTML = countCard + duplicateCards + seatCards;
}

function render() {
  elements.totalCount.textContent = state.passengers.length;
  renderSource();
  renderSelected();
  renderMessage();
  renderAlerts();
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2600);
}

elements.choose.addEventListener("click", () => elements.input.click());
elements.input.addEventListener("change", event => handleFile(event.target.files[0]));
elements.toggleImageImport.addEventListener("click", () => {
  const collapsed = elements.imageImportPanel.classList.toggle("is-collapsed");
  elements.toggleImageImport.setAttribute("aria-expanded", String(!collapsed));
});
elements.chooseSystemImage.addEventListener("click", () => elements.systemImageInput.click());
elements.systemImageInput.addEventListener("change", event => {
  setSystemImage(event.target.files[0]);
  elements.systemImageInput.value = "";
});
elements.analyzeSystemImage.addEventListener("click", analyzeSystemImage);

["dragenter", "dragover"].forEach(type => {
  elements.chooseSystemImage.addEventListener(type, event => {
    event.preventDefault();
    elements.chooseSystemImage.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach(type => {
  elements.chooseSystemImage.addEventListener(type, event => {
    event.preventDefault();
    elements.chooseSystemImage.classList.remove("dragging");
  });
});

elements.chooseSystemImage.addEventListener("drop", event => {
  setSystemImage(event.dataTransfer.files[0]);
});

["dragenter", "dragover"].forEach(type => {
  elements.dropZone.addEventListener(type, event => {
    event.preventDefault();
    elements.dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach(type => {
  elements.dropZone.addEventListener(type, event => {
    event.preventDefault();
    elements.dropZone.classList.remove("dragging");
  });
});

elements.dropZone.addEventListener("drop", event => handleFile(event.dataTransfer.files[0]));

elements.search.addEventListener("input", event => {
  state.query = event.target.value;
  renderSource();
});

elements.clearSearch.addEventListener("click", () => {
  clearTimeout(searchClearTimer);
  state.query = "";
  elements.search.value = "";
  renderSource();
  elements.search.focus();
});

elements.toggleBulkMatch.addEventListener("click", () => {
  const collapsed = elements.bulkMatchPanel.classList.toggle("is-collapsed");
  elements.toggleBulkMatch.setAttribute("aria-expanded", String(!collapsed));
  elements.toggleBulkMatch.classList.toggle("is-active", !collapsed);
  if (!collapsed) elements.bulkMatchInput.focus();
});

elements.bulkMatchClear.addEventListener("click", () => {
  elements.bulkMatchInput.value = "";
  elements.bulkMatchResult.textContent = "";
  elements.bulkMatchInput.focus();
});

elements.bulkMatchRun.addEventListener("click", () => {
  const text = elements.bulkMatchInput.value.trim();
  if (!state.passengers.length) return showToast("أرفق بيان PDF أولًا.");
  if (!text) return showToast("الصق أسماء أو أرقام جوازات أولاً.");

  const matches = matchPassengersFromBulkText(text);
  let added = 0;
  matches.forEach(passenger => {
    if (!state.selected.some(selected => selected.id === passenger.id)) {
      state.selected.push({ ...passenger });
      added += 1;
    }
  });

  render();
  elements.bulkMatchResult.textContent = matches.length
    ? `تم العثور على ${matches.length} راكب وإضافة ${added} جديد.`
    : "لم يتم العثور على أي راكب مطابق.";
  showToast(matches.length ? `تم إضافة ${added} راكب من القائمة الملصقة.` : "لم توجد مطابقات في النص الملصق.");
});

elements.sourceList.addEventListener("click", event => {
  const row = event.target.closest("[data-add-id]");
  if (row) addPassenger(row.dataset.addId);
});

elements.selectedList.addEventListener("click", event => {
  const remove = event.target.closest("[data-remove-id]");
  const move = event.target.closest("[data-move-id]");
  if (remove) removePassenger(remove.dataset.removeId);
  if (move) movePassenger(move.dataset.moveId, Number(move.dataset.direction));
});

elements.selectedList.addEventListener("input", event => {
  if (event.target.matches("[data-edit-id]")) {
    updatePassenger(event.target.dataset.editId, event.target.dataset.field, event.target.value);
  }
});

elements.addManual.addEventListener("click", () => {
  state.selected.push({
    id: `manual-${Date.now()}`,
    sourceNumber: 0,
    name: "SURNAME, NAME",
    passport: "",
    seat: "",
    nationality: ""
  });
  render();
  elements.selectedList.scrollTop = elements.selectedList.scrollHeight;
});

elements.clearSelected.addEventListener("click", () => {
  if (!state.selected.length || confirm("حذف جميع الركاب من القائمة المختارة؟")) {
    state.selected = [];
    render();
  }
});

elements.reset.addEventListener("click", () => {
  if ((state.passengers.length || state.selected.length) && !confirm("هل تريد تفريغ البيان والقائمتين؟")) return;
  state.passengers = [];
  state.selected = [];
  state.query = "";
  state.flightNumber = "";
  state.manifestExpectedCount = 0;
  clearTimeout(searchClearTimer);
  clearTimeout(ocrAutoTimer);
  clearTimeout(ocrMatchFlashTimer);
  if (systemImageUrl) URL.revokeObjectURL(systemImageUrl);
  systemImageFile = null;
  systemImageUrl = "";
  elements.systemImagePreview.removeAttribute("src");
  elements.systemImagePreviewWrap.classList.add("is-empty");
  elements.ocrProgress.style.width = "0";
  if (elements.ocrMatchFlash) {
    elements.ocrMatchFlash.classList.remove("is-visible");
    elements.ocrMatchFlash.innerHTML = "";
  }
  updateOcrAvailability();
  elements.search.value = "";
  elements.bulkMatchInput.value = "";
  elements.bulkMatchResult.textContent = "";
  elements.bulkMatchPanel.classList.add("is-collapsed");
  elements.toggleBulkMatch.setAttribute("aria-expanded", "false");
  elements.toggleBulkMatch.classList.remove("is-active");
  elements.fileStatus.textContent = "اسحب ملف PDF هنا، أو اختره من الجهاز";
  render();
});

elements.copy.addEventListener("click", async () => {
  const text = messageText();
  if (!text) return showToast("القائمة المختارة فارغة.");
  await navigator.clipboard.writeText(text);
  showToast("تم نسخ نص الرسالة.");
});

elements.send.addEventListener("click", () => {
  const text = messageText();
  if (!text) return;
  window.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
});

render();
updateOcrAvailability();
