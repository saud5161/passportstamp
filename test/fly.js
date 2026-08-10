/* global pdfjsLib, supabase */
"use strict";

pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";

const SUPABASE_URL = "https://dkrtiuelioyshbjoocqm.supabase.co";
const SUPABASE_KEY = "sb_publishable_ts5SGrWhODsG6EH5dUt9Wg_KUvsf-CF";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ASSET_BASE = new URL(".", location.href).href;
const EMPLOYEE_PREFS_KEY = "fly_employee_prefs_v1";

const DEST_NAMES = {
  RUH: "الرياض", JED: "جدة", DMM: "الدمام", MED: "المدينة المنورة", AHB: "أبها",
  TIF: "الطائف", TUU: "تبوك", ELQ: "القصيم", YNB: "ينبع", GIZ: "جازان", HAS: "حائل",
  KHI: "كراتشي", LHE: "لاهور", ISB: "إسلام أباد", PEW: "بيشاور", SKT: "سيالكوت",
  DAC: "دكا", CGP: "شيتاغونغ", CMB: "كولومبو", MLE: "مالي",
  DEL: "دلهي", BOM: "مومباي", HYD: "حيدر أباد", COK: "كوتشي",
  CAI: "القاهرة", ALY: "الإسكندرية", SSH: "شرم الشيخ", HRG: "الغردقة",
  AMM: "عمّان", BEY: "بيروت", DAM: "دمشق", BGW: "بغداد",
  IST: "إسطنبول", SAW: "إسطنبول", ADB: "إزمير", AYT: "أنطاليا",
  DXB: "دبي", AUH: "أبوظبي", SHJ: "الشارقة", DOH: "الدوحة", KWI: "الكويت", BAH: "البحرين", MCT: "مسقط",
  ATH: "أثينا", ZRH: "زيورخ", GVA: "جنيف", FCO: "روما", MXP: "ميلانو",
  LHR: "لندن", MAN: "مانشستر", CDG: "باريس", FRA: "فرانكفورت", MUC: "ميونخ",
  VIE: "فيينا", MAD: "مدريد", BCN: "برشلونة", AMS: "أمستردام", BRU: "بروكسل",
  IAD: "واشنطن", JFK: "نيويورك", LAX: "لوس أنجلوس", ORD: "شيكاغو",
  KUL: "كوالالمبور", SIN: "سنغافورة", BKK: "بانكوك", CGK: "جاكرتا", MNL: "مانيلا",
  TAS: "طشقند", ALA: "ألماتي", IKA: "طهران", GYD: "باكو", TBS: "تبليسي",
  NBO: "نيروبي", ADD: "أديس أبابا", KRT: "الخرطوم", JUB: "جوبا",
  TUN: "تونس", CMN: "الدار البيضاء", ALG: "الجزائر"
};

const MONTHS_EN = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
const MONTHS_AR = {
  "يناير": 0, "فبراير": 1, "مارس": 2, "ابريل": 3, "أبريل": 3, "إبريل": 3, "مايو": 4, "يونيو": 5, "يوليو": 6,
  "اغسطس": 7, "أغسطس": 7, "سبتمبر": 8, "اكتوبر": 9, "أكتوبر": 9, "نوفمبر": 10, "ديسمبر": 11
};

const state = {
  flights: [],
  airline: "",
  origin: "",
  reportDate: ""
};

const trackState = { isActive: false, timer: null, flights: [] };

const elements = {
  todayLabel: document.getElementById("today-label"),
  connectionBadge: document.getElementById("connection-badge"),

  tabAdd: document.getElementById("tab-add"),
  tabTrack: document.getElementById("tab-track"),
  resetDbBtn: document.getElementById("reset-db-btn"),
  viewAdd: document.getElementById("view-add"),
  viewTrack: document.getElementById("view-track"),

  input: document.getElementById("flights-input"),
  choose: document.getElementById("choose-file"),
  dropZone: document.getElementById("drop-zone"),
  fileStatus: document.getElementById("file-status"),
  reset: document.getElementById("reset-all"),
  summary: document.getElementById("report-summary"),
  flightsCount: document.getElementById("flights-count"),
  reportOrigin: document.getElementById("report-origin"),
  reportDate: document.getElementById("report-date"),
  flightsList: document.getElementById("flights-list"),
  setupPanel: document.getElementById("setup-panel"),
  carrierEmployee: document.getElementById("carrier-employee"),
  passportEmployee: document.getElementById("passport-employee"),
  carrierSignatureCanvas: document.getElementById("carrier-signature-pad"),
  passportSignatureCanvas: document.getElementById("passport-signature-pad"),
  clearCarrierSignature: document.getElementById("clear-carrier-signature"),
  clearPassportSignature: document.getElementById("clear-passport-signature"),
  generateForms: document.getElementById("generate-forms"),
  printToolbar: document.getElementById("print-toolbar"),
  generatedCount: document.getElementById("generated-count"),
  backToEdit: document.getElementById("back-to-edit"),
  printForms: document.getElementById("print-forms"),
  printRoot: document.getElementById("print-root"),
  toast: document.getElementById("toast"),

  manualFlightNumber: document.getElementById("manual-flight-number"),
  manualDestination: document.getElementById("manual-destination"),
  manualTime: document.getElementById("manual-time"),
  manualAddBtn: document.getElementById("manual-add-btn"),

  textBulkInput: document.getElementById("text-bulk-input"),
  textBulkParse: document.getElementById("text-bulk-parse"),
  textBulkResult: document.getElementById("text-bulk-result"),

  trackActiveCount: document.getElementById("track-active-count"),
  trackAlertCount: document.getElementById("track-alert-count"),
  trackCompletedCount: document.getElementById("track-completed-count"),
  trackUpdatedAt: document.getElementById("track-updated-at"),
  trackRefresh: document.getElementById("track-refresh"),
  trackList: document.getElementById("track-list"),
  trackCompletedList: document.getElementById("track-completed-list"),
  trackClockInput: document.getElementById("track-clock-input"),
  trackClockReset: document.getElementById("track-clock-reset")
};

/* ========== لوحات توقيع الموظفين (محفوظة دائمًا في المتصفح) ========== */
const CARRIER_SIGNATURE_KEY = "fly_carrier_signature_v1";
const PASSPORT_SIGNATURE_KEY = "fly_passport_signature_v1";

function createSignaturePad(canvas, storageKey) {
  const ctx = canvas.getContext("2d");
  ctx.strokeStyle = "#1a3fd6";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  let drawing = false;
  let lastPoint = null;
  let empty = true;

  const getPos = event => {
    const rect = canvas.getBoundingClientRect();
    const point = event.touches ? event.touches[0] : event;
    return {
      x: (point.clientX - rect.left) * (canvas.width / rect.width),
      y: (point.clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const persist = () => {
    try { localStorage.setItem(storageKey, canvas.toDataURL("image/png")); } catch (error) { /* */ }
  };

  const start = event => {
    event.preventDefault();
    drawing = true;
    empty = false;
    lastPoint = getPos(event);
  };

  const move = event => {
    if (!drawing) return;
    event.preventDefault();
    const point = getPos(event);
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint = point;
  };

  const end = () => {
    if (drawing) persist();
    drawing = false;
    lastPoint = null;
  };

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);

  const pad = {
    clear: () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      empty = true;
      try { localStorage.removeItem(storageKey); } catch (error) { /* */ }
    },
    isEmpty: () => empty,
    toDataUrl: () => canvas.toDataURL("image/png"),
    restore: () => {
      try {
        const saved = localStorage.getItem(storageKey);
        if (!saved) return;
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          empty = false;
        };
        img.src = saved;
      } catch (error) { /* تجاهل بيانات تالفة */ }
    }
  };

  pad.restore();
  return pad;
}

const carrierSignaturePad = createSignaturePad(elements.carrierSignatureCanvas, CARRIER_SIGNATURE_KEY);
const passportSignaturePad = createSignaturePad(elements.passportSignatureCanvas, PASSPORT_SIGNATURE_KEY);

function signatureImgHtml(pad) {
  return pad.isEmpty() ? "" : `<img class="sig-img" src="${pad.toDataUrl()}" alt="توقيع">`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function destinationName(code) {
  return DEST_NAMES[code] || code;
}

function resolveDestinationCode(rawValue) {
  const value = rawValue.trim();
  if (!value) return null;
  if (/^[A-Za-z]{3}$/.test(value)) return value.toUpperCase();

  const exactMatch = Object.entries(DEST_NAMES).find(([, name]) => name === value);
  if (exactMatch) return exactMatch[0];

  const partialMatch = Object.entries(DEST_NAMES).find(([, name]) => name.includes(value) || value.includes(name));
  return partialMatch ? partialMatch[0] : null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatTime(raw) {
  if (!raw || raw.length !== 4) return raw || "-";
  return `${raw.slice(0, 2)}:${raw.slice(2)}`;
}

// كل الأوقات في النظام تُعرض بصيغة 24 ساعة
function formatClock(iso) {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function getHijriDate(date) {
  const formatter = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", {
    year: "numeric", month: "numeric", day: "numeric"
  });
  const parts = formatter.formatToParts(date);
  const day = parts.find(part => part.type === "day").value;
  const month = parts.find(part => part.type === "month").value;
  const year = (parts.find(part => part.type === "year") || parts.find(part => part.type === "relatedYear")).value;
  return { day, month, yearFull: year, yearShort: year.slice(-2) };
}

function updateTodayLabel() {
  const formatter = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  elements.todayLabel.textContent = formatter.format(new Date());
}

function setConnectionStatus(ok) {
  elements.connectionBadge.textContent = ok ? "🟢 النظام يعمل حاليًا" : "🔴 النظام غير متصل حاليًا";
}

async function checkConnection() {
  try {
    const { error } = await supabaseClient.from("flights").select("id", { count: "exact", head: true });
    if (error) throw error;
    setConnectionStatus(true);
  } catch (error) {
    console.error(error);
    setConnectionStatus(false);
  }
}

/* ========== تفضيلات أسماء الموظفين فقط (وليست الرحلات) ========== */
function saveEmployeePrefs() {
  try {
    localStorage.setItem(EMPLOYEE_PREFS_KEY, JSON.stringify({
      carrier: elements.carrierEmployee.value,
      passport: elements.passportEmployee.value
    }));
  } catch (error) { /* التخزين المحلي غير متاح */ }
}

function loadEmployeePrefs() {
  try {
    const raw = localStorage.getItem(EMPLOYEE_PREFS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.carrier) elements.carrierEmployee.value = saved.carrier;
    if (saved.passport) elements.passportEmployee.value = saved.passport;
  } catch (error) { /* تجاهل بيانات تالفة */ }
}

/* قائمة الرحلات المستخرجة مصدرها الوحيد قاعدة البيانات: تبقى معروضة
   دائمًا حتى تُحذف رحلة بعينها أو يُضغط "إعادة تعيين جميع الرحلات". */
async function loadAddViewFlightsFromDb() {
  try {
    const { data, error } = await supabaseClient
      .from("flights")
      .select("*")
      .order("scheduled_at", { ascending: true });
    if (error) throw error;
    state.flights = (data || []).map(row => ({
      id: row.id,
      flightNumber: row.flight_number,
      destinationCode: row.destination_code,
      scheduledAt: row.scheduled_at,
      scheduledTime: isoToHHMM(row.scheduled_at),
      actualTime: row.actual_departure_at ? isoToHHMM(row.actual_departure_at) : ""
    }));
    setConnectionStatus(true);
    renderFlights();
  } catch (error) {
    console.error(error);
    setConnectionStatus(false);
    showToast("تعذر تحميل قائمة الرحلات من قاعدة البيانات.");
  }
}

function buildIsoFromParts(year, monthIndex, day, hour, minute) {
  return new Date(year, monthIndex, day, hour, minute, 0, 0).toISOString();
}

function scheduledIsoFromPdfDate(dateStr, hhmm) {
  const now = new Date();
  const hour = parseInt(hhmm.slice(0, 2), 10);
  const minute = parseInt(hhmm.slice(2), 10);
  const match = /^([0-3]\d)([A-Z]{3})(\d{2})$/i.exec(dateStr || "");
  if (!match) return buildIsoFromParts(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
  const day = parseInt(match[1], 10);
  const monthIndex = MONTHS_EN[match[2].toUpperCase()];
  const year = 2000 + parseInt(match[3], 10);
  return buildIsoFromParts(year, monthIndex, day, hour, minute);
}

function scheduledIsoFromTodayTime(hhmmColon) {
  const [hour, minute] = hhmmColon.split(":").map(Number);
  const now = new Date();
  return buildIsoFromParts(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
}

function isoToHHMM(iso) {
  const d = new Date(iso);
  return `${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

async function saveFlightsToDb(rows) {
  if (!rows.length) return true;
  try {
    const { error } = await supabaseClient.from("flights").insert(rows);
    if (error) throw error;
    setConnectionStatus(true);
    if (trackState.isActive) loadTrackFlights();
    return true;
  } catch (error) {
    console.error(error);
    setConnectionStatus(false);
    showToast("تعذر حفظ الرحلات في قاعدة البيانات.");
    return false;
  }
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

function parseReportHeader(lines) {
  for (const line of lines) {
    const match = line.replace(/\s+/g, " ").trim()
      .match(/^DEPARTURES:\s*([A-Z0-9]+)\s+(\d{2}[A-Z]{3}\d{2})\/(\d{4})-(\d{2}[A-Z]{3}\d{2})\/(\d{4})\s+([A-Z]{3})/i);
    if (match) {
      return {
        airline: match[1].toUpperCase(),
        date: match[2].toUpperCase(),
        origin: match[6].toUpperCase()
      };
    }
  }
  return { airline: "", date: "", origin: "" };
}

function parseFlights(lines) {
  const flights = [];
  const pattern = /^\d+\s+([A-Z]{1,3}\d{1,4})\s+(?:TO|FROM)\*([A-Z]{3})\s+(\d{4})(?:\/A(\d{4}))?/i;

  lines.forEach(lineValue => {
    const line = lineValue.replace(/\s+/g, " ").trim();
    const match = line.match(pattern);
    if (!match) return;
    flights.push({
      id: `${match[1]}-${flights.length + 1}`,
      flightNumber: match[1].toUpperCase(),
      destinationCode: match[2].toUpperCase(),
      scheduledTime: match[3],
      actualTime: match[4] || ""
    });
  });
  return flights;
}

async function extractFlights(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const allLines = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    elements.fileStatus.textContent = `جاري قراءة الصفحة ${pageNumber} من ${pdf.numPages}...`;
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    allLines.push(...linesFromTextContent(textContent));
  }
  return { flights: parseFlights(allLines), header: parseReportHeader(allLines) };
}

function parseBulkText(text) {
  const lines = text.split("\n").map(line => line.trim());
  const flightLineRe = /^([A-Z]{1,3}\d{1,4})\s*-\s*([A-Z]{3})\s*->\s*([A-Z]{3})$/i;
  const timeLineRe = /^(\d{1,2}):(\d{2})\s*(am|pm)?\s*\(([^\-()]+)-(\d{1,2})\)/i;
  const results = [];
  let pending = null;

  lines.forEach(line => {
    if (!line) return;

    const flightMatch = line.match(flightLineRe);
    if (flightMatch) {
      pending = {
        flightNumber: flightMatch[1].toUpperCase(),
        originCode: flightMatch[2].toUpperCase(),
        destinationCode: flightMatch[3].toUpperCase()
      };
      return;
    }

    const timeMatch = line.match(timeLineRe);
    if (timeMatch && pending) {
      let hour = parseInt(timeMatch[1], 10);
      const minute = parseInt(timeMatch[2], 10);
      const ampm = (timeMatch[3] || "").toLowerCase();
      if (ampm === "pm" && hour !== 12) hour += 12;
      if (ampm === "am" && hour === 12) hour = 0;

      const monthName = timeMatch[4].trim();
      const day = parseInt(timeMatch[5], 10);
      const monthIndex = MONTHS_AR[monthName];
      const now = new Date();
      const scheduledIso = monthIndex !== undefined
        ? buildIsoFromParts(now.getFullYear(), monthIndex, day, hour, minute)
        : buildIsoFromParts(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);

      results.push({
        id: `text-${pending.flightNumber}-${results.length}-${Date.now()}`,
        flightNumber: pending.flightNumber,
        originCode: pending.originCode,
        destinationCode: pending.destinationCode,
        scheduledIso
      });
      pending = null;
    }
  });

  return results;
}

const TIME_24H_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

async function addManualFlight() {
  const flightNumber = elements.manualFlightNumber.value.trim().toUpperCase();
  const destinationCode = resolveDestinationCode(elements.manualDestination.value);
  const timeValue = elements.manualTime.value.trim();

  if (!/^[A-Z]{1,3}\d{1,4}$/.test(flightNumber)) { showToast("رقم رحلة غير صحيح."); return; }
  if (!destinationCode) { showToast("وجهة غير معروفة، اكتب الرمز مثل KHI أو اسم المدينة مثل كراتشي."); return; }
  if (!TIME_24H_RE.test(timeValue)) { showToast("صيغة الوقت غير صحيحة، استخدم نظام 24 ساعة مثل 18:30."); return; }

  const scheduledIso = scheduledIsoFromTodayTime(timeValue);

  elements.manualAddBtn.disabled = true;
  const ok = await saveFlightsToDb([{
    flight_number: flightNumber,
    origin_code: "RUH",
    destination_code: destinationCode,
    scheduled_at: scheduledIso,
    source: "manual"
  }]);
  elements.manualAddBtn.disabled = false;

  if (ok) {
    elements.manualFlightNumber.value = "";
    elements.manualDestination.value = "";
    elements.manualTime.value = "";
    await loadAddViewFlightsFromDb();
    showToast(`تمت إضافة الرحلة ${flightNumber}.`);
  }
}

async function parseTextBulk() {
  const text = elements.textBulkInput.value;
  const parsed = parseBulkText(text);

  if (!parsed.length) {
    elements.textBulkResult.textContent = "لم يتم العثور على رحلات بالصيغة المتوقعة.";
    return;
  }

  elements.textBulkParse.disabled = true;
  const ok = await saveFlightsToDb(parsed.map(item => ({
    flight_number: item.flightNumber,
    origin_code: item.originCode,
    destination_code: item.destinationCode,
    scheduled_at: item.scheduledIso,
    source: "text"
  })));
  elements.textBulkParse.disabled = false;

  if (ok) {
    elements.textBulkResult.textContent = `تم استخراج ${parsed.length} رحلة.`;
    elements.textBulkInput.value = "";
    await loadAddViewFlightsFromDb();
    showToast(`تم استخراج ${parsed.length} رحلة من النص.`);
  }
}

function renderFlights() {
  elements.flightsCount.textContent = state.flights.length;
  elements.reportOrigin.textContent = state.origin ? destinationName(state.origin) : "-";
  elements.reportDate.textContent = state.reportDate || "-";
  elements.summary.hidden = !state.flights.length;
  elements.setupPanel.hidden = !state.flights.length;

  if (!state.flights.length) {
    elements.flightsList.innerHTML = `
      <div class="empty-state">
        <span>✈️</span>
        <strong>لم يتم إرفاق ملف رحلات بعد</strong>
        <p>ستظهر هنا كل رحلة ووجهتها ووقتها فور إرفاق الملف.</p>
      </div>`;
    return;
  }

  elements.flightsList.innerHTML = state.flights.map((flight, index) => `
    <div class="flight-row">
      <span class="flight-index">${index + 1}</span>
      <div class="flight-main">
        <div class="flight-number">${escapeHtml(flight.flightNumber)}</div>
        <div class="flight-dest">${escapeHtml(destinationName(flight.destinationCode))} <small>(${escapeHtml(flight.destinationCode)})</small></div>
      </div>
      <div class="flight-times">
        <span class="time-scheduled">مجدول ${escapeHtml(formatTime(flight.scheduledTime))}</span>
        ${flight.actualTime ? `<span class="time-actual">فعلي ${escapeHtml(formatTime(flight.actualTime))}</span>` : ""}
      </div>
      <button class="flight-remove" type="button" data-remove-flight="${escapeHtml(flight.id)}" title="حذف الرحلة">×</button>
    </div>`).join("");
}

async function removeFlight(id) {
  state.flights = state.flights.filter(flight => flight.id !== id);
  renderFlights();
  try {
    const { error } = await supabaseClient.from("flights").delete().eq("id", id);
    if (error) throw error;
    if (trackState.isActive) loadTrackFlights();
  } catch (error) {
    console.error(error);
    showToast("تعذر حذف الرحلة من قاعدة البيانات.");
  }
}

function airportHeaderHtml() {
  return `
    <div class="form-header">
      <div class="airport-block">
        <img class="airport-logo" src="${ASSET_BASE}assets/riyadh-airports-logo.png" alt="مطارات الرياض">
      </div>
      <div class="airport-block">
        <img class="airport-logo" src="${ASSET_BASE}assets/king-khalid-logo.png" alt="مطار الملك خالد الدولي">
      </div>
    </div>`;
}

function getWeekdayName(date) {
  return new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(date);
}

function buildFlightPageHtml(flight) {
  const flightDate = flight.scheduledAt ? new Date(flight.scheduledAt) : new Date();
  const hijri = getHijriDate(flightDate);
  const weekday = getWeekdayName(flightDate);
  const carrierName = escapeHtml(elements.carrierEmployee.value.trim());
  const passportName = escapeHtml(elements.passportEmployee.value.trim());
  const actualOrScheduled = flight.actualTime || flight.scheduledTime;
  const flightInfo = `${escapeHtml(flight.flightNumber)} / ${escapeHtml(destinationName(flight.destinationCode))} (${escapeHtml(flight.destinationCode)})`;
  const carrierSignature = signatureImgHtml(carrierSignaturePad);
  const passportSignature = signatureImgHtml(passportSignaturePad);

  return `
    <div class="flight-card">
      ${airportHeaderHtml()}

      <table class="manifest-table">
        <colgroup>
          <col style="width:32%"><col style="width:30%"><col style="width:20%"><col style="width:18%">
        </colgroup>
        <tr class="title-row"><td colspan="4">نموذج تسليم بيان الركاب (المنفست)</td></tr>
        <tr>
          <td class="header-cell">اليوم والتاريخ</td>
          <td class="header-cell">رقم الرحلة / وجهة المغادرة</td>
          <td class="header-cell">الوقت الفعلي</td>
          <td class="header-cell">وقت التسليم</td>
        </tr>
        <tr>
          <td class="data-cell">${escapeHtml(weekday)} - <span class="ltr-value">${hijri.yearFull}/${hijri.month}/${hijri.day}</span>هـ</td>
          <td class="data-cell ltr-value">${flightInfo}</td>
          <td class="data-cell ltr-value">${escapeHtml(formatTime(actualOrScheduled))}</td>
          <td class="data-cell"></td>
        </tr>
        <tr>
          <td class="header-cell">أسم موظف الشركة الناقلة</td>
          <td class="header-cell">التوقيع</td>
          <td class="header-cell">وقت أستلام النموذج</td>
          <td class="header-cell">عدد الركاب المغادرين</td>
        </tr>
        <tr>
          <td class="data-cell">${carrierName}</td>
          <td class="data-cell">${carrierSignature}</td>
          <td class="data-cell"></td>
          <td class="data-cell"></td>
        </tr>
        <tr><td class="section-cell" colspan="4">الجوازات</td></tr>
        <tr>
          <td class="header-cell">وقت أستلام بيان الركاب (المنفست)</td>
          <td class="data-cell value-wide" colspan="3"></td>
        </tr>
        <tr>
          <td class="header-cell">أسم الموظف</td>
          <td class="data-cell value-wide" colspan="3">${passportName}</td>
        </tr>
        <tr>
          <td class="header-cell">التوقيع</td>
          <td class="data-cell value-wide" colspan="3">${passportSignature}</td>
        </tr>
      </table>

      <div class="form-body-spacer"></div>

      <div class="form-footer-block">
        <p class="form-code">ع.ق (نموذج تسليم منفست)</p>
        <p>- نسخة / جوازات المطار</p>
        <p>- نسخة / الشركة الناقلة</p>
      </div>

      <div class="form-page-footer">
        <span>Classified as Internal Use Only</span>
      </div>
    </div>`;
}

function generateForms() {
  if (!state.flights.length) return;

  elements.printRoot.innerHTML = state.flights
    .map(flight => buildFlightPageHtml(flight))
    .join("");
  elements.printRoot.hidden = false;
  elements.generatedCount.textContent = state.flights.length;
  elements.printToolbar.hidden = false;
  elements.setupPanel.hidden = true;
  document.querySelector(".flights-panel").hidden = true;
  document.querySelector(".add-tools-panel").hidden = true;
  document.getElementById("drop-zone").hidden = true;
  elements.summary.hidden = true;
  elements.printToolbar.scrollIntoView({ behavior: "smooth" });
  showToast(`تم عرض ${state.flights.length} نموذج بنجاح.`);
}

function backToEdit() {
  elements.printRoot.innerHTML = "";
  elements.printRoot.hidden = true;
  elements.printToolbar.hidden = true;
  elements.setupPanel.hidden = false;
  document.querySelector(".flights-panel").hidden = false;
  document.querySelector(".add-tools-panel").hidden = false;
  document.getElementById("drop-zone").hidden = false;
  elements.summary.hidden = false;
}

/* أنماط الطباعة مضمّنة بالكامل داخل نافذة الطباعة (مستقلة عن fly.css)
   حتى لا تتأثر بأي أنماط شاشة. الارتفاع 296mm وليس 297mm عمدًا: فرق
   التقريب في المتصفحات يجعل عنصرًا بارتفاع الصفحة الكامل "ينزف" بضعة
   بكسلات إلى الصفحة التالية فتتداخل النماذج فوق بعضها. */
const PRINT_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0; padding: 0; background: #9aa8a2; }

  /* flex على #print-root فقط للمعاينة قبل الطباعة (لتوسيط البطاقات على الشاشة).
     أثناء الطباعة الفعلية يجب أن يكون block: محركات WebKit على الجوال (iOS)
     لا تُطبّق page-break-after بشكل موثوق على عناصر داخل حاوية flex، ما كان
     يُنتج صفحات فارغة/زائدة عند الطباعة من الجوال. */
  #print-root { display: flex; flex-direction: column; align-items: center; }
  @media print {
    #print-root { display: block !important; }
  }

  .flight-card {
    width: 210mm;
    height: 270mm;
    padding: 10mm 12mm 8mm;
    background: #fff;
    color: #000;
    font-family: Arial, "Segoe UI", Tahoma, sans-serif;
    direction: rtl;
    unicode-bidi: embed;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
    page-break-after: always;
    page-break-inside: avoid;
    break-after: page;
    break-inside: avoid;
  }
  @media print {
    .flight-card { margin: 0 auto; }
  }
  .flight-card:last-child { page-break-after: auto; break-after: auto; }

  .form-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2mm 0;
    gap: 6mm;
    flex-shrink: 0;
  }
  .airport-block { display: flex; align-items: center; justify-content: center; flex: 1; min-width: 0; }
  .airport-logo {
    max-height: 16mm;
    max-width: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
  }

  .manifest-table {
    width: 100%;
    border-collapse: collapse;
    border: 0.7mm solid #000;
    table-layout: fixed;
    direction: rtl;
    margin: 14mm 0 0;
    flex-shrink: 0;
  }
  .manifest-table td {
    border: 0.4mm solid #000;
    padding: 3.2mm 2.4mm;
    font-size: 12.5pt;
    text-align: center;
    vertical-align: middle;
    word-wrap: break-word;
    color: #000;
    direction: rtl;
    unicode-bidi: embed;
  }
  .manifest-table .title-row td { font-size: 15pt; font-weight: 900; padding: 4.5mm; background: #f4f4f4; }
  .manifest-table .header-cell { font-weight: 800; background: #f8f8f8; font-size: 10pt; }
  .manifest-table .section-cell { font-weight: 900; background: #ececec; text-align: center; font-size: 13pt; padding: 3.5mm; }
  .manifest-table .data-cell { height: 12mm; position: relative; overflow: visible; }
  .sig-img {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    max-height: 22mm;
    max-width: 96%;
    object-fit: contain;
  }
  .manifest-table .value-wide { text-align: center; }
  .manifest-table .ltr-value { direction: ltr; unicode-bidi: plaintext; font-weight: 400; font-size: 11pt; }

  .form-body-spacer { flex: 1 1 auto; }

  .form-footer-block {
    flex-shrink: 0;
    padding: 0 2mm 4mm;
    text-align: right;
    font-size: 10.5pt;
    color: #000;
    line-height: 1.5;
    direction: rtl;
    unicode-bidi: embed;
  }
  .form-footer-block .form-code { margin: 0 0 2mm; font-weight: 800; }
  .form-footer-block p { margin: 1mm 0; font-size: 10pt; }

  .form-page-footer {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 2.5mm 2mm 0;
    border-top: 0.3mm solid #999;
    font-size: 8.5pt;
    color: #444;
    direction: rtl;
  }

  /* معاينة على الشاشة داخل نافذة الطباعة فقط */
  @media screen {
    body { padding: 8mm 0; }
    .flight-card { margin-bottom: 8mm; box-shadow: 0 4px 18px rgba(0,0,0,.3); }
  }
  @media print {
    html, body { background: #fff; }
    .flight-card { margin: 0; box-shadow: none; }
  }
`;

function printForms() {
  if (!elements.printRoot.innerHTML.trim()) return;

  const printWindow = window.open("", "_blank", "width=850,height=1100");
  if (!printWindow) {
    showToast("الرجاء السماح بالنوافذ المنبثقة لطباعة النماذج.");
    return;
  }

  const doc = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=820">
<title>طباعة نماذج التسليم</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<section id="print-root">${elements.printRoot.innerHTML}</section>
<script>
  window.addEventListener("load", () => {
    setTimeout(() => { window.focus(); window.print(); }, 350);
  });
<\/script>
</body>
</html>`;

  printWindow.document.write(doc);
  printWindow.document.close();
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
    const { flights, header } = await extractFlights(file);
    if (!flights.length) {
      throw new Error("لم يتم العثور على رحلات بالنمط المتوقع داخل الملف.");
    }
    state.airline = header.airline;
    state.origin = header.origin;
    state.reportDate = header.date;
    elements.fileStatus.textContent = `${file.name} - تم استخراج ${flights.length} رحلة بنجاح`;

    const ok = await saveFlightsToDb(flights.map(flight => ({
      flight_number: flight.flightNumber,
      origin_code: header.origin || "RUH",
      destination_code: flight.destinationCode,
      scheduled_at: scheduledIsoFromPdfDate(header.date, flight.scheduledTime),
      source: "pdf"
    })));

    if (ok) {
      await loadAddViewFlightsFromDb();
      showToast(`تم استخراج ${flights.length} رحلة.`);
    }
  } catch (error) {
    console.error(error);
    elements.fileStatus.textContent = "تعذر قراءة الملف. تأكد أن الملف بنفس تنسيق تقرير الرحلات.";
    showToast(error.message || "حدث خطأ أثناء قراءة PDF.");
  } finally {
    elements.choose.disabled = false;
    elements.input.value = "";
  }
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2600);
}

/* ========== تبويبات الصفحة (يُحفظ آخر اختيار في المتصفح) ========== */
const ACTIVE_TAB_KEY = "fly_active_tab_v1";

function setActiveTab(tab) {
  const isAdd = tab === "add";
  elements.tabAdd.classList.toggle("active", isAdd);
  elements.tabTrack.classList.toggle("active", !isAdd);
  elements.viewAdd.hidden = !isAdd;
  elements.viewTrack.hidden = isAdd;

  try { localStorage.setItem(ACTIVE_TAB_KEY, tab); } catch (error) { /* */ }

  if (isAdd) {
    trackState.isActive = false;
    if (trackState.timer) { clearInterval(trackState.timer); trackState.timer = null; }
  } else {
    trackState.isActive = true;
    tickTrackClock();
    loadTrackFlights();
    if (!trackState.timer) trackState.timer = setInterval(() => { tickTrackClock(); loadTrackFlights(); }, 20000);
  }
}

/* ========== ساعة الوقت الحالي الموحدة (لتسجيل الإقلاع الفعلي) ========== */
function tickTrackClock() {
  if (elements.trackClockInput.dataset.userEdited === "1") return;
  const now = new Date();
  elements.trackClockInput.value = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

elements.trackClockInput.addEventListener("input", () => {
  elements.trackClockInput.dataset.userEdited = "1";
});

elements.trackClockReset.addEventListener("click", () => {
  elements.trackClockInput.dataset.userEdited = "0";
  tickTrackClock();
});

/* ========== لوحة متابعة الرحلات ========== */
async function loadTrackFlights() {
  try {
    const { data, error } = await supabaseClient
      .from("flights")
      .select("*")
      .order("scheduled_at", { ascending: true });
    if (error) throw error;
    trackState.flights = data || [];
    setConnectionStatus(true);
    renderTrackDashboard();
  } catch (error) {
    console.error(error);
    setConnectionStatus(false);
    showToast("تعذر تحميل الرحلات من قاعدة البيانات.");
  }
}

function getFlightPhase(flight, now) {
  const scheduled = new Date(flight.scheduled_at).getTime();
  const minsToDeparture = (scheduled - now.getTime()) / 60000;
  return {
    minsToDeparture,
    delivered: Boolean(flight.delivered_at),
    departed: Boolean(flight.actual_departure_at),
    needDelivery: !flight.delivered_at && minsToDeparture <= 60,
    needDepartureConfirm: !flight.actual_departure_at && minsToDeparture <= 25,
    canDeliver: !flight.delivered_at && !flight.actual_departure_at,
    canDepart: !flight.actual_departure_at
  };
}

function renderTrackDashboard() {
  const now = new Date();
  const active = trackState.flights.filter(flight => !flight.actual_departure_at);
  const completed = trackState.flights
    .filter(flight => flight.actual_departure_at)
    .sort((a, b) => new Date(b.actual_departure_at) - new Date(a.actual_departure_at));

  const alertCount = active.filter(flight => getFlightPhase(flight, now).needDelivery).length;

  elements.trackActiveCount.textContent = active.length;
  elements.trackAlertCount.textContent = alertCount;
  elements.trackCompletedCount.textContent = completed.length;
  elements.trackUpdatedAt.textContent = `آخر تحديث: ${formatClock(now.toISOString())}`;

  if (!active.length) {
    elements.trackList.innerHTML = `
      <div class="empty-state">
        <span>📭</span>
        <strong>لا توجد رحلات قيد المتابعة</strong>
        <p>أضف رحلات من تبويب "إضافة رحلات" لتظهر هنا.</p>
      </div>`;
  } else {
    elements.trackList.innerHTML = active.map(flight => {
      const phase = getFlightPhase(flight, now);
      const cardClasses = ["track-card"];
      if (phase.needDepartureConfirm) cardClasses.push("is-alert-departure");
      else if (phase.needDelivery) cardClasses.push("is-alert-delivery");
      else if (phase.delivered) cardClasses.push("is-delivered");

      let badges = "";
      if (phase.delivered) badges += `<span class="track-badge delivered">✓ تم التسليم <b>${formatClock(flight.delivered_at)}</b></span>`;
      if (phase.needDelivery) badges += `<span class="track-badge need-delivery">⚠️ يجب طباعة بيان الركاب</span>`;
      if (phase.needDepartureConfirm) badges += `<span class="track-badge need-departure">🛫 اقتراب الإقلاع</span>`;

      let actions = "";
      if (phase.canDeliver) {
        actions += `<button class="track-action-btn deliver" data-deliver="${flight.id}">✅ تم التسليم</button>`;
      }
      if (phase.canDepart) {
        actions += `<button class="track-action-btn depart" data-depart="${flight.id}">🛫 تم الإقلاع</button>`;
      }

      return `
        <div class="${cardClasses.join(" ")}">
          <div class="track-card-main">
            <div class="track-flight-no">${escapeHtml(flight.flight_number)}</div>
            <div class="track-dest">${escapeHtml(destinationName(flight.destination_code))} <small>(${escapeHtml(flight.destination_code)})</small></div>
            <div class="track-time">🕐 مجدول <b>${formatClock(flight.scheduled_at)}</b></div>
          </div>
          <div class="track-card-status">
            ${badges}
            ${actions}
          </div>
        </div>`;
    }).join("");
  }

  if (!completed.length) {
    elements.trackCompletedList.innerHTML = `<p class="hint">لا توجد رحلات مكتملة بعد.</p>`;
  } else {
    elements.trackCompletedList.innerHTML = completed.map(flight => `
      <div class="track-completed-row">
        <span class="cr-flight"><b>${escapeHtml(flight.flight_number)}</b> — ${escapeHtml(destinationName(flight.destination_code))}</span>
        <span>تسليم المنفست: <b>${flight.delivered_at ? formatClock(flight.delivered_at) : "-"}</b></span>
        <span>الإقلاع الفعلي: <b>${formatClock(flight.actual_departure_at)}</b></span>
      </div>`).join("");
  }
}

elements.trackList.addEventListener("click", async event => {
  const deliverBtn = event.target.closest("[data-deliver]");
  if (deliverBtn) {
    const id = deliverBtn.dataset.deliver;
    deliverBtn.disabled = true;
    try {
      const { error } = await supabaseClient.from("flights").update({ delivered_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      showToast("تم تسجيل وقت التسليم.");
      loadTrackFlights();
    } catch (error) {
      console.error(error);
      showToast("تعذر تسجيل وقت التسليم.");
      deliverBtn.disabled = false;
    }
    return;
  }

  const departBtn = event.target.closest("[data-depart]");
  if (departBtn) {
    const id = departBtn.dataset.depart;
    const timeValue = elements.trackClockInput.value.trim();
    if (!TIME_24H_RE.test(timeValue)) {
      showToast("يرجى ضبط الوقت الحالي أعلى اللوحة بصيغة صحيحة (مثل 18:30).");
      return;
    }

    const flight = trackState.flights.find(item => item.id === id);
    if (!flight) return;

    const scheduledDate = new Date(flight.scheduled_at);
    const [hour, minute] = timeValue.split(":").map(Number);
    const actualIso = buildIsoFromParts(scheduledDate.getFullYear(), scheduledDate.getMonth(), scheduledDate.getDate(), hour, minute);

    departBtn.disabled = true;
    try {
      const { error } = await supabaseClient.from("flights").update({ actual_departure_at: actualIso }).eq("id", id);
      if (error) throw error;
      showToast("تم تسجيل الإقلاع الفعلي.");
      loadTrackFlights();
    } catch (error) {
      console.error(error);
      showToast("تعذر تسجيل الإقلاع الفعلي.");
      departBtn.disabled = false;
    }
  }
});

elements.trackRefresh.addEventListener("click", loadTrackFlights);

elements.tabAdd.addEventListener("click", () => setActiveTab("add"));
elements.tabTrack.addEventListener("click", () => setActiveTab("track"));

elements.resetDbBtn.addEventListener("click", async () => {
  if (!confirm("سيتم حذف جميع الرحلات المخزنة نهائيًا من قاعدة البيانات. هل تريد المتابعة؟")) return;
  try {
    const { error } = await supabaseClient.from("flights").delete().gte("created_at", "1900-01-01T00:00:00Z");
    if (error) throw error;
    showToast("تم حذف جميع الرحلات المخزنة.");
    await loadAddViewFlightsFromDb();
    if (trackState.isActive) loadTrackFlights();
  } catch (error) {
    console.error(error);
    showToast("تعذر حذف الرحلات من قاعدة البيانات.");
  }
});

elements.choose.addEventListener("click", () => elements.input.click());
elements.input.addEventListener("change", event => handleFile(event.target.files[0]));

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

elements.flightsList.addEventListener("click", event => {
  const removeButton = event.target.closest("[data-remove-flight]");
  if (removeButton) removeFlight(removeButton.dataset.removeFlight);
});

elements.clearCarrierSignature.addEventListener("click", () => carrierSignaturePad.clear());
elements.clearPassportSignature.addEventListener("click", () => passportSignaturePad.clear());

elements.manualAddBtn.addEventListener("click", addManualFlight);
elements.textBulkParse.addEventListener("click", parseTextBulk);

elements.carrierEmployee.addEventListener("input", saveEmployeePrefs);
elements.passportEmployee.addEventListener("input", saveEmployeePrefs);

elements.generateForms.addEventListener("click", generateForms);
elements.backToEdit.addEventListener("click", backToEdit);
elements.printForms.addEventListener("click", printForms);

elements.reset.addEventListener("click", async () => {
  if (!confirm("سيتم مسح بيانات الإعداد الحالية والعودة لواجهة الرفع (لن يتم حذف الرحلات من القاعدة). هل تريد المتابعة؟")) return;
  state.airline = "";
  state.origin = "";
  state.reportDate = "";
  elements.carrierEmployee.value = "";
  elements.passportEmployee.value = "";
  saveEmployeePrefs();
  backToEdit();
  elements.fileStatus.textContent = "اسحب ملف الرحلات هنا، أو اختره من الجهاز";
  await loadAddViewFlightsFromDb();
});

updateTodayLabel();
setInterval(updateTodayLabel, 60000);
loadEmployeePrefs();
renderFlights();
loadAddViewFlightsFromDb();

let savedTab = "add";
try { savedTab = localStorage.getItem(ACTIVE_TAB_KEY) || "add"; } catch (error) { /* */ }
setActiveTab(savedTab === "track" ? "track" : "add");
