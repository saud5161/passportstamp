/* global pdfjsLib, Tesseract */
"use strict";

pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";

const DEFAULT_SEAT_LABEL = "مقعد";

const state = {
  passengers: [],
  selected: [],
  query: "",
  flightNumber: "",
  manifestExpectedCount: 0,
  transitEntries: [],
  // منفست "SEQ" (طيران الرياض) لا يحتوي مقاعد حقيقية، فتتحول هذه التسمية إلى "سكونز"
  // في كل الواجهة (الرسالة، التنبيهات، حقول التعديل) عند اكتشاف هذا الشكل تحديدًا.
  seatLabel: DEFAULT_SEAT_LABEL,
  // فلتر إضافي فوق البحث النصي العادي - لا يستبدله، يعمل معه معًا.
  transitOnlyFilter: false
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
  transitCountTile: document.getElementById("transit-count"),
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
  toast: document.getElementById("toast"),
  chooseServerFile: document.getElementById("choose-server-file"),
  transitDropZone: document.getElementById("transit-drop-zone"),
  transitInput: document.getElementById("transit-input"),
  chooseTransitFile: document.getElementById("choose-transit-file"),
  chooseServerTransitFile: document.getElementById("choose-server-transit-file"),
  clearTransit: document.getElementById("clear-transit"),
  transitStatus: document.getElementById("transit-status"),
  transitLegend: document.getElementById("transit-legend"),
  quickUpdateMessage: document.getElementById("quick-update-message"),
  quickCompleteMessage: document.getElementById("quick-complete-message"),
  quickOriginalMessage: document.getElementById("quick-original-message"),
  copyManifestEmail: document.getElementById("copy-manifest-email"),
  toggleDriveNotifications: document.getElementById("toggle-drive-notifications"),
  manifestEmailValue: document.getElementById("manifest-email-value"),
  manifestSuccessBadge: document.getElementById("manifest-success-badge"),
  transitSuccessBadge: document.getElementById("transit-success-badge"),
  flightCalcPanel: document.getElementById("flight-calc-panel"),
  toggleFlightCalc: document.getElementById("toggle-flight-calc"),
  flightCalcTbody: document.getElementById("flight-calc-tbody"),
  flightCalcEmpty: document.getElementById("flight-calc-empty"),
  flightCalcClear: document.getElementById("flight-calc-clear"),
  flightCalcAdd: document.getElementById("flight-calc-add"),
  toggleTransitOnly: document.getElementById("toggle-transit-only"),
  toggleNumberPad: document.getElementById("toggle-number-pad"),
  numberPad: document.getElementById("number-pad"),
  hideNumberPad: document.getElementById("hide-number-pad")
};

let searchClearTimer = null;
let systemImageFile = null;
let systemImageUrl = "";
let ocrIsAnalyzing = false;
let ocrAutoTimer = null;
let ocrMatchFlashTimer = null;
let openAlertPanels = new Set();
let openNoteRows = new Set();
let quickMessageOverride = null;

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

const ARABIC_INDIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
function toArabicDigits(value) {
  return String(value).replace(/[0-9]/g, digit => ARABIC_INDIC_DIGITS[digit]);
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
      fullName: normalize(match[2].toUpperCase()),
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
      fullName: normalize(match[1].toUpperCase()),
      seat: match[3].toUpperCase(),
      passport,
      nationality: match[4].toUpperCase()
    });
  });

  return passengers;
}

// منفست "CHECKED-IN/BOARDED PASSENGERS – APIS MANIFEST (SEQ)" (طيران الرياض) لا
// يحتوي رقم مقعد إطلاقًا - فقط رقم تسلسلي SEQ. كل سطر: رقم SEQ، الاسم (SURNAME/GIVEN)،
// الجنسية (3 أحرف)، رقم الجواز، ثم تاريخ الميلاد. نضع رقم SEQ في حقل seat نفسه حتى
// يتدفق تلقائيًا بكل أنحاء الواجهة والرسالة، وextractPassengers تميّز هذا الشكل عبر
// format:"seq" لتُستبدل تسمية "مقعد" بـ"سكونز" في كل مكان (انظر state.seatLabel).
function parseSeqManifestLines(lines) {
  const passengers = [];
  const passengerPattern = /^(\d+)\s+(.+?)\s+([A-Z]{3})\s+([A-Z0-9]+)\s+(\d{2}\/\d{2}\/\d{4})$/;

  lines.forEach(lineValue => {
    const line = lineValue.replace(/\s+/g, " ").trim();
    const match = line.match(passengerPattern);
    if (!match || !match[2].includes("/")) return;

    const rawName = match[2].toUpperCase().replace(/#+$/, "");
    passengers.push({
      id: `seq-${match[1]}-${passengers.length}-${match[4]}`,
      sourceNumber: Number(match[1]),
      name: reportName(rawName),
      fullName: normalize(rawName),
      seat: match[1],
      passport: normalizePassport(match[4]),
      nationality: match[3].toUpperCase()
    });
  });

  return passengers;
}

// تقرير الترانزيت (Generic Report) يستخدم نفس أسلوب سطر الراكب في تقرير Altea
// (رقم.اسم/العائلة ثم الجنس والمسار...) لكنه يضيف أعمدة إضافية بعد المقعد
// (رمز الرحلة التالية والوجهة النهائية)، لذلك لا نطابق حتى نهاية السطر كما في
// parsePassengerLines، بل نكتفي بالتأكد من وجود الاسم يليه حرف نوع الراكب
// ثم مطاري المغادرة والوصول - ولا نحتاج المقعد أو ما بعده لأن الهدف الوحيد هنا
// هو مطابقة هؤلاء الركاب مع القائمة الرئيسية المستخرجة مسبقًا (بالاسم/الجواز).
function parseTransitPassengerLines(lines) {
  const passengers = [];
  // بعض الأسماء تحتوي رموزًا إضافية مثل "+" (زوجة/زوج ملحق باسم العائلة، مثل
  // "YETTOU EPOUSE BELKA+/N") - يجب تضمينها في الصنف وإلا يفشل استخراج ذلك السطر بالكامل.
  const transitNamePattern =
    /^(\d+)\.([A-Z][A-Z\s'.+-]*\/[A-Z][A-Z\s'.+-]*?)\s+(?:(?:MR|MRS|MS|MISS|MSTR|PRCS)\s+)?[A-Z]{1,2}\s+[A-Z]{3}\s+[A-Z]{3}\b/i;
  const passportPattern = /^([A-Z]{3})\s+([A-Z0-9<]{5,})(?:\s|$)/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/\s+/g, " ").trim();
    const match = line.match(transitNamePattern);
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
    const rawName = match[2].toUpperCase();
    passengers.push({
      sourceNumber: Number(match[1]),
      name: reportName(rawName),
      fullName: normalize(rawName),
      passport,
      nationality
    });
  }

  return passengers;
}

// نُرجع مع الركاب إشارة "looksLikeTransit" (وجود كلمة TRANSIT في نص التقرير) لأن سطر
// راكب عادي في بيان Altea يطابق أيضًا نمط سطر الترانزيت جزئيًا؛ نستخدم هذه الإشارة
// حصرًا في الإرفاق التلقائي من الايميل لتفادي إرفاق نسخة مكررة من بيان الركاب نفسه
// كترانزيت خطأً، بينما الإرفاق اليدوي (المستخدم يختار الملف بنفسه) لا يحتاجها.
// دالة نقية بدون أي تأثير جانبي على الواجهة - تُستدعى أيضًا لمجرد "فحص" ملف قبل معرفة
// إن كان سيُعرض كترانزيت أو كبيان ركاب أصلي، فلا يصح أن تكتب حالة تقدّم في الواجهة.
async function extractTransitReport(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const allLines = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    allLines.push(...linesFromTextContent(textContent));
  }

  return {
    entries: parseTransitPassengerLines(allLines),
    looksLikeTransit: allLines.some(line => /transit/i.test(line))
  };
}

async function extractTransitEntries(file) {
  return (await extractTransitReport(file)).entries;
}

// يطابق راكب الترانزيت مع القائمة الرئيسية المستخرجة من بيان الركاب: رقم الجواز
// أولًا (الأدق)، وإن تعذر (لا وثيقة أو اختلاف كتابة) نطابق بالاسم الكامل كاحتياط.
function findPassengerForTransitEntry(entry) {
  const entryPassports = splitPassportValues(entry.passport);
  if (entryPassports.length) {
    const byPassport = state.passengers.find(passenger =>
      splitPassportValues(passenger.passport).some(passport => entryPassports.includes(passport))
    );
    if (byPassport) return byPassport;
  }

  if (entry.fullName) {
    return state.passengers.find(passenger => normalize(passenger.fullName) === normalize(entry.fullName)) || null;
  }

  return null;
}

// يُحسب مرة واحدة لكل عرض بدل استدعاء findPassengerForTransitEntry لكل صف راكب على حدة
// (يتجنب بحثًا متداخلًا مكلفًا عند وجود مئات الركاب وعشرات مدخلات الترانزيت معًا).
function computeTransitMatchedIds() {
  const ids = new Set();
  state.transitEntries.forEach(entry => {
    const passenger = findPassengerForTransitEntry(entry);
    if (passenger) ids.add(passenger.id);
  });
  return ids;
}

// نفس فكرة computeTransitMatchedIds لكن مقصورة على ركاب الترانزيت السعوديين تحديدًا
// (نفس شرط تنبيه "يوجد سعودي من فئة الترانزيت")، لتمييزهم بلون أحمر في قائمة جميع
// الركاب أيضًا وليس فقط داخل لوحة التنبيهات.
function computeSaudiTransitMatchedIds() {
  const ids = new Set();
  state.transitEntries.forEach(entry => {
    if (normalize(entry.nationality) !== "SAU") return;
    const passenger = findPassengerForTransitEntry(entry);
    if (passenger) ids.add(passenger.id);
  });
  return ids;
}

// يضبط حالة الترانزيت في الواجهة والحالة العامة - مُشتركة بين الإرفاق اليدوي والتلقائي.
function applyTransitEntries(entries) {
  state.transitEntries = entries;
  const matchedCount = entries.filter(entry => findPassengerForTransitEntry(entry)).length;
  const flightLabel = state.flightNumber ? `الرحلة ${escapeHtml(state.flightNumber)} - ` : "";
  elements.transitStatus.innerHTML = state.passengers.length
    ? `${flightLabel}<span class="status-success">تم العثور على ${matchedCount} من أصل ${entries.length} راكب ترانزيت</span>`
    : `<span class="status-success">تم استخراج ${entries.length} راكب ترانزيت</span> - أرفق بيان الركاب لمطابقتهم.`;
  elements.transitSuccessBadge.hidden = false;
  elements.clearTransit.hidden = false;
  if (state.flightNumber) {
    upsertFlightCalcRow(state.flightNumber, { transitCount: entries.length });
  }
  render();
  showToast(`تم استخراج ${entries.length} راكب ترانزيت، وتمت مطابقة ${matchedCount} منهم.`);
}

async function handleTransitFile(file) {
  if (!file || (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))) {
    showToast("يرجى اختيار ملف PDF صحيح لقائمة الترانزيت.");
    return;
  }

  elements.transitDropZone.classList.remove("dragging");
  elements.chooseTransitFile.disabled = true;
  elements.transitStatus.textContent = `جاري فتح ${file.name}...`;
  elements.transitSuccessBadge.hidden = true;

  try {
    const entries = await extractTransitEntries(file);
    if (!entries.length) {
      throw new Error("لم يتم العثور على أسماء ترانزيت بالنمط المتوقع داخل الملف.");
    }
    applyTransitEntries(entries);
  } catch (error) {
    console.error(error);
    elements.transitStatus.textContent = "تعذر قراءة ملف الترانزيت. تأكد أن الملف بنفس تنسيق تقرير الترانزيت.";
    elements.transitSuccessBadge.hidden = true;
    showToast(error.message || "حدث خطأ أثناء قراءة ملف الترانزيت.");
  } finally {
    elements.chooseTransitFile.disabled = false;
    elements.transitInput.value = "";
  }
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
    const match = line.replace(/\s+/g, " ").trim().match(/^(?:Subtotal|Total)\s+(\d+)\s+Passengers\b/i);
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

// يجمع عناصر نص الصفحة في صفوف حسب إحداثي y (بفارق أقل من 2 نقطة يُعتبر نفس السطر)،
// ويرتب كل صف من اليسار لليمين حسب x. هذا التجميع الخام (مع بقاء موضع كل كلمة) هو
// الأساس الذي يُبنى عليه محلل الجدول العام أدناه، بجانب استخدامه لتوليد نص مسطّح
// لباقي المحللين (Altea وInkCloud) كما كان سابقًا.
function rowsFromTextContent(textContent) {
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
    .map(row => ({ y: row.y, items: row.items.sort((a, b) => a.x - b.x) }));
}

function joinRowText(row) {
  return row.items.map(item => item.text).join(" ");
}

function linesFromTextContent(textContent) {
  return rowsFromTextContent(textContent).map(joinRowText).filter(Boolean);
}

// محلل جدول عام: يعمل مع أي بيان ركاب مُصمم كجدول له عناوين أعمدة إنجليزية
// (Surname / Forename / Seat / Passport ...) بغض النظر عن شركة الطيران أو شكل
// تصميم الجدول - بدل الاعتماد على نمط نصي ثابت مثل باقي المحللين، يكتشف موضع كل
// عمود من عنوانه ثم يوزّع كلمات كل صف بيانات على أقرب عمود حسب الموضع الأفقي.
const TABLE_COLUMN_SYNONYMS = {
  serial: ["SNO", "SLNO", "NO", "SL", "SLNOSNO"],
  surname: ["SURNAME", "LASTNAME", "FAMILYNAME"],
  forename: ["FORENAME", "FIRSTNAME", "GIVENNAME", "GIVENNAMES"],
  seat: ["SEATNUMBER", "SEAT", "SEATNO"],
  gender: ["GENDER", "SEX"],
  nationality: ["NATIONALITY", "NATION"],
  passport: ["PASSPORTNUMBER", "PASSPORT", "DOCUMENTNUMBER", "DOCNUMBER", "DOCNO", "PASSPORTNO"]
};

function tableHeaderField(text) {
  const key = String(text || "").toUpperCase().replace(/[^A-Z]/g, "");
  for (const field in TABLE_COLUMN_SYNONYMS) {
    if (TABLE_COLUMN_SYNONYMS[field].includes(key)) return field;
  }
  return null;
}

// يبحث عن أول صف بالمستند يحتوي 4 عناوين أعمدة أساسية على الأقل (اسم العائلة، الاسم،
// المقعد، الجواز)، ويستخدم مواضعها الأفقية كحدود لبقية أعمدة الجدول في كل صفحات البيان.
function detectTableColumns(rows) {
  for (const row of rows) {
    const columns = [];
    row.items.forEach(item => {
      const field = tableHeaderField(item.text);
      if (field && !columns.some(col => col.field === field)) {
        columns.push({ field, x: item.x });
      }
    });
    const requiredFound = ["surname", "forename", "seat", "passport"]
      .filter(field => columns.some(col => col.field === field)).length;
    if (requiredFound >= 4) {
      return { columns: columns.sort((a, b) => a.x - b.x), headerRow: row };
    }
  }
  return null;
}

// كل كلمة تُنسب لأقرب عمود يقع على يمينها مباشرة (أو نفس موضعها) - نفس منطق قراءة
// الجداول بصريًا من اليسار لليمين بدل الاعتماد على المسافات النصية بين الكلمات.
// أي كلمة تقع يسار كل الأعمدة المكتشفة (مثل عمود الرقم التسلسلي حين لا يُكتشف
// كعمود مستقل) تُتجاهل بدل إلصاقها قسرًا بأول عمود، حتى لا يختلط الرقم بالاسم.
function assignRowToColumns(row, columns) {
  const values = {};
  row.items.forEach(item => {
    let best = null;
    columns.forEach(column => {
      if (item.x >= column.x - 4) best = column;
    });
    if (!best) return;
    values[best.field] = values[best.field] ? `${values[best.field]} ${item.text}` : item.text;
  });
  return values;
}

function parseTableManifestRows(rows) {
  const detected = detectTableColumns(rows);
  if (!detected) return [];
  const { columns, headerRow } = detected;

  const passengers = [];
  rows.forEach(row => {
    if (row === headerRow) return;
    const firstItem = row.items[0];
    if (!firstItem || !/^\d+$/.test(firstItem.text)) return;

    const values = assignRowToColumns(row, columns);
    const surname = (values.surname || "").trim();
    const forename = (values.forename || "").trim();
    if (!surname) return;

    const seat = (values.seat || "").toUpperCase().replace(/\s+/g, "");
    const passport = joinPassports(splitPassportValues(values.passport || ""));
    const nationality = (values.nationality || "").toUpperCase().trim();
    const rawName = `${surname}/${forename}`.toUpperCase();

    passengers.push({
      id: `table-${firstItem.text}-${passport || passengers.length}`,
      sourceNumber: Number(firstItem.text),
      name: reportName(rawName),
      fullName: normalize(rawName),
      seat,
      passport,
      nationality
    });
  });

  return passengers;
}

async function extractPassengers(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const allRows = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    elements.fileStatus.textContent = `جاري قراءة الصفحة ${pageNumber} من ${pdf.numPages}...`;
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    allRows.push(...rowsFromTextContent(textContent));
  }

  const allLines = allRows.map(joinRowText).filter(Boolean);

  const alteaPassengers = parsePassengerLines(allLines);
  const inkCloudPassengers = parseInkCloudPassengerLines(allLines);
  const tablePassengers = parseTableManifestRows(allRows);
  const seqPassengers = parseSeqManifestLines(allLines);

  // نجرّب كل المحللين المعروفين ونختار من نجح في استخراج أكبر عدد ركاب - هذا يجعل
  // النظام يتعرف تلقائيًا على أي شكل بيان مدعوم دون أي اختيار يدوي من المستخدم.
  const best = [
    { passengers: alteaPassengers, format: "altea" },
    { passengers: inkCloudPassengers, format: "inkcloud" },
    { passengers: tablePassengers, format: "table" },
    { passengers: seqPassengers, format: "seq" }
  ].reduce((a, b) => (b.passengers.length > a.passengers.length ? b : a));

  return {
    passengers: best.passengers,
    format: best.format,
    flightNumber: extractFlightNumber(allLines),
    manifestExpectedCount: extractManifestExpectedCount(allLines)
  };
}

// precomputedReport اختياري: يُستخدم عندما يكون المستدعي قد استخرج التقرير مسبقًا
// (مثل loadServerFile عند فحص الملف قبل تحميله) لتفادي قراءة نفس الـ PDF مرتين.
// يحدّث تلميحات البحث ولصق النص الجماعي بالتسمية الحالية (مقعد/سكونز) - العناصر التي
// لا تُعاد كتابتها في كل render() لأنها ثابتة أصلًا في HTML، بخلاف الرسائل والتنبيهات
// التي تُبنى ديناميكيًا وتستخدم state.seatLabel مباشرة عند كل عرض.
function updateSeatLabelUI() {
  elements.search.placeholder = `ابحث بالاسم أو رقم الجواز أو رقم ${state.seatLabel}...`;
  elements.bulkMatchInput.placeholder =
    `الصق أرقام جوازات أو أسماء الركاب هنا - سطر لكل راكب. يمكن لصق أرقام جوازات فقط، ` +
    `أو أسماء فقط، أو اسم مع رقم الجواز أو ${state.seatLabel}، أو حتى نفس تنسيق نص الرسالة.`;
}

async function handleFile(file, precomputedReport = null) {
  if (!file || (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))) {
    showToast("يرجى اختيار ملف PDF صحيح.");
    return;
  }

  elements.dropZone.classList.remove("dragging");
  elements.choose.disabled = true;
  elements.fileStatus.textContent = `جاري فتح ${file.name}...`;
  elements.manifestSuccessBadge.hidden = true;

  try {
    const report = precomputedReport || await extractPassengers(file);
    const passengers = report.passengers;
    if (!passengers.length) {
      throw new Error("لم يتم العثور على ركاب بالنمط المتوقع داخل الملف.");
    }
    state.passengers = passengers;
    state.selected = [];
    state.query = "";
    state.flightNumber = report.flightNumber;
    state.manifestExpectedCount = report.manifestExpectedCount;
    state.transitEntries = [];
    state.seatLabel = report.format === "seq" ? "سكونز" : DEFAULT_SEAT_LABEL;
    updateSeatLabelUI();
    elements.clearTransit.hidden = true;
    elements.transitStatus.textContent = "أرفق ملف PDF لقائمة ركاب الترانزيت ليتم تمييزهم داخل قائمة الركاب.";
    elements.search.value = "";
    const flightLabel = state.flightNumber ? `الرحلة ${escapeHtml(state.flightNumber)} - ` : "";
    const countLabel = state.manifestExpectedCount
      ? ` من أصل ${state.manifestExpectedCount}`
      : "";
    elements.fileStatus.innerHTML = `${flightLabel}<span class="status-success">تم استخراج ${passengers.length}${countLabel} راكب</span>`;
    elements.manifestSuccessBadge.hidden = false;
    if (state.flightNumber) {
      upsertFlightCalcRow(state.flightNumber, { passengerCount: passengers.length, transitCount: 0 });
    }
    updateOcrAvailability();
    render();
    // عند اختلاف العدد المذكور بالمنفست عن المستخرج، ننبّه فورًا بدل رسالة النجاح العادية.
    if (state.manifestExpectedCount && state.manifestExpectedCount !== passengers.length) {
      showToast(`⚠️ تنبيه: المنفست يذكر ${state.manifestExpectedCount} راكب وتم استخراج ${passengers.length} فقط - راجع التنبيهات.`);
    } else {
      showToast(`تم استخراج ${passengers.length} راكب.`);
    }
    if (systemImageFile) scheduleAutoOcr();
  } catch (error) {
    console.error(error);
    elements.fileStatus.textContent = "تعذر قراءة المنفست. تأكد أن الملف بنفس تنسيق تقرير Altea.";
    elements.manifestSuccessBadge.hidden = true;
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
    elements.ocrStatus.textContent = "";
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

// فلتر "الترانزيت فقط" يعمل فوق نتيجة البحث النصي (وليس بديلًا عنه) - يحافظ على آلية
// البحث الحالية كاملة كما طُلب، ويُضيف تضييقًا إضافيًا اختياريًا فقط.
function filteredPassengers() {
  const query = normalize(state.query);
  let passengers = query
    ? state.passengers.filter(passenger =>
        normalize(`${passenger.name} ${passenger.passport} ${passenger.seat} ${passenger.nationality}`).includes(query)
      )
    : state.passengers;

  if (state.transitOnlyFilter) {
    const transitIds = computeTransitMatchedIds();
    passengers = passengers.filter(passenger => transitIds.has(passenger.id));
  }

  return passengers;
}

function extractPassportTokensFromText(text) {
  return splitPassportValues(text).filter(token => token.length >= 4 && /\d/.test(token));
}

// مطابقة تامة فقط هنا - بلا أي تسامح بـ"آخر 4 أرقام" بمفردها بدون أي سياق مرافق،
// لأن رقمًا وهميًا أو مقروءًا خطأً بالكامل قد يتطابق صدفة مع آخر 4 أرقام لراكب حقيقي
// غير معني إطلاقًا في بيان كبير (تأكد هذا فعليًا عند اختبار أرقام جوازات وهمية).
// التسامح مع أخطاء القراءة عبر آخر 4 أرقام متاح لاحقًا في matchPassengerFromLine،
// لكن فقط كتعزيز لمطابقة بالاسم موجودة أصلًا بنفس السطر (سياق حقيقي إضافي)،
// وليس كمعيار مستقل لرقم مجرّد بلا اسم.
function matchPassengerByPassportToken(token) {
  const compactToken = comparableOcrText(token);
  return state.passengers.find(passenger =>
    splitPassportValues(passenger.passport).some(passport =>
      passport === token || comparableOcrText(passport) === compactToken
    )
  );
}

// نطابق باسم العائلة فقط ابتداءً - أكثر مرونة من اشتراط الاسم الأول أيضًا، لأن OCR
// غالبًا يقرأ العائلة بوضوح أكبر من الاسم الأول في صور الشاشات المزدحمة. التضييق
// عند تعدد المرشحين (أكثر من راكب بنفس العائلة) يتم لاحقًا في matchPassengerFromLine.
function matchPassengersBySurnameLine(line) {
  const normalizedLine = normalize(line);
  if (normalizedLine.length < 3) return [];
  return state.passengers.filter(passenger => {
    const surnameNorm = normalize(passenger.name.split(",")[0] || "");
    return surnameNorm && normalizedLine.includes(surnameNorm);
  });
}

function firstGivenNameOf(passenger) {
  return normalize(passenger.name.split(",")[1] || "").split(" ").filter(Boolean)[0] || "";
}

// رقم الجواز هو أساس المطابقة؛ الاسم مجرد تعزيز يُستخدم فقط حين يتعذر قراءة رقم
// الجواز في نفس السطر. عند تعدد الركاب بنفس اسم العائلة، نضيّق تدريجيًا: أولًا
// بالاسم الأول إن ظهر بالسطر، ثم بآخر أرقام الجواز الظاهرة كرمز مستقل بنفس السطر
// تحديدًا (وليس أي رقم عشوائي مثل تاريخ الميلاد). وإن بقي أكثر من مرشح رغم ذلك،
// لا نخمّن إطلاقًا - نُرجع بلا مطابقة، حتى لا يظهر راكبان بنفس الاسم بجوازين مختلفين
// دون تأكيد حقيقي.
function matchPassengerFromLine(line) {
  const tokens = extractPassportTokensFromText(line);
  for (const token of tokens) {
    const passenger = matchPassengerByPassportToken(token);
    if (passenger) return passenger;
  }

  const surnameCandidates = matchPassengersBySurnameLine(line);
  if (!surnameCandidates.length) return null;
  if (surnameCandidates.length === 1) return surnameCandidates[0];

  const normalizedLine = normalize(line);
  const byGivenName = surnameCandidates.filter(passenger => {
    const givenNorm = firstGivenNameOf(passenger);
    return givenNorm && normalizedLine.includes(givenNorm);
  });
  const narrowed = byGivenName.length ? byGivenName : surnameCandidates;
  if (narrowed.length === 1) return narrowed[0];

  // هنا فقط (بعد تأكيد وجود اسم عائلة مطابق بالفعل بنفس السطر) يُسمح بالتسامح عبر
  // آخر 4 أرقام، لأن وجود اسم مطابق سياق كافٍ يقلل احتمال الصدفة كثيرًا.
  const lineTokens = tokens.map(comparableOcrText);
  const reinforced = narrowed.filter(passenger =>
    splitPassportValues(passenger.passport).some(passport => {
      const compactPassport = comparableOcrText(passport);
      if (compactPassport.length < 4) return false;
      const tail = compactPassport.slice(-4);
      return lineTokens.some(candidateToken => candidateToken.length >= 4 && candidateToken.slice(-4) === tail);
    })
  );

  return reinforced.length === 1 ? reinforced[0] : null;
}

function matchPassengersFromBulkText(text) {
  const matched = new Map();

  String(text || "").split(/\r?\n/).forEach(line => {
    if (!line.trim()) return;
    const passenger = matchPassengerFromLine(line);
    if (passenger && !matched.has(passenger.id)) matched.set(passenger.id, passenger);
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
  openNoteRows.delete(id);
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

// نص حر بدون تحويل لحروف كبيرة (خلافًا لحقول الاسم/الجواز/المقعد)، ولا نعيد رسم
// القائمة المختارة كاملة حتى لا يفقد حقل الإدخال تركيزه أثناء الكتابة.
function updatePassengerNote(id, value) {
  const passenger = state.selected.find(item => item.id === id);
  if (!passenger) return;
  passenger.note = value;
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
        <p>جرّب الاسم أو رقم الجواز أو رقم ${state.seatLabel}.</p>
      </div>`;
    return;
  }

  const transitIds = computeTransitMatchedIds();
  const saudiTransitIds = computeSaudiTransitMatchedIds();

  elements.sourceList.innerHTML = passengers.map(passenger => {
    const selected = state.selected.some(item => item.id === passenger.id);
    const isTransit = transitIds.has(passenger.id);
    const isSaudiTransitAlert = saudiTransitIds.has(passenger.id);
    const rowClass = isSaudiTransitAlert ? "is-transit-alert" : (isTransit ? "is-transit" : "");
    return `
      <div class="passenger-row ${selected ? "is-selected" : ""} ${rowClass}" data-add-id="${escapeHtml(passenger.id)}">
        <span class="row-index">${passenger.sourceNumber}</span>
        <div class="passenger-main">
          <div class="passenger-name">${escapeHtml(passenger.name)}</div>
          <div class="passenger-meta">
            <span>P/${escapeHtml(passenger.passport || "غير متوفر")}</span>
            <span>${escapeHtml(passenger.nationality)}</span>
            ${isSaudiTransitAlert ? '<span class="transit-alert-tag">⛔ سعودي ترانزيت</span>' : (isTransit ? '<span class="transit-tag">✈️ ترانزيت</span>' : "")}
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

  // نرتب القائمة المختارة حسب ترتيب ظهور الراكب بالبيان الأصلي (sourceNumber)،
  // والركاب المُضافين يدويًا (بدون sourceNumber) يوضعون بالنهاية حسب ترتيب إضافتهم.
  const sortedSelected = [...state.selected].sort((a, b) => {
    const orderA = a.sourceNumber ?? Infinity;
    const orderB = b.sourceNumber ?? Infinity;
    return orderA - orderB;
  });

  const transitIds = computeTransitMatchedIds();

  elements.selectedList.innerHTML = sortedSelected.map((passenger, index) => {
    const hasNoteText = Boolean(passenger.note && passenger.note.trim());
    const noteOpen = hasNoteText || openNoteRows.has(passenger.id);
    return `
    <div class="passenger-row selected-row ${transitIds.has(passenger.id) ? "is-transit" : ""}">
      <span class="row-index">${index + 1}</span>
      <div class="edit-fields">
        <input value="${escapeHtml(passenger.name)}" data-edit-id="${escapeHtml(passenger.id)}" data-field="name" aria-label="اسم الراكب">
        <input value="${escapeHtml(passenger.passport)}" data-edit-id="${escapeHtml(passenger.id)}" data-field="passport" aria-label="رقم الجواز" placeholder="الجواز">
        <input value="${escapeHtml(passenger.seat)}" data-edit-id="${escapeHtml(passenger.id)}" data-field="seat" aria-label="${escapeHtml(state.seatLabel)}" placeholder="${escapeHtml(state.seatLabel)}">
      </div>
      <div class="row-actions">
        <button class="icon-button ${hasNoteText ? "has-note" : ""}" data-note-toggle="${escapeHtml(passenger.id)}" title="إضافة ملاحظة">📝</button>
        <button class="icon-button" data-move-id="${escapeHtml(passenger.id)}" data-direction="-1" title="تحريك لأعلى">↑</button>
        <button class="icon-button" data-move-id="${escapeHtml(passenger.id)}" data-direction="1" title="تحريك لأسفل">↓</button>
        <button class="icon-button remove" data-remove-id="${escapeHtml(passenger.id)}" title="حذف">×</button>
      </div>
      ${noteOpen ? `
      <div class="passenger-note-row">
        <span>ملاحظة /</span>
        <input type="text" class="passenger-note-input" value="${escapeHtml(passenger.note || "")}" data-note-id="${escapeHtml(passenger.id)}" placeholder="اكتب ملاحظة تظهر تحت هذا الراكب في الرسالة...">
      </div>` : ""}
    </div>`;
  }).join("");
}

// كل راكب: اسم + جواز بسطر واحد، ثم سطر "مقعد : (*رقم*)" تحته (النجمتان لجعله عريضًا
// في واتساب)، ثم سطر ملاحظة اختياري إن وُجد. الركاب مفصولون بسطر فارغ بينهم.
// يُستخدم أيضًا في رسالة "تحديث" لأنهما يشتركان بنفس قائمة الركاب.
function passengerMessageLines() {
  return state.selected.map((passenger, index) => {
    const note = (passenger.note || "").trim();
    const noteLine = note ? `\nملاحظة / ${note}` : "";
    return `${index + 1}.${passenger.name.trim()} ${passenger.passport.trim()}\n${state.seatLabel} : (*${passenger.seat.trim()}*)${noteLine}`;
  }).join("\n\n");
}

function messageText() {
  if (!state.selected.length) return "";
  return `الركاب المتبقين على رحلة (${state.flightNumber}) في نظام الجوازات\n\n${passengerMessageLines()}\n\n*اشعارنا فوراً عند وصول اي راكب على البوابة*`;
}

function updateMessageText() {
  if (!state.selected.length) return "";
  return `تحديث على رحلة (${state.flightNumber}) في نظام الجوازات\n\n${passengerMessageLines()}\n\n*اشعارنا فوراً عند وصول اي راكب على البوابة*`;
}

function completeMessageText() {
  return `الرحلة مكتملة (${state.flightNumber}) في نظام الجوازات\nجميع الركاب مختمين`;
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
  // أي تغيير فعلي بقائمة الركاب (إضافة/حذف/تعديل) يُلغي رسالة "تحديث/مكتملة" السريعة
  // المعروضة سابقًا، ويعيد المعاينة لنص القائمة الطبيعي تلقائيًا.
  quickMessageOverride = null;
  const text = messageText();
  elements.message.textContent = text || "ستظهر الرسالة هنا بعد اختيار الركاب.";
  elements.selectedCount.textContent = state.selected.length;
  elements.send.disabled = !state.selected.length;
}

function isAlSaudSurname(name) {
  const surname = normalize(String(name || "").split(",")[0]).replace(/\s+/g, "");
  return surname === "ALSAUD";
}

function hasSuspiciousAlSaudDocument(passenger) {
  if (!isAlSaudSurname(passenger.name)) return false;
  const passports = splitPassportValues(passenger.passport);
  if (!passports.length) return true;
  return passports.some(passport => /^1\d{9}$/.test(passport));
}

function passengerOrderLabel(passenger) {
  return passenger.sourceNumber ? `ترتيبه في المنفست: ${passenger.sourceNumber}` : "";
}

// أطول تطابق متتالٍ مشترك بين رقمي جواز - يُستخدم للحكم على مدى تشابه الرقمين.
function longestCommonRun(a, b) {
  if (!a || !b) return 0;
  let best = 0;
  let previous = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        current[j] = previous[j - 1] + 1;
        if (current[j] > best) best = current[j];
      }
    }
    previous = current;
  }
  return best;
}

// راكبان بنفس الاسم لا يُعتبران تكرارًا إلا إذا كان رقما الجواز متشابهين
// (أكثر من 4 خانات متطابقة متتالية). لو الرقمان مختلفان بشكل كبير فهما شخصان
// مختلفان بنفس الاسم ولا داعي للتنبيه. غياب رقم الجواز لا يمنع التنبيه.
function passportsLookRelated(passportA, passportB) {
  const listA = splitPassportValues(passportA);
  const listB = splitPassportValues(passportB);
  if (!listA.length || !listB.length) return true;
  return listA.some(a => listB.some(b => longestCommonRun(a, b) > 4));
}

function reportWarnings() {
  const passportGroups = new Map();
  const seatGroups = new Map();
  const nameGroups = new Map();

  state.passengers.forEach(passenger => {
    splitPassportValues(passenger.passport).forEach(passport => {
      if (!passportGroups.has(passport)) passportGroups.set(passport, []);
      passportGroups.get(passport).push(passenger);
    });

    const seatKey = normalize(passenger.seat);
    if (seatKey) {
      if (!seatGroups.has(seatKey)) seatGroups.set(seatKey, []);
      seatGroups.get(seatKey).push(passenger);
    }

    // نقارن بالاسم الكامل كما هو مسجّل بالبيان (وليس المختصر لعرض الاسم الأول+الأخير فقط)
    // حتى لا نعتبر راكبين بأسماء وسطى مختلفة تكراراً خاطئاً.
    const nameKey = normalize(passenger.fullName || passenger.name);
    if (nameKey) {
      if (!nameGroups.has(nameKey)) nameGroups.set(nameKey, []);
      nameGroups.get(nameKey).push(passenger);
    }
  });

  const duplicates = [...passportGroups.entries()]
    .filter(([, passengers]) => passengers.length > 1)
    .map(([passport, passengers]) => ({ passport, passengers }));

  const duplicateSeats = [...seatGroups.entries()]
    .filter(([, passengers]) => passengers.length > 1)
    .map(([, passengers]) => ({ seat: passengers[0].seat, passengers }));

  // نقسم كل مجموعة أسماء متطابقة إلى عناقيد حسب تشابه رقم الجواز:
  // لا يظهر التنبيه إلا للركاب الذين يتشابه رقم جوازهم فعلًا مع راكب آخر بنفس الاسم.
  const duplicateNames = [];
  nameGroups.forEach(passengers => {
    if (passengers.length < 2) return;
    const clusters = [];
    passengers.forEach(passenger => {
      const cluster = clusters.find(group =>
        group.some(other => passportsLookRelated(passenger.passport, other.passport))
      );
      if (cluster) cluster.push(passenger);
      else clusters.push([passenger]);
    });
    clusters
      .filter(cluster => cluster.length > 1)
      .forEach(cluster => {
        // نعرض الاسم الكامل كما ورد بالبيان حتى يتضح أن المقارنة تمت بالاسم الكامل.
        duplicateNames.push({ name: cluster[0].fullName || cluster[0].name, passengers: cluster });
      });
  });

  const noDocument = state.passengers.filter(passenger => !splitPassportValues(passenger.passport).length);

  const alSaudFlags = state.passengers.filter(hasSuspiciousAlSaudDocument);

  // ركاب ترانزيت بجنسية سعودية - تنبيه حرج لأن السعوديين لا يُفترض أن يكونوا ضمن
  // فئة الترانزيت عادة، فيلزم التحقق فورًا (مثل تنبيه الجوازات المكررة بالضبط).
  const saudiTransitFlags = state.transitEntries.filter(entry => normalize(entry.nationality) === "SAU");

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

  return { duplicates, unclearSeats, duplicateSeats, duplicateNames, noDocument, alSaudFlags, saudiTransitFlags, countMismatch };
}

function duplicatePassportMessage(group) {
  const lines = [`*جواز سفر مكرر: ${group.passport}*`];
  group.passengers.forEach((passenger, index) => {
    // المقعد داخل أقواس مع علامة اتجاه (LRM) حتى لا تتلخبط الأرقام والحروف الإنجليزية
    // وسط النص العربي عند عرض الرسالة في واتساب.
    lines.push(`${index + 1}. ${passenger.name} - ${state.seatLabel} (${passenger.seat || "غير واضح"})‏ - ${passengerOrderLabel(passenger)}`);
  });
  return lines.join("\n");
}

// صف بيانات راكب واحد داخل تفاصيل التنبيه - عناصر منفصلة بتخطيط مرن بدل نص واحد مختلط
// الاتجاه، حتى لا تتداخل الكلمات العربية مع الأرقام والمقاعد الإنجليزية بصريًا.
function passengerDetailItem(passenger, { showPassport = false } = {}) {
  const parts = [];
  if (showPassport) parts.push(`P/${escapeHtml(passenger.passport || "بدون وثيقة")}`);
  parts.push(`${escapeHtml(state.seatLabel)} (${escapeHtml(passenger.seat || "-")})`);
  parts.push(escapeHtml(passengerOrderLabel(passenger)));
  return `
    <div class="alert-detail-item">
      <strong>${escapeHtml(passenger.name)}</strong>
      <span>${parts.join(" - ")}</span>
    </div>`;
}

function passengerListMessage(title, passengers, { showPassport = false } = {}) {
  const lines = [`*${title}*`];
  passengers.forEach((passenger, index) => {
    const parts = [];
    if (showPassport) parts.push(`P/${passenger.passport || "بدون وثيقة"}`);
    parts.push(passengerOrderLabel(passenger));
    lines.push(`${index + 1}. ${passenger.name}\n   ${state.seatLabel} (${passenger.seat || "-"})‏${parts.length ? "\n   " + parts.join(" - ") : ""}`);
  });
  return lines.join("\n");
}

function copyGroupButtonHtml(type, key) {
  return `<button class="alert-copy-btn" type="button" data-copy-group="${type}" data-copy-key="${escapeHtml(key)}">⧉ نسخ</button>`;
}

// صف تنبيه واحد قابل للطي: أيقونة + نوع التنبيه + عدده، ولا تظهر الأسماء إلا بعد النقر عليه.
function alertSummaryRow({ key, colorClass, icon, title, count, detailHtml }) {
  if (!count) return "";
  const isOpen = openAlertPanels.has(key);
  const row = `
    <div class="alert-row ${colorClass} clickable ${isOpen ? "is-open" : ""}" data-alert-toggle="${key}">
      <span class="alert-row-icon">${icon}</span>
      <span class="alert-row-title">${title}</span>
      <span class="alert-row-count">${count}</span>
      <span class="alert-row-chevron ${isOpen ? "is-open" : ""}">›</span>
    </div>`;
  return row + (isOpen ? `<div class="alert-detail-panel">${detailHtml}</div>` : "");
}

function renderAlerts() {
  if (!state.passengers.length) {
    elements.alertsCount.textContent = "0 تنبيه";
    elements.alerts.innerHTML = `
      <div class="alerts-empty">
        <span>✓</span><strong>لا توجد تنبيهات حاليًا</strong>
        <p>سيتم فحص المنفست تلقائيًا بعد إرفاقه.</p>
      </div>`;
    return;
  }

  const { duplicates, unclearSeats, duplicateSeats, duplicateNames, noDocument, alSaudFlags, saudiTransitFlags, countMismatch } = reportWarnings();
  const count = duplicates.length + saudiTransitFlags.length + (unclearSeats.length ? 1 : 0) + (duplicateSeats.length ? 1 : 0)
    + (duplicateNames.length ? 1 : 0) + (noDocument.length ? 1 : 0)
    + (alSaudFlags.length ? 1 : 0) + (countMismatch ? 1 : 0);
  elements.alertsCount.textContent = `${count} ${count === 1 ? "تنبيه" : "تنبيهات"}`;

  if (!count) {
    elements.alerts.innerHTML = `
      <div class="alerts-empty">
        <span>✓</span><strong>تم فحص المنفست ولا توجد ملاحظات</strong>
        <p>لا توجد جوازات مكررة أو مقاعد غير واضحة.</p>
      </div>`;
    return;
  }

  // خطر: جواز سفر مكرر يظهر مباشرة وبالتفصيل الكامل دون الحاجة للنقر، لأنه يعتبر تنبيهًا حرجًا.
  const duplicateCards = duplicates.map(group => {
    const passengerRows = group.passengers.map(passenger => `
      <div class="danger-passenger-row">
        <strong>${escapeHtml(passenger.name)}</strong>
        <span>${escapeHtml(state.seatLabel)} (${escapeHtml(passenger.seat || "غير واضح")}) - ${escapeHtml(passengerOrderLabel(passenger))}</span>
      </div>`
    ).join("");

    return `
      <div class="danger-alert">
        <div class="danger-alert-head">
          <span class="danger-alert-icon">⛔</span>
          <div class="danger-alert-title">
            <h3>جواز سفر مكرر بين أكثر من راكب</h3>
            <span>تنبيه حرج - يلزم التحقق فورًا</span>
          </div>
          <button class="danger-copy-btn" type="button" data-copy-passport="${escapeHtml(group.passport)}">⧉ نسخ للواتساب</button>
        </div>
        <span class="danger-passport-tag">رقم الجواز: ${escapeHtml(group.passport)}</span>
        ${passengerRows}
      </div>`;
  }).join("");

  // خطر: راكب ترانزيت سعودي - يظهر مباشرة وبالتفصيل الكامل بنفس أسلوب الجواز المكرر،
  // لأنه أيضًا تنبيه حرج يلزم التحقق منه فورًا.
  const saudiTransitCard = saudiTransitFlags.length ? `
    <div class="danger-alert">
      <div class="danger-alert-head">
        <span class="danger-alert-icon">⛔</span>
        <div class="danger-alert-title">
          <h3>يوجد سعودي من فئة الترانزيت</h3>
          <span>تنبيه حرج - يلزم التحقق فورًا</span>
        </div>
      </div>
      ${saudiTransitFlags.map(entry => `
        <div class="danger-passenger-row">
          <strong>${escapeHtml(entry.name)}</strong>
          <span>P/${escapeHtml(entry.passport || "بدون وثيقة")} - ${escapeHtml(passengerOrderLabel(entry))}</span>
        </div>`).join("")}
    </div>` : "";

  const countCard = countMismatch ? `
    <div class="alert-row alert-row--warning">
      <span class="alert-row-icon">!</span>
      <span class="alert-row-title">عدد الركاب لا يطابق مجموع المنفست: مستخرج ${escapeHtml(countMismatch.extracted)} من ${escapeHtml(countMismatch.expected)}</span>
    </div>` : "";

  const unclearSeatsRow = alertSummaryRow({
    key: "unclear-seats", colorClass: "alert-row--warning", icon: "!",
    title: `ركاب بدون ${state.seatLabel} واضح`, count: unclearSeats.length,
    detailHtml: `
      <div class="alert-detail-toolbar">${copyGroupButtonHtml("unclear-seats", "")}</div>
      <div class="alert-detail-rows">${unclearSeats.map(passenger => passengerDetailItem(passenger, { showPassport: true })).join("")}</div>`
  });

  const duplicateSeatsDetail = duplicateSeats.map(group => `
    <div class="alert-detail-group">
      <div class="alert-detail-group-head">
        <strong>${escapeHtml(state.seatLabel)} ${escapeHtml(group.seat || "غير واضح")}</strong>
        ${copyGroupButtonHtml("dup-seat", group.seat || "")}
      </div>
      <div class="alert-detail-rows">
        ${group.passengers.map(passenger => passengerDetailItem(passenger, { showPassport: true })).join("")}
      </div>
    </div>`).join("");
  const duplicateSeatsRow = alertSummaryRow({
    key: "dup-seats", colorClass: "alert-row--seat", icon: "⌗",
    title: `ركاب بنفس رقم ${state.seatLabel}`, count: duplicateSeats.length,
    detailHtml: duplicateSeatsDetail
  });

  const duplicateNamesCount = duplicateNames.reduce((sum, group) => sum + group.passengers.length, 0);
  const duplicateNamesDetail = duplicateNames.map(group => `
    <div class="alert-detail-group">
      <div class="alert-detail-group-head">
        <strong>${escapeHtml(group.name)}</strong>
        ${copyGroupButtonHtml("dup-name", group.name)}
      </div>
      <div class="alert-detail-rows">
        ${group.passengers.map(passenger => passengerDetailItem(passenger, { showPassport: true })).join("")}
      </div>
    </div>`).join("");
  const duplicateNamesRow = alertSummaryRow({
    key: "dup-names", colorClass: "alert-row--name", icon: "⧉",
    title: "ركاب بأسماء مكررة", count: duplicateNamesCount,
    detailHtml: duplicateNamesDetail
  });

  const noDocumentRow = alertSummaryRow({
    key: "no-doc", colorClass: "alert-row--doc", icon: "🛂",
    title: "ركاب بدون وثيقة سفر", count: noDocument.length,
    detailHtml: `
      <div class="alert-detail-toolbar">${copyGroupButtonHtml("no-doc", "")}</div>
      <div class="alert-detail-rows">${noDocument.map(passenger => passengerDetailItem(passenger, { showPassport: false })).join("")}</div>`
  });

  const alSaudRow = alertSummaryRow({
    key: "alsaud", colorClass: "alert-row--alsaud", icon: "⚑",
    title: "ركاب من عائلة آل سعود بوثيقة تحتاج مراجعة", count: alSaudFlags.length,
    detailHtml: `
      <div class="alert-detail-toolbar">${copyGroupButtonHtml("alsaud", "")}</div>
      <div class="alert-detail-rows">${alSaudFlags.map(passenger => passengerDetailItem(passenger, { showPassport: true })).join("")}</div>`
  });

  elements.alerts.innerHTML = duplicateCards + saudiTransitCard + countCard + unclearSeatsRow
    + duplicateSeatsRow + duplicateNamesRow + noDocumentRow + alSaudRow;
}

function render() {
  elements.totalCount.textContent = state.passengers.length;
  if (elements.transitLegend) elements.transitLegend.hidden = !state.transitEntries.length;
  if (elements.transitCountTile) elements.transitCountTile.textContent = state.transitEntries.length || "-";
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

// navigator.clipboard.writeText يفشل بصمت على المتصفحات التي تفتح الصفحة عبر
// سياق غير آمن (مثل فتحها من الجوال عبر عنوان IP محلي بدل HTTPS/localhost) -
// نجرّبها أولًا، وإن تعذرت نستخدم طريقة execCommand القديمة كخطة بديلة تعمل
// في كل الحالات تقريبًا.
async function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      // نكمل للطريقة الاحتياطية أدناه
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let success = false;
  try {
    success = document.execCommand("copy");
  } catch (error) {
    success = false;
  }
  document.body.removeChild(textarea);
  return success;
}

// بعض تطبيقات الجداول على الجوال (خصوصًا خارج Excel/Sheets الرسمية) لا توزّع نصًا
// بمسافات جدولية (Tab) تلقائيًا على خلايا منفصلة عند اللصق داخل خلية واحدة، بل
// تلصقه كنص واحد حرفيًا. الحل الأكثر موثوقية هو كتابة نسختين للحافظة معًا: نص عادي
// بمسافات جدولية (fallback)، وHTML بجدول <table> حقيقي - فأغلب التطبيقات التي تفهم
// اللصق كجدول تُفضّل تمثيل HTML وتوزّعه فعليًا على خلايا منفصلة عند اللصق.
async function copyValuesAsTable(values) {
  const plainText = values.join("\t");

  if (navigator.clipboard && window.ClipboardItem) {
    try {
      const htmlTable = `<table><tr>${values.map(value => `<td>${escapeHtml(value)}</td>`).join("")}</tr></table>`;
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([plainText], { type: "text/plain" }),
          "text/html": new Blob([htmlTable], { type: "text/html" })
        })
      ]);
      return true;
    } catch (error) {
      // نكمل للطريقة الاحتياطية أدناه (نص عادي فقط)
    }
  }

  return copyTextToClipboard(plainText);
}

/* ========== حاسبة مخصصة للرحلات (تُخزَّن في هذا المتصفح فقط) ==========
   كل رحلة يتم إرفاق بيانها تُضاف/تُحدَّث تلقائيًا هنا (رقم الرحلة، عدد الركاب،
   ركاب الترانزيت)، وعدد الملاحين يُدخل يدويًا. المجموع = الركاب + الملاحين - الترانزيت. */
const FLIGHT_CALC_STORAGE_KEY = "flight_calc_rows_v1";

function loadFlightCalcRows() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FLIGHT_CALC_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveFlightCalcRows() {
  try {
    localStorage.setItem(FLIGHT_CALC_STORAGE_KEY, JSON.stringify(flightCalcRows));
  } catch (error) {
    console.error(error);
  }
}

let flightCalcRows = loadFlightCalcRows();

// المجموع = الركاب + الملاح + الجثمان (يُضافون) - الترانزيت - المعاد (يُخصمون).
function flightCalcTotal(row) {
  return (Number(row.passengerCount) || 0) + (Number(row.crewCount) || 0) + (Number(row.bodyCount) || 0)
    - (Number(row.transitCount) || 0) - (Number(row.returneeCount) || 0);
}

// ترتيب الأعمدة كما طُلب: رقم الرحلة، الركاب، المجموع، ملاح، المعاد، الترانزيت، الجثمان.
const FLIGHT_CALC_NUMERIC_FIELDS = ["passengerCount", "crewCount", "returneeCount", "transitCount", "bodyCount"];

function flightCalcCell(row, index, field) {
  return `<td><input type="number" min="0" data-flight-calc-field="${field}" data-flight-calc-index="${index}" value="${row[field] || 0}"></td>`;
}

function renderFlightCalcTable() {
  elements.flightCalcEmpty.hidden = flightCalcRows.length > 0;
  elements.flightCalcTbody.innerHTML = flightCalcRows.map((row, index) => `
    <tr>
      <td>
        <div class="flight-calc-flight-cell">
          <input type="text" data-flight-calc-field="flightNumber" data-flight-calc-index="${index}" value="${escapeHtml(row.flightNumber)}">
          <button class="flight-calc-copy-btn" type="button" data-flight-calc-copy="${index}" title="نسخ جدول الرحلة">⧉</button>
        </div>
      </td>
      ${flightCalcCell(row, index, "passengerCount")}
      <td><span class="flight-calc-total">${flightCalcTotal(row)}</span></td>
      ${flightCalcCell(row, index, "crewCount")}
      ${flightCalcCell(row, index, "returneeCount")}
      ${flightCalcCell(row, index, "transitCount")}
      ${flightCalcCell(row, index, "bodyCount")}
      <td><button class="flight-calc-row-remove" type="button" data-flight-calc-remove="${index}" title="حذف الرحلة">×</button></td>
    </tr>`).join("");
}

// يضيف رحلة جديدة أو يحدّث رحلة موجودة بنفس رقمها (بلا حساسية لحالة الأحرف) - يُستدعى
// تلقائيًا عند إرفاق بيان ركاب أو قائمة ترانزيت، ولا يغيّر الملاح/المعاد/الجثمان المُدخلين يدويًا.
function upsertFlightCalcRow(flightNumber, updates) {
  const key = String(flightNumber || "").trim().toUpperCase();
  if (!key) return;

  const existing = flightCalcRows.find(row => String(row.flightNumber || "").trim().toUpperCase() === key);
  if (existing) {
    Object.assign(existing, updates);
  } else {
    flightCalcRows.push({
      flightNumber, passengerCount: 0, transitCount: 0, crewCount: 0, returneeCount: 0, bodyCount: 0, ...updates
    });
  }
  saveFlightCalcRows();
  renderFlightCalcTable();
  // أي إضافة/تحديث فعلي (بيان جديد، ترانزيت، أو رحلة أُضيفت يدويًا) يُظهر الحاسبة
  // تلقائيًا بدل بقائها مطوية دون أن ينتبه المستخدم لتحديثها.
  elements.flightCalcPanel.classList.remove("is-collapsed");
  elements.toggleFlightCalc.setAttribute("aria-expanded", "true");
}

elements.toggleFlightCalc.addEventListener("click", () => {
  const collapsed = elements.flightCalcPanel.classList.toggle("is-collapsed");
  elements.toggleFlightCalc.setAttribute("aria-expanded", String(!collapsed));
});

elements.flightCalcTbody.addEventListener("input", event => {
  const field = event.target.dataset.flightCalcField;
  const index = Number(event.target.dataset.flightCalcIndex);
  if (!field || Number.isNaN(index) || !flightCalcRows[index]) return;

  flightCalcRows[index][field] = field === "flightNumber" ? event.target.value : Number(event.target.value) || 0;
  saveFlightCalcRows();

  // نحدّث خلية المجموع فقط بدل إعادة رسم الجدول كاملاً، حتى لا يفقد حقل الإدخال
  // تركيزه (focus) أثناء الكتابة - مهم جدًا لتجربة تعديل شبيهة بجدول إكسل.
  const totalCell = event.target.closest("tr").querySelector(".flight-calc-total");
  if (totalCell) totalCell.textContent = flightCalcTotal(flightCalcRows[index]);
});

// يمسح الصفر تلقائيًا عند التركيز على الحقل حتى لا يضطر المستخدم لحذفه يدويًا قبل
// الكتابة، ويعيده إن تُرك الحقل فارغًا بعد ذلك (focusin/focusout يدعمان التفويض
// عبر عنصر أب، بخلاف focus/blur اللذين لا ينتشران/يصعدان).
elements.flightCalcTbody.addEventListener("focusin", event => {
  if (event.target.matches('input[type="number"]') && event.target.value === "0") {
    event.target.value = "";
  }
});

elements.flightCalcTbody.addEventListener("focusout", event => {
  if (!event.target.matches('input[type="number"]') || event.target.value.trim() !== "") return;
  event.target.value = "0";
  const field = event.target.dataset.flightCalcField;
  const index = Number(event.target.dataset.flightCalcIndex);
  if (!field || Number.isNaN(index) || !flightCalcRows[index]) return;
  flightCalcRows[index][field] = 0;
  saveFlightCalcRows();
  const totalCell = event.target.closest("tr").querySelector(".flight-calc-total");
  if (totalCell) totalCell.textContent = flightCalcTotal(flightCalcRows[index]);
});

elements.flightCalcTbody.addEventListener("click", async event => {
  // ينسخ جدولًا مختصرًا (الركاب/المجموع/ملاح/المعاد/الترانزيت) بلا رقم الرحلة ولا
  // الجثمان، مفصولًا بمسافات جدولية (Tab) حتى يلصق كأعمدة حقيقية في إكسل أو الرسائل.
  const copyBtn = event.target.closest("[data-flight-calc-copy]");
  if (copyBtn) {
    const row = flightCalcRows[Number(copyBtn.dataset.flightCalcCopy)];
    if (!row) return;
    // أرقام فقط بلا عناوين، بصيغة جدول حقيقي (وليس نصًا بمسافات جدولية فقط) - لتوزيع
    // أفضل على خلايا منفصلة عند اللصق في تطبيقات الجداول على الجوال. بالأرقام العربية
    // (٠١٢٣...) كما طُلب صراحة، وليست الأرقام الإنجليزية (0123...).
    const values = [
      row.passengerCount || 0,
      flightCalcTotal(row),
      row.crewCount || 0,
      row.returneeCount || 0,
      row.transitCount || 0
    ].map(toArabicDigits);
    const copied = await copyValuesAsTable(values);
    showToast(copied ? "تم نسخ الأرقام." : "تعذر النسخ تلقائيًا على هذا المتصفح.");
    return;
  }

  const removeBtn = event.target.closest("[data-flight-calc-remove]");
  if (!removeBtn) return;
  flightCalcRows.splice(Number(removeBtn.dataset.flightCalcRemove), 1);
  saveFlightCalcRows();
  renderFlightCalcTable();
});

elements.flightCalcClear.addEventListener("click", () => {
  if (!flightCalcRows.length) return;
  if (!confirm("سيتم حذف جميع الرحلات المحفوظة في الحاسبة نهائيًا من هذا المتصفح. هل تريد المتابعة؟")) return;
  flightCalcRows = [];
  saveFlightCalcRows();
  renderFlightCalcTable();
  showToast("تم تفريغ الرحلات المحفوظة.");
});

// يضيف رحلة فارغة يدويًا (بلا حاجة لإرفاق أي بيان) لتُكتب أرقامها مباشرة بالجدول -
// لتغطية رحلات لم تُرفَق منفستاتها إطلاقًا في الأداة.
elements.flightCalcAdd.addEventListener("click", () => {
  flightCalcRows.push({ flightNumber: "", passengerCount: 0, transitCount: 0, crewCount: 0, returneeCount: 0, bodyCount: 0 });
  saveFlightCalcRows();
  elements.flightCalcPanel.classList.remove("is-collapsed");
  elements.toggleFlightCalc.setAttribute("aria-expanded", "true");
  renderFlightCalcTable();
  const newFlightInput = elements.flightCalcTbody.querySelector('tr:last-child input[data-flight-calc-field="flightNumber"]');
  if (newFlightInput) newFlightInput.focus();
});

renderFlightCalcTable();

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

elements.chooseTransitFile.addEventListener("click", () => elements.transitInput.click());
elements.transitInput.addEventListener("change", event => handleTransitFile(event.target.files[0]));

["dragenter", "dragover"].forEach(type => {
  elements.transitDropZone.addEventListener(type, event => {
    event.preventDefault();
    elements.transitDropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach(type => {
  elements.transitDropZone.addEventListener(type, event => {
    event.preventDefault();
    elements.transitDropZone.classList.remove("dragging");
  });
});

elements.transitDropZone.addEventListener("drop", event => handleTransitFile(event.dataTransfer.files[0]));

elements.clearTransit.addEventListener("click", () => {
  state.transitEntries = [];
  elements.clearTransit.hidden = true;
  elements.transitStatus.textContent = "أرفق ملف PDF لقائمة ركاب الترانزيت ليتم تمييزهم داخل قائمة الركاب.";
  elements.transitSuccessBadge.hidden = true;
  if (state.flightNumber) {
    upsertFlightCalcRow(state.flightNumber, { transitCount: 0 });
  }
  render();
  showToast("تم إزالة قائمة الترانزيت.");
});

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

// فلتر "الترانزيت فقط" - يعمل فوق البحث النصي الحالي دون أي تغيير عليه.
elements.toggleTransitOnly.addEventListener("click", () => {
  state.transitOnlyFilter = !state.transitOnlyFilter;
  elements.toggleTransitOnly.classList.toggle("is-active", state.transitOnlyFilter);
  elements.toggleTransitOnly.setAttribute("aria-pressed", String(state.transitOnlyFilter));
  renderSource();
});

// لوحة أرقام عائمة (شفافة، لا تُزيح أي عنصر) بجانب البحث - تبقى ظاهرة حتى يُضغط
// زر إخفائها أو زر التبديل مجددًا صراحة، ولا تُغلق تلقائيًا بعد كل رقم.
elements.toggleNumberPad.addEventListener("click", () => {
  const willShow = elements.numberPad.hidden;
  elements.numberPad.hidden = !willShow;
  elements.toggleNumberPad.classList.toggle("is-active", willShow);
});

elements.hideNumberPad.addEventListener("click", () => {
  elements.numberPad.hidden = true;
  elements.toggleNumberPad.classList.remove("is-active");
});

elements.numberPad.addEventListener("click", event => {
  const keyButton = event.target.closest("[data-num-key]");
  if (!keyButton) return;
  const key = keyButton.dataset.numKey;

  if (key === "back") {
    elements.search.value = elements.search.value.slice(0, -1);
  } else if (key === "clear") {
    elements.search.value = "";
  } else {
    elements.search.value += key;
  }
  state.query = elements.search.value;
  renderSource();
  elements.search.focus();
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
  const noteToggle = event.target.closest("[data-note-toggle]");
  if (remove) removePassenger(remove.dataset.removeId);
  if (move) movePassenger(move.dataset.moveId, Number(move.dataset.direction));
  if (noteToggle) {
    const id = noteToggle.dataset.noteToggle;
    if (openNoteRows.has(id)) openNoteRows.delete(id);
    else openNoteRows.add(id);
    renderSelected();
  }
});

elements.selectedList.addEventListener("input", event => {
  if (event.target.matches("[data-edit-id]")) {
    updatePassenger(event.target.dataset.editId, event.target.dataset.field, event.target.value);
  }
  if (event.target.matches("[data-note-id]")) {
    updatePassengerNote(event.target.dataset.noteId, event.target.value);
  }
});

elements.alerts.addEventListener("click", async event => {
  const toggle = event.target.closest("[data-alert-toggle]");
  if (toggle) {
    const key = toggle.dataset.alertToggle;
    if (openAlertPanels.has(key)) openAlertPanels.delete(key);
    else openAlertPanels.add(key);
    renderAlerts();
    return;
  }

  const copyButton = event.target.closest("[data-copy-passport]");
  if (copyButton) {
    const { duplicates } = reportWarnings();
    const group = duplicates.find(item => item.passport === copyButton.dataset.copyPassport);
    if (group) {
      const copied = await copyTextToClipboard(duplicatePassportMessage(group));
      showToast(copied ? "تم نسخ نص الجواز المكرر." : "تعذر النسخ تلقائيًا على هذا المتصفح.");
    }
    return;
  }

  const copyGroupButton = event.target.closest("[data-copy-group]");
  if (copyGroupButton) {
    const type = copyGroupButton.dataset.copyGroup;
    const key = copyGroupButton.dataset.copyKey || "";
    const warnings = reportWarnings();
    let title = "";
    let passengers = [];
    let showPassport = false;

    if (type === "unclear-seats") {
      title = `ركاب بدون ${state.seatLabel} واضح`;
      passengers = warnings.unclearSeats;
      showPassport = true;
    } else if (type === "dup-seat") {
      const group = warnings.duplicateSeats.find(item => item.seat === key);
      if (group) { title = `${state.seatLabel} مكرر: ${group.seat}`; passengers = group.passengers; showPassport = true; }
    } else if (type === "dup-name") {
      const group = warnings.duplicateNames.find(item => item.name === key);
      if (group) { title = `اسم مكرر: ${group.name}`; passengers = group.passengers; showPassport = true; }
    } else if (type === "no-doc") {
      title = "ركاب بدون وثيقة سفر";
      passengers = warnings.noDocument;
    } else if (type === "alsaud") {
      title = "ركاب من عائلة آل سعود بحاجة مراجعة";
      passengers = warnings.alSaudFlags;
      showPassport = true;
    }

    if (passengers.length) {
      const copied = await copyTextToClipboard(passengerListMessage(title, passengers, { showPassport }));
      showToast(copied ? "تم نسخ النص." : "تعذر النسخ تلقائيًا على هذا المتصفح.");
    }
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
    openNoteRows.clear();
    render();
  }
});

elements.reset.addEventListener("click", () => {
  if ((state.passengers.length || state.selected.length) && !confirm("هل تريد تفريغ المنفست والقائمتين؟")) return;
  state.passengers = [];
  state.selected = [];
  state.query = "";
  state.flightNumber = "";
  state.manifestExpectedCount = 0;
  state.transitEntries = [];
  state.seatLabel = DEFAULT_SEAT_LABEL;
  updateSeatLabelUI();
  elements.clearTransit.hidden = true;
  elements.transitStatus.textContent = "أرفق ملف PDF لقائمة ركاب الترانزيت ليتم تمييزهم داخل قائمة الركاب.";
  elements.transitSuccessBadge.hidden = true;
  elements.manifestSuccessBadge.hidden = true;
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
  openAlertPanels.clear();
  openNoteRows.clear();
  elements.fileStatus.textContent = "اسحب ملف PDF هنا، أو اختره من الجهاز";
  render();
});

elements.copy.addEventListener("click", async () => {
  const text = quickMessageOverride || messageText();
  if (!text) return showToast("القائمة المختارة فارغة.");
  const copied = await copyTextToClipboard(text);
  showToast(copied ? "تم نسخ نص الرسالة." : "تعذر النسخ تلقائيًا على هذا المتصفح.");
});

elements.send.addEventListener("click", () => {
  const text = quickMessageOverride || messageText();
  if (!text) return;
  window.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
});

elements.quickUpdateMessage.addEventListener("click", () => {
  const text = updateMessageText();
  if (!text) return showToast("القائمة المختارة فارغة.");
  quickMessageOverride = text;
  elements.message.textContent = text;
  elements.send.disabled = false;
});

elements.quickCompleteMessage.addEventListener("click", () => {
  const text = completeMessageText();
  quickMessageOverride = text;
  elements.message.textContent = text;
  elements.send.disabled = false;
});

// يلغي أي رسالة سريعة (تحديث/مكتملة) معروضة، ويعيد المعاينة لنص قائمة الركاب
// الطبيعي فورًا - بديل صريح عن الاعتماد على تغيير غير مباشر بالقائمة لإعادته.
elements.quickOriginalMessage.addEventListener("click", () => {
  quickMessageOverride = null;
  renderMessage();
});

elements.copyManifestEmail.addEventListener("click", async () => {
  const copied = await copyTextToClipboard(elements.manifestEmailValue.textContent.trim());
  showToast(copied ? "تم نسخ عنوان الإيميل." : "تعذر النسخ تلقائيًا - انسخه يدويًا من الأعلى.");
});

render();
updateOcrAvailability();

/* ========== الرحلات المرسلة عبر الايميل (Supabase) ========== */
const SUPABASE_URL = "https://dkrtiuelioyshbjoocqm.supabase.co";
const SUPABASE_KEY = "sb_publishable_ts5SGrWhODsG6EH5dUt9Wg_KUvsf-CF";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ========== قفل الصفحة برقم سري (يُخزَّن بشكل دائم بهذا المتصفح فقط) ========== */
const PAGE_UNLOCK_KEY = "page_unlocked_v1";
const FALLBACK_ACCESS_PIN = "123123";

const lockElements = {
  overlay: document.getElementById("lock-overlay"),
  input: document.getElementById("lock-pin-input"),
  error: document.getElementById("lock-error"),
  submit: document.getElementById("lock-submit")
};

async function fetchAccessPin() {
  try {
    const { data, error } = await supabaseClient
      .from("app_settings")
      .select("value")
      .eq("key", "access_pin")
      .single();
    if (error || !data) throw error || new Error("not found");
    return data.value;
  } catch (error) {
    return FALLBACK_ACCESS_PIN;
  }
}

function unlockPage() {
  try { localStorage.setItem(PAGE_UNLOCK_KEY, "1"); } catch (error) { /* */ }
  document.documentElement.classList.remove("page-locked");
}

async function submitLockPin() {
  const entered = lockElements.input.value.trim();
  if (!entered) return;
  lockElements.submit.disabled = true;
  const correctPin = await fetchAccessPin();
  lockElements.submit.disabled = false;
  if (entered === correctPin) {
    unlockPage();
  } else {
    lockElements.error.textContent = "الرقم السري غير صحيح.";
    lockElements.input.value = "";
    lockElements.input.focus();
  }
}

if (document.documentElement.classList.contains("page-locked")) {
  lockElements.input.focus();
}
lockElements.submit.addEventListener("click", submitLockPin);
lockElements.input.addEventListener("keydown", event => {
  if (event.key === "Enter") submitLockPin();
});

const GOOGLE_DRIVE_FOLDER_ID = "1VaEkh0SUaYmeoVaYOLzFstF96d-CuoQR";
const GOOGLE_DRIVE_API_KEY = "AIzaSyDFb8azGaajtlemiq1XpDKmZEgo68vGM8c";

/* ========== نافذة اختيار ملف من مجلد الايميل (Google Drive) ========== */
const serverFilesModal = document.getElementById("server-files-modal");
const serverFilesList = document.getElementById("server-files-list");
const serverModalClose = document.getElementById("server-modal-close");
const serverModalRefresh = document.getElementById("server-modal-refresh");
const serverModalTitle = document.getElementById("server-modal-title");
let serverFilesTarget = "main";
let lastDriveFiles = [];

// نعرض الوقت مع التاريخ (وليس التاريخ فقط) حتى يتضح "متى وصل هذا المنفست بالضبط"
// بشكل مستقل عن اسم الملف نفسه.
function formatDriveDate(iso) {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("ar-SA-u-nu-latn", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timePart = d.toLocaleTimeString("ar-SA-u-nu-latn", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${timePart} - ${datePart}`;
}

// يستخرج رقم الرحلة (مثل SV804) من بداية اسم الملف حتى لو باقي الاسم طويل ومقطوع بصريًا.
function extractFlightNumberFromFileName(fileName) {
  const match = String(fileName || "").toUpperCase().match(/\b([A-Z]{1,3}\d{2,4})\b/);
  return match ? match[1] : "";
}

// مهلة زمنية تمنع تعليق النافذة للأبد لو تأخر الاتصال بـ Google Drive، مع محاولتين
// إضافيتين تلقائيًا عند فشل الشبكة (Failed to fetch) - جوجل درايف أحيانًا يرفض طلبًا
// عابرًا بسبب استخدام كثيف قصير المدى، والانتظار القصير قبل إعادة المحاولة يحل أغلب
// هذه الحالات دون أي تدخل يدوي من المستخدم.
async function fetchWithTimeout(url, timeoutMs = 15000, retries = 2) {
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return response;
    } catch (error) {
      clearTimeout(timer);
      if (attempt >= retries || error.name === "AbortError") throw error;
      await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
}

/* ========== تنبيه فوري عند وصول منفست جديد (فحص مجلد Drive كل دقيقة) ========== */
const DRIVE_SEEN_FILES_KEY = "drive_seen_file_ids_v1";
const DRIVE_NOTIFY_ENABLED_KEY = "drive_notify_enabled_v1";
let driveNotifyTimer = null;

function loadSeenDriveFileIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRIVE_SEEN_FILES_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    return new Set();
  }
}

function saveSeenDriveFileIds(idsSet) {
  try {
    localStorage.setItem(DRIVE_SEEN_FILES_KEY, JSON.stringify([...idsSet]));
  } catch (error) {
    console.error(error);
  }
}

function showDriveNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body });
  } catch (error) {
    console.error(error);
  }
  showToast(`${title} - ${body}`);
}

// يقارن ملفات المجلد الحالية بآخر قائمة "معروفة" مخزّنة - أي ملف جديد يُطلق له إشعارًا.
// في أول فحص إطلاقًا (لا توجد قائمة معروفة بعد) نكتفي بتسجيل الملفات الحالية كنقطة
// بداية بصمت، حتى لا يُطلق إشعار عن كل منفست قديم موجود مسبقًا عند أول تفعيل للميزة.
async function checkForNewDriveManifests() {
  if (!GOOGLE_DRIVE_API_KEY || GOOGLE_DRIVE_API_KEY === "YOUR_GOOGLE_DRIVE_API_KEY") return;

  try {
    const query = encodeURIComponent(`'${GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType='application/pdf' and trashed=false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&key=${GOOGLE_DRIVE_API_KEY}`;
    const response = await fetchWithTimeout(url, 15000, 1);
    if (!response.ok) return;
    const result = await response.json();
    const files = result.files || [];

    const hasBaseline = localStorage.getItem(DRIVE_SEEN_FILES_KEY) !== null;
    const seenIds = loadSeenDriveFileIds();
    const newFiles = hasBaseline ? files.filter(file => !seenIds.has(file.id)) : [];

    files.forEach(file => seenIds.add(file.id));
    saveSeenDriveFileIds(seenIds);

    newFiles.forEach(file => {
      const flightNumber = extractFlightNumberFromFileName(file.name);
      showDriveNotification("📋 وصل منفست جديد", flightNumber ? `رقم الرحلة: ${flightNumber}` : file.name);
    });
  } catch (error) {
    console.error("drive notify check error:", error);
  }
}

function startDriveNotificationPolling() {
  if (driveNotifyTimer) return;
  checkForNewDriveManifests();
  driveNotifyTimer = setInterval(checkForNewDriveManifests, 60 * 1000);
}

function stopDriveNotificationPolling() {
  clearInterval(driveNotifyTimer);
  driveNotifyTimer = null;
}

function updateDriveNotifyButton(enabled) {
  elements.toggleDriveNotifications.textContent = enabled ? "🔔 التنبيه مفعّل" : "🔔 تفعيل تنبيه الوصول";
  elements.toggleDriveNotifications.classList.toggle("is-active", enabled);
}

elements.toggleDriveNotifications.addEventListener("click", async () => {
  if (!("Notification" in window)) {
    showToast("متصفحك لا يدعم إشعارات النظام.");
    return;
  }

  if (localStorage.getItem(DRIVE_NOTIFY_ENABLED_KEY) === "1") {
    localStorage.setItem(DRIVE_NOTIFY_ENABLED_KEY, "0");
    stopDriveNotificationPolling();
    updateDriveNotifyButton(false);
    showToast("تم إيقاف تنبيه وصول المنفست.");
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    showToast("لم يتم منح إذن الإشعارات.");
    return;
  }

  localStorage.setItem(DRIVE_NOTIFY_ENABLED_KEY, "1");
  startDriveNotificationPolling();
  updateDriveNotifyButton(true);
  showToast("تم تفعيل تنبيه وصول المنفست - يتم الفحص كل دقيقة.");
});

if ("Notification" in window && Notification.permission === "granted" && localStorage.getItem(DRIVE_NOTIFY_ENABLED_KEY) === "1") {
  updateDriveNotifyButton(true);
  startDriveNotificationPolling();
}

// قائمة ملفات الايميل لا تتغير كل ثانية، فنحتفظ بها لدقيقة كاملة بدل إعادة طلبها من
// جوجل درايف في كل مرة يُفتح فيها نفس النافذة - يقلل عدد الطلبات المتكررة التي قد
// تتسبب برفض مؤقت من جوجل عند التنقل السريع بين الملفات. زر "↻" يفرض تحديثًا فوريًا.
let lastDriveFilesFetchedAt = 0;
const DRIVE_FILES_CACHE_TTL_MS = 60 * 1000;

function renderServerFilesList(files) {
  if (!files.length) {
    serverFilesList.innerHTML = `
      <div class="empty-state">
        <span>📭</span>
        <strong>لا توجد ملفات بعد</strong>
        <p>ستظهر هنا كل ملفات المنفست المرفوعة من الايميل.</p>
      </div>`;
    return;
  }

  serverFilesList.innerHTML = files.map(file => {
    const flightNumber = extractFlightNumberFromFileName(file.name);
    return `
    <div class="server-file-item" data-drive-file-id="${escapeHtml(file.id)}" data-drive-file-name="${escapeHtml(file.name)}">
      <span>📄</span>
      <div class="server-file-info">
        ${flightNumber ? `<span class="server-file-flight">${escapeHtml(flightNumber)}</span>` : ""}
        <span class="server-file-name">${escapeHtml(file.name)}</span>
      </div>
      <span class="server-file-date">${escapeHtml(formatDriveDate(file.modifiedTime))}</span>
    </div>`;
  }).join("");
}

async function openServerFilesModal(target = "main", forceRefresh = false) {
  serverFilesTarget = target;
  serverModalTitle.textContent = target === "transit" ? "اختر ملف الترانزيت من الايميل" : "اختر ملف من الايميل";
  serverFilesModal.hidden = false;

  const cacheIsFresh = lastDriveFiles.length && (Date.now() - lastDriveFilesFetchedAt) < DRIVE_FILES_CACHE_TTL_MS;
  if (!forceRefresh && cacheIsFresh) {
    renderServerFilesList(lastDriveFiles);
    return;
  }

  serverFilesList.innerHTML = '<div class="email-loading">⏳ جاري تحميل الملفات...</div>';

  if (!GOOGLE_DRIVE_API_KEY || GOOGLE_DRIVE_API_KEY === "YOUR_GOOGLE_DRIVE_API_KEY") {
    serverFilesList.innerHTML = '<div class="email-loading">⚠️ لم يتم إعداد مفتاح Google Drive API بعد.</div>';
    return;
  }

  try {
    const query = encodeURIComponent(`'${GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType='application/pdf' and trashed=false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&key=${GOOGLE_DRIVE_API_KEY}`;
    const response = await fetchWithTimeout(url);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || "تعذر الاتصال بـ Google Drive");

    const files = result.files || [];
    lastDriveFiles = files;
    lastDriveFilesFetchedAt = Date.now();
    renderServerFilesList(files);
  } catch (error) {
    console.error(error);
    const message = error.name === "AbortError" ? "انتهت مهلة الاتصال بـ Google Drive، حاول مرة أخرى." : error.message;
    serverFilesList.innerHTML = `<div class="email-loading">❌ تعذر تحميل الملفات: ${escapeHtml(message)}</div>`;
  }
}

function closeServerFilesModal() {
  serverFilesModal.hidden = true;
}

// نخزّن محتوى الملف بعد أول تنزيل، حتى إذا تنقّل المستخدم بين نفس الملفات أكثر من
// مرة (رجوع واختيار مجددًا) لا نُعيد تنزيلها من جوجل درايف في كل مرة.
const driveFileBlobCache = new Map();

async function fetchDriveFileAsPdf(fileId, fileName, fallbackName) {
  if (driveFileBlobCache.has(fileId)) {
    return new File([driveFileBlobCache.get(fileId)], fileName || fallbackName, { type: "application/pdf" });
  }

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${GOOGLE_DRIVE_API_KEY}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error("تعذر تحميل الملف من Google Drive");
  const blob = await response.blob();
  driveFileBlobCache.set(fileId, blob);
  return new File([blob], fileName || fallbackName, { type: "application/pdf" });
}

// بعض الرحلات يصلها إيميلان بنفس رقم الرحلة: بيان الركاب وقائمة الترانزيت. بعد إرفاق
// بيان الركاب من الايميل، نبحث عن ملف آخر بنفس رقم الرحلة بالضبط، ونتحقق أنه فعلًا
// تقرير ترانزيت (وليس نسخة أخرى من نفس البيان) قبل إرفاقه تلقائيًا - وبصمت تام إن لم
// نجد شيئًا، لأن أغلب الرحلات ليس لها ترانزيت أصلًا.
async function autoAttachTransitForMainFile(pickedFileId, pickedFileName) {
  const flightNumber = extractFlightNumberFromFileName(pickedFileName);
  if (!flightNumber || !lastDriveFiles.length) return;

  const candidates = lastDriveFiles.filter(file =>
    file.id !== pickedFileId && extractFlightNumberFromFileName(file.name) === flightNumber
  );

  for (const candidate of candidates) {
    try {
      const file = await fetchDriveFileAsPdf(candidate.id, candidate.name, "transit.pdf");
      const { entries, looksLikeTransit } = await extractTransitReport(file);
      if (entries.length && looksLikeTransit) {
        applyTransitEntries(entries);
        return;
      }
    } catch (error) {
      console.error("auto transit attach error:", error);
    }
  }
}

// الحالة المعاكسة: المستخدم اختار من قائمة الايميل ملفًا للبيان الرئيسي، لكنه تبيّن أنه
// تقرير ترانزيت فعليًا (نقر بالخطأ على الملف الآخر بنفس رقم الرحلة). نبحث عن ملف آخر
// بنفس رقم الرحلة، ونحمّل أول ملف ينجح كبيان ركاب حقيقي في مكان البيان الرئيسي.
// نُرجع true إن نجحنا، حتى يعرف المستدعي هل يُرفق الترانزيت بعدها أم يكتفي بتنبيه.
async function autoAttachMainManifestForTransitFile(pickedFileId, pickedFileName) {
  const flightNumber = extractFlightNumberFromFileName(pickedFileName);
  if (!flightNumber || !lastDriveFiles.length) return false;

  const candidates = lastDriveFiles.filter(file =>
    file.id !== pickedFileId && extractFlightNumberFromFileName(file.name) === flightNumber
  );

  for (const candidate of candidates) {
    try {
      const file = await fetchDriveFileAsPdf(candidate.id, candidate.name, "manifest.pdf");
      const report = await extractPassengers(file);
      if (report.passengers.length) {
        await handleFile(file, report);
        return true;
      }
    } catch (error) {
      console.error("auto main-manifest attach error:", error);
    }
  }
  return false;
}

async function loadServerFile(fileId, fileName) {
  serverFilesList.innerHTML = '<div class="email-loading">⏳ جاري تحميل الملف...</div>';
  try {
    const file = await fetchDriveFileAsPdf(fileId, fileName, "manifest.pdf");
    closeServerFilesModal();

    const report = await extractPassengers(file);
    if (!report.passengers.length) {
      // قبل الحكم بالفشل، نتحقق: ربما الملف الذي اخترته هو تقرير ترانزيت وليس بيان
      // الركاب (بعض الرحلات يصلها إيميلان بنفس رقم الرحلة). إن صح ذلك، نرفقه كترانزيت
      // ونبحث تلقائيًا عن بيان الركاب الصحيح بنفس رقم الرحلة لنضعه في مكانه الصحيح.
      const transitReport = await extractTransitReport(file);
      if (transitReport.entries.length && transitReport.looksLikeTransit) {
        const attachedMain = await autoAttachMainManifestForTransitFile(fileId, fileName);
        applyTransitEntries(transitReport.entries);
        if (!attachedMain) {
          showToast("⚠️ هذا الملف قائمة ترانزيت - أرفق بيان الركاب لنفس الرحلة يدويًا للمطابقة.");
        }
        return;
      }
    }

    await handleFile(file, report);
    await autoAttachTransitForMainFile(fileId, fileName);
  } catch (error) {
    console.error(error);
    const message = error.name === "AbortError" ? "انتهت مهلة تحميل الملف، حاول مرة أخرى." : error.message;
    serverFilesList.innerHTML = `<div class="email-loading">❌ ${escapeHtml(message)}</div>`;
  }
}

async function loadServerFileForTransit(fileId, fileName) {
  serverFilesList.innerHTML = '<div class="email-loading">⏳ جاري تحميل الملف...</div>';
  try {
    const file = await fetchDriveFileAsPdf(fileId, fileName, "transit.pdf");
    closeServerFilesModal();
    await handleTransitFile(file);
  } catch (error) {
    console.error(error);
    const message = error.name === "AbortError" ? "انتهت مهلة تحميل الملف، حاول مرة أخرى." : error.message;
    serverFilesList.innerHTML = `<div class="email-loading">❌ ${escapeHtml(message)}</div>`;
  }
}

elements.chooseServerFile.addEventListener("click", () => openServerFilesModal("main"));
elements.chooseServerTransitFile.addEventListener("click", () => openServerFilesModal("transit"));
serverModalRefresh.addEventListener("click", () => openServerFilesModal(serverFilesTarget, true));
serverModalClose.addEventListener("click", closeServerFilesModal);
serverFilesModal.addEventListener("click", event => {
  if (event.target === serverFilesModal) closeServerFilesModal();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !serverFilesModal.hidden) closeServerFilesModal();
});
serverFilesList.addEventListener("click", event => {
  const item = event.target.closest("[data-drive-file-id]");
  if (!item) return;
  if (serverFilesTarget === "transit") {
    loadServerFileForTransit(item.dataset.driveFileId, item.dataset.driveFileName);
    return;
  }
  loadServerFile(item.dataset.driveFileId, item.dataset.driveFileName);
});
