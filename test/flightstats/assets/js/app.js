"use strict";

/* ======================================================================
   لوحة رحلات مطار الملك خالد الدولي
   - يحاول جلب بيانات حية من AeroDataBox (عبر RapidAPI) إن توفر مفتاح صالح
   - في حال عدم توفر مفتاح، أو فشل الاتصال (CORS / حد الطلبات...) تُعرض
     بيانات تجريبية واقعية حتى تبقى الصفحة قابلة للاستخدام والعرض فوراً
   ====================================================================== */

const CFG = window.APP_CONFIG || {};
const KEY_PLACEHOLDER = "ضع_مفتاح_RapidAPI_هنا";
const HAS_KEY = !!(CFG.RAPIDAPI_KEY && CFG.RAPIDAPI_KEY !== KEY_PLACEHOLDER);

const AIRLINES = [
  { code: "SV", name: "الخطوط السعودية" },
  { code: "XY", name: "طيران ناس" },
  { code: "F3", name: "طيران أديل" },
  { code: "EK", name: "طيران الإمارات" },
  { code: "QR", name: "الخطوط القطرية" },
  { code: "TK", name: "الخطوط التركية" },
  { code: "MS", name: "مصر للطيران" },
  { code: "EY", name: "الاتحاد للطيران" },
  { code: "KU", name: "الخطوط الكويتية" },
  { code: "GF", name: "طيران الخليج" },
  { code: "LH", name: "لوفتهانزا" },
  { code: "BA", name: "الخطوط البريطانية" },
];

const CITIES = [
  "جدة", "الدمام", "المدينة المنورة", "أبها", "تبوك", "دبي", "الدوحة",
  "القاهرة", "اسطنبول", "لندن", "فرانكفورت", "الكويت", "المنامة",
  "أبوظبي", "بيروت", "عمّان", "جاكرتا", "كوالالمبور", "مومباي", "إسلام آباد",
];

const TERMINALS = ["الصالة 1", "الصالة 2", "الصالة 5"];

const STATUS_MAP = {
  "scheduled": { label: "مجدولة", cls: "scheduled" },
  "boarding": { label: "صعود الركاب", cls: "boarding" },
  "on-time": { label: "في الوقت المحدد", cls: "on-time" },
  "delayed": { label: "متأخرة", cls: "delayed" },
  "departed": { label: "أقلعت", cls: "departed" },
  "landed": { label: "هبطت", cls: "landed" },
  "cancelled": { label: "ملغاة", cls: "cancelled" },
};

// تصحيحات يدوية لأسماء شركات طيران تظهر بشكل خاطئ في قاعدة بيانات موقع kkia.sa نفسه
// (مثال: رمز "RA" مسجّل خطأً باسم "ليف أفياشن" بدل "طيران الرياض")
const AIRLINE_NAME_OVERRIDES = {
  RA: "طيران الرياض",
  RX: "طيران الرياض",
};

// تعريف أعمدة الجدول - تُستخدم لبناء الترويسة والصفوف والتصدير مع دعم إخفاء/إظهار أي عمود
const COLUMNS = [
  { key: "type", label: "النوع" },
  { key: "flightNo", label: "رقم الرحلة" },
  { key: "airline", label: "شركة الطيران" },
  { key: "city", label: "المدينة / المطار" },
  { key: "terminal", label: "الصالة" },
  { key: "gate", label: "البوابة" },
  { key: "scheduled", label: "الوقت المجدول" },
  { key: "actual", label: "الوقت الفعلي/المتوقع" },
  { key: "status", label: "الحالة" },
  { key: "pax", label: "عدد الركاب" },
];

const COLUMNS_STORAGE_KEY = "ruhFlights.columns";

function loadColumnVisibility() {
  const defaults = {};
  COLUMNS.forEach((c) => { defaults[c.key] = true; });
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") return { ...defaults, ...saved };
  } catch {}
  return defaults;
}

function saveColumnVisibility(vis) {
  try { localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(vis)); } catch {}
}

const PAX_STORAGE_KEY = "ruhFlights.paxCounts";
const PAX_EXPECTED = 200; // العدد المتوقع المرجعي لكل رحلة (لتلوين شريط المقارنة)
const PAX_BAR_MAX = 300; // القيمة التي يمثّلها العرض الكامل للشريط (150% من المتوقع)

function loadPaxCounts() {
  try {
    const saved = JSON.parse(localStorage.getItem(PAX_STORAGE_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function savePaxCounts(counts) {
  try { localStorage.setItem(PAX_STORAGE_KEY, JSON.stringify(counts)); } catch {}
}

const TYPE_FILTER_STORAGE_KEY = "ruhFlights.typeFilter";
const TERMINAL_FILTER_STORAGE_KEY = "ruhFlights.terminalFilter";

function loadSavedTypeFilter() {
  try {
    const saved = localStorage.getItem(TYPE_FILTER_STORAGE_KEY);
    return ["all", "arrival", "departure"].includes(saved) ? saved : "all";
  } catch {
    return "all";
  }
}

function saveTypeFilter(val) {
  try { localStorage.setItem(TYPE_FILTER_STORAGE_KEY, val); } catch {}
}

function loadSavedTerminalFilter() {
  try {
    const saved = localStorage.getItem(TERMINAL_FILTER_STORAGE_KEY);
    return saved && (saved === "all" || TERMINALS.includes(saved)) ? saved : "all";
  } catch {
    return "all";
  }
}

function saveTerminalFilter(val) {
  try { localStorage.setItem(TERMINAL_FILTER_STORAGE_KEY, val); } catch {}
}

let state = {
  flights: [],
  loading: false,
  error: null,
  usingMock: true,
  dataSource: "mock",
  columns: loadColumnVisibility(),
  paxCounts: loadPaxCounts(),
  filters: {
    type: loadSavedTypeFilter(),
    terminal: loadSavedTerminalFilter(),
    status: "all",
    airline: "all",
    date: todayStr(),
    timeFrom: "",
    timeTo: "",
    upcomingOnly: false,
    q: "",
  },
};

/* ---------------------------- Helpers ---------------------------- */

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function pad(n) { return String(n).padStart(2, "0"); }

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[rand(0, arr.length - 1)]; }

function fmtTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fmtClockDate(d) {
  return d.toLocaleDateString("ar-SA-u-nu-latn", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

/* ---------------------------- Mock data generator ---------------------------- */

function generateMockFlights(dateStr) {
  const baseDate = new Date(dateStr + "T00:00:00");
  const flights = [];
  const statusesArr = ["scheduled", "boarding", "on-time", "delayed", "landed", "cancelled"];
  const statusesDep = ["scheduled", "boarding", "on-time", "delayed", "departed", "cancelled"];

  let idCounter = 1;

  for (let h = 0; h < 24; h++) {
    const flightsThisHour = rand(1, 4);
    for (let i = 0; i < flightsThisHour; i++) {
      const isArrival = Math.random() > 0.5;
      const airline = pick(AIRLINES);
      const city = pick(CITIES);
      const terminal = pick(TERMINALS);
      const minute = pick([0, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
      const scheduled = new Date(baseDate);
      scheduled.setHours(h, minute, 0, 0);

      const status = isArrival ? pick(statusesArr) : pick(statusesDep);
      let actual = new Date(scheduled);
      if (status === "delayed") actual.setMinutes(actual.getMinutes() + rand(15, 90));
      if (status === "on-time" || status === "landed" || status === "departed") actual.setMinutes(actual.getMinutes() + rand(-5, 5));

      flights.push({
        id: `MOCK-${idCounter++}`,
        type: isArrival ? "arrival" : "departure",
        flightNo: `${airline.code}${rand(100, 1999)}`,
        airline: airline.name,
        airlineCode: airline.code,
        city,
        terminal,
        gate: `${pick(["A", "B", "C", "D"])}${rand(1, 28)}`,
        scheduled,
        actual: (status === "scheduled" || status === "cancelled") ? null : actual,
        status,
      });
    }
  }

  flights.sort((a, b) => a.scheduled - b.scheduled);
  return flights;
}

/* ---------------------------- Live API (المصدر الرسمي - موقع مطار الملك خالد الدولي) ----------------------------
   يستخدم نفس واجهة البيانات (API) التي يعتمد عليها موقع kkia.sa نفسه لعرض لوحة المغادرة والقدوم.
   مجانية بالكامل ولا تحتاج مفتاحاً، وتحتوي على وقت "مقدّر" منفصل عن الوقت "المجدول" (تأخير حقيقي)
   بالإضافة إلى بيانات فعلية (بدء الصعود، إغلاق البوابة، استلام الحقائب) تتيح استنتاج حالة دقيقة. */

const KKIA_API_BASE = "https://www.kkia.sa/api";

function toTitleCase(str) {
  if (!str) return str;
  return str.trim().toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

// خرائط الترجمة العربية (رمز المطار/شركة الطيران -> الاسم بالعربي) كما يعرضها موقع kkia.sa نفسه
let CITY_NAME_AR = new Map();
let AIRLINE_NAME_AR = new Map();
let refDataPromise = null;

async function loadReferenceData() {
  if (refDataPromise) return refDataPromise;
  refDataPromise = (async () => {
    try {
      const [destRes, airlineRes] = await Promise.all([
        fetch(`${KKIA_API_BASE}/destination-by-code?language=ar-sa`),
        fetch(`${KKIA_API_BASE}/airline-by-code?language=ar-sa`),
      ]);
      const destData = await destRes.json();
      const airlineData = await airlineRes.json();

      (destData?.destinations?.children?.results || []).forEach((item) => {
        const code = item.fields?.find((f) => f.name === "Airport Code")?.value;
        const cityAr = item.fields?.find((f) => f.name === "City name")?.value;
        if (code && cityAr) CITY_NAME_AR.set(code.toUpperCase(), cityAr);
      });

      (airlineData?.airlines?.children?.results || []).forEach((item) => {
        const code = item.fields?.find((f) => f.name === "Airline Code")?.value;
        const nameAr = item.fields?.find((f) => f.name === "Title")?.value;
        if (code && nameAr) AIRLINE_NAME_AR.set(code.toUpperCase(), nameAr);
      });
    } catch (err) {
      console.error("تعذّر تحميل أسماء الوجهات/شركات الطيران بالعربي:", err);
    }
  })();
  return refDataPromise;
}

// نتحقق أن حدث "فعلي" (ts) وقع فعلاً: يجب أن يكون في الماضي بالنسبة للوقت الحالي (now)
// وأيضاً قريباً معقولاً من وقت الرحلة المجدول (referenceTime). بعض الحقول مثل firstBag
// ترد أحياناً بتاريخ من سنة سابقة (قالب قديم) رغم أن الرحلة الفعلية مستقبلية - نتجاهل
// أي قيمة تبتعد أكثر من 12 ساعة عن الموعد المجدول لأنها غالباً بيانات غير مرتبطة بهذه الرحلة تحديداً.
function isConfirmedPastEvent(ts, referenceTime, now) {
  if (!ts || !referenceTime) return false;
  const t = new Date(ts).getTime();
  const diffHours = Math.abs(t - referenceTime.getTime()) / 3600000;
  if (diffHours > 12) return false;
  return t <= now.getTime();
}

function deriveOfficialStatus(f, now) {
  const isArrival = f.departureOrArrival === "Arrival";
  const ext = (f.flightExtraData && f.flightExtraData[0]) || {};
  const scheduled = f.scheduled ? new Date(f.scheduled) : null;
  const estimated = f.estimated ? new Date(f.estimated) : null;
  const relevantTime = estimated || scheduled;

  if (isArrival) {
    if (isConfirmedPastEvent(f.firstBag, scheduled, now)) return "landed";
    // بديل موثوق عند غياب بيانات استلام الحقائب الصحيحة: إن مضى وقت الوصول المقدَّر فعلياً فالرحلة هبطت على الأرجح
    if (relevantTime && relevantTime.getTime() <= now.getTime()) return "landed";
  } else {
    if (isConfirmedPastEvent(ext.actualGateClosing, scheduled, now)) return "departed";
    if (isConfirmedPastEvent(ext.actualBoarding, scheduled, now) || isConfirmedPastEvent(ext.actualGoToGateCall, scheduled, now)) return "boarding";
  }

  if (scheduled && estimated) {
    const diffMin = Math.round((estimated.getTime() - scheduled.getTime()) / 60000);
    if (diffMin >= 15) return "delayed";
    return "on-time";
  }
  return "scheduled";
}

function normalizeOfficialFlight(f, now) {
  const isArrival = f.departureOrArrival === "Arrival";
  const otherAirport = isArrival ? f.departureAirport : f.arrivalAirport;
  const ext = (f.flightExtraData && f.flightExtraData[0]) || {};
  const gate = f.passengerGate || ext.passengerGate || "—";
  const terminalCode = f.aircraftTerminal || ext.publicTerminal || "";
  const terminalNum = terminalCode.replace(/\D/g, "");

  const scheduled = f.scheduled ? new Date(f.scheduled) : null;
  const estimated = f.estimated ? new Date(f.estimated) : null;

  const airlineCode = (f.airline?.code || "").toUpperCase();
  const otherAirportCode = (otherAirport?.code || "").toUpperCase();

  return {
    id: `KKIA-${f.id}`,
    type: isArrival ? "arrival" : "departure",
    flightNo: `${f.airline?.code || ""} ${f.number || ""}`.trim() || "—",
    airline: AIRLINE_NAME_OVERRIDES[airlineCode] || AIRLINE_NAME_AR.get(airlineCode) || toTitleCase(f.airline?.description) || "غير معروف",
    airlineCode: f.airline?.code || "",
    city: CITY_NAME_AR.get(otherAirportCode) || toTitleCase(otherAirport?.city?.name || otherAirport?.name) || "—",
    terminal: terminalNum ? `الصالة ${terminalNum}` : "—",
    gate,
    scheduled,
    actual: estimated && scheduled && estimated.getTime() !== scheduled.getTime() ? estimated : null,
    status: deriveOfficialStatus(f, now),
  };
}

async function fetchOfficialFlights(dateStr) {
  const [res] = await Promise.all([
    fetch(`${KKIA_API_BASE}/flightsInformation?date=${dateStr}`),
    loadReferenceData(),
  ]);
  if (!res.ok) {
    throw new Error(`فشل الاتصال بموقع المطار الرسمي (رمز ${res.status})`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("استجابة غير متوقعة من موقع المطار الرسمي");
  }
  const now = new Date();
  const normalized = data.map((f) => normalizeOfficialFlight(f, now));
  const onlyAllowedTerminals = normalized.filter((f) => TERMINALS.includes(f.terminal));
  onlyAllowedTerminals.sort((a, b) => (a.scheduled?.getTime() || 0) - (b.scheduled?.getTime() || 0));
  return onlyAllowedTerminals;
}

/* ---------------------------- Live API (AeroDataBox - مصدر احتياطي) ---------------------------- */

function mapApiStatus(raw) {
  // نعيد null عندما لا يوضّح مزود البيانات حالة مؤكدة (مثل "Expected"/"Unknown")
  // حتى لا نعرض "في الوقت المحدد" لرحلة لم تتأكد حالتها فعلياً
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("board")) return "boarding";
  if (s.includes("landed")) return "landed";
  if (s.includes("depart") || s.includes("gate closed")) return "departed";
  if (s.includes("delay") || s.includes("divert")) return "delayed";
  if (s.includes("enroute") || s.includes("approaching")) return "on-time";
  return null;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchLiveWindow(fromLocal, toLocal, retry = true) {
  const icao = CFG.AIRPORT_ICAO || "OERK";
  const url = `https://${CFG.RAPIDAPI_HOST}/flights/airports/icao/${icao}/${fromLocal}/${toLocal}` +
    `?withLeg=true&direction=Both&withCancelled=true&withCodeshared=false&withCargo=false&withPrivate=false&withLocation=false`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-RapidAPI-Key": CFG.RAPIDAPI_KEY,
      "X-RapidAPI-Host": CFG.RAPIDAPI_HOST,
    },
  });

  if (res.status === 429 && retry) {
    // تجاوز الحد المسموح من الطلبات بالثانية على الباقة المجانية - نعيد المحاولة مرة واحدة بعد مهلة قصيرة
    await sleep(1500);
    return fetchLiveWindow(fromLocal, toLocal, false);
  }

  if (res.status === 429) {
    throw new Error("تجاوزت حد الطلبات المسموح به على باقتك المجانية (429). حاول لاحقاً أو خفّض عدد التحديثات.");
  }

  if (!res.ok) {
    throw new Error(`فشل الاتصال بمزود البيانات (رمز ${res.status})`);
  }
  return res.json();
}

function normalizeApiFlight(f, direction) {
  const move = direction === "arrival" ? f.departure : f.arrival; // الطرف الآخر من الرحلة (نقطة الانطلاق أو الوجهة)
  const local = direction === "arrival" ? f.arrival : f.departure; // حركة الرحلة داخل مطار الرياض

  const scheduled = local?.scheduledTime?.local ? new Date(local.scheduledTime.local.replace(" ", "T")) : null;
  const revised = local?.revisedTime?.local ? new Date(local.revisedTime.local.replace(" ", "T")) : null;

  let status = mapApiStatus(f.status);
  if (!status) {
    // لا توجد حالة صريحة من المزوّد: نستنتجها من فارق الوقت المعدَّل عن المجدول إن توفر، وإلا فهي "مجدولة"
    if (revised && scheduled) {
      const diffMin = Math.round((revised.getTime() - scheduled.getTime()) / 60000);
      status = diffMin >= 15 ? "delayed" : "on-time";
    } else {
      status = "scheduled";
    }
  }

  return {
    id: f.number + "-" + direction + "-" + (scheduled ? scheduled.getTime() : Math.random()),
    type: direction,
    flightNo: f.number || "—",
    airline: f.airline?.name || "غير معروف",
    airlineCode: f.airline?.iata || "",
    city: move?.airport?.municipalityName || move?.airport?.name || "—",
    terminal: local?.terminal ? `الصالة ${local.terminal}` : "—",
    gate: local?.gate || "—",
    scheduled,
    actual: revised,
    status,
  };
}

async function fetchLiveFlights(dateStr) {
  // نقسم اليوم إلى نافذتين (كل نافذة 12 ساعة) بسبب حدود مزود البيانات المجاني
  const w1From = `${dateStr}T00:00`;
  const w1To = `${dateStr}T12:00`;
  const w2From = `${dateStr}T12:00`;
  const w2To = `${dateStr}T23:59`;

  // نرسل الطلبين بالتتابع (وليس بالتوازي) لأن الباقة المجانية تسمح بطلب واحد بالثانية فقط
  const w1 = await fetchLiveWindow(w1From, w1To);
  await sleep(600);
  const w2 = await fetchLiveWindow(w2From, w2To);

  const merged = [];
  for (const chunk of [w1, w2]) {
    (chunk.arrivals || []).forEach((f) => merged.push(normalizeApiFlight(f, "arrival")));
    (chunk.departures || []).forEach((f) => merged.push(normalizeApiFlight(f, "departure")));
  }
  // نعرض فقط رحلات الصالات 1 و2 و5 حسب طلب المستخدم (نخفي رحلات الصالة 3 و4 بالكامل)
  const onlyAllowedTerminals = merged.filter((f) => TERMINALS.includes(f.terminal));
  onlyAllowedTerminals.sort((a, b) => (a.scheduled?.getTime() || 0) - (b.scheduled?.getTime() || 0));
  return onlyAllowedTerminals;
}

/* ---------------------------- Data loading orchestration ---------------------------- */

async function loadFlights() {
  state.loading = true;
  state.error = null;
  renderAll();

  const dateStr = state.filters.date || todayStr();

  // 1) نجرّب أولاً المصدر الرسمي لموقع مطار الملك خالد الدولي (مجاني، لا يحتاج مفتاحاً، وأدق في التأخير)
  try {
    state.flights = await fetchOfficialFlights(dateStr);
    state.usingMock = false;
    state.dataSource = "official";
    state.error = null;
  } catch (officialErr) {
    console.error("official source failed:", officialErr);

    // 2) في حال فشل المصدر الرسمي، نجرّب AeroDataBox إن توفر مفتاح
    if (HAS_KEY) {
      try {
        state.flights = await fetchLiveFlights(dateStr);
        state.usingMock = false;
        state.dataSource = "aerodatabox";
        state.error = null;
      } catch (adbErr) {
        console.error("AeroDataBox failed:", adbErr);
        state.flights = generateMockFlights(dateStr);
        state.usingMock = true;
        state.dataSource = "mock";
        state.error = "تعذّر الاتصال بكل مصادر البيانات الحية. يتم الآن عرض بيانات تجريبية.";
      }
    } else {
      state.flights = generateMockFlights(dateStr);
      state.usingMock = true;
      state.dataSource = "mock";
      state.error = "تعذّر الاتصال بموقع المطار الرسمي (" + officialErr.message + "). يتم الآن عرض بيانات تجريبية.";
    }
  }

  populateTerminalFilter();
  populateAirlineFilter();
  state.loading = false;
  renderAll();
}

function populateTerminalFilter() {
  const sel = document.getElementById("terminalFilter");
  sel.innerHTML = `<option value="all">جميع الصالات</option>` +
    TERMINALS.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
  sel.value = state.filters.terminal;
}

function populateAirlineFilter() {
  const sel = document.getElementById("airlineFilter");
  const current = sel.value;
  const seen = new Map();
  state.flights.forEach((f) => {
    if (f.airlineCode && !seen.has(f.airlineCode)) seen.set(f.airlineCode, f.airline);
  });
  const airlines = [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], "ar"));
  sel.innerHTML = `<option value="all">جميع شركات الطيران</option>` +
    airlines.map(([code, name]) => `<option value="${escapeHtml(code)}">${escapeHtml(name)}</option>`).join("");
  if (airlines.some(([code]) => code === current)) sel.value = current;
}

/* ---------------------------- Filtering ---------------------------- */

function getFilteredFlights() {
  const { type, terminal, status, airline, q, timeFrom, timeTo, upcomingOnly, date } = state.filters;
  const query = q.trim().toLowerCase();
  const now = new Date();
  const isToday = date === todayStr();

  return state.flights.filter((f) => {
    if (type !== "all" && f.type !== type) return false;
    if (terminal !== "all" && f.terminal !== terminal) return false;
    if (status !== "all" && f.status !== status) return false;
    if (airline !== "all" && f.airlineCode !== airline) return false;
    if (query) {
      const hay = `${f.flightNo} ${f.airline} ${f.city}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    if (f.scheduled) {
      const hm = fmtTime(f.scheduled);
      if (timeFrom && hm < timeFrom) return false;
      if (timeTo && hm > timeTo) return false;
    }
    if (upcomingOnly && isToday && f.scheduled && f.scheduled < now) return false;
    return true;
  });
}

/* ---------------------------- Rendering ---------------------------- */

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderClock() {
  const now = new Date();
  document.getElementById("clockTime").textContent =
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  document.getElementById("clockDate").textContent = fmtClockDate(now);
}

function renderChips() {
  const { type, terminal, status, airline, q, timeFrom, timeTo, upcomingOnly } = state.filters;
  const chips = [];
  if (type !== "all") chips.push({ key: "type", label: type === "arrival" ? "قدوم" : "مغادرة" });
  if (terminal !== "all") chips.push({ key: "terminal", label: terminal });
  if (status !== "all") chips.push({ key: "status", label: STATUS_MAP[status]?.label || status });
  if (airline !== "all") {
    const opt = [...document.getElementById("airlineFilter").options].find((o) => o.value === airline);
    chips.push({ key: "airline", label: opt ? opt.textContent : airline });
  }
  if (timeFrom || timeTo) chips.push({ key: "timeRange", label: `الوقت: ${timeFrom || "00:00"} - ${timeTo || "23:59"}` });
  if (upcomingOnly) chips.push({ key: "upcoming", label: "القادمة فقط" });
  if (q) chips.push({ key: "q", label: `بحث: ${q}` });

  const box = document.getElementById("activeChips");
  if (!chips.length) { box.innerHTML = ""; return; }

  box.innerHTML = chips.map((c) =>
    `<span class="chip" data-key="${c.key}">${escapeHtml(c.label)} <button aria-label="إزالة">✕</button></span>`
  ).join("");

  box.querySelectorAll(".chip button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const key = e.target.closest(".chip").dataset.key;
      if (key === "type") { state.filters.type = "all"; saveTypeFilter("all"); setActiveSeg("all"); }
      if (key === "terminal") { state.filters.terminal = "all"; saveTerminalFilter("all"); document.getElementById("terminalFilter").value = "all"; }
      if (key === "status") { state.filters.status = "all"; document.getElementById("statusFilter").value = "all"; }
      if (key === "airline") { state.filters.airline = "all"; document.getElementById("airlineFilter").value = "all"; }
      if (key === "timeRange") { state.filters.timeFrom = ""; state.filters.timeTo = ""; document.getElementById("timeFrom").value = ""; document.getElementById("timeTo").value = ""; }
      if (key === "upcoming") { state.filters.upcomingOnly = false; document.getElementById("upcomingOnly").checked = false; }
      if (key === "q") { state.filters.q = ""; document.getElementById("searchBox").value = ""; }
      renderAll();
    });
  });
}

function renderStats(filtered) {
  const total = filtered.length;
  const onTime = filtered.filter((f) => f.status === "on-time").length;
  const delayed = filtered.filter((f) => f.status === "delayed").length;
  const cancelled = filtered.filter((f) => f.status === "cancelled").length;
  const arr = filtered.filter((f) => f.type === "arrival").length;
  const dep = filtered.filter((f) => f.type === "departure").length;

  document.getElementById("statTotal").textContent = total;
  document.getElementById("statOnTime").textContent = onTime;
  document.getElementById("statDelayed").textContent = delayed;
  document.getElementById("statCancelled").textContent = cancelled;
  document.getElementById("statArr").textContent = arr;
  document.getElementById("statDep").textContent = dep;
}

function getVisibleColumns() {
  return COLUMNS.filter((c) => state.columns[c.key] !== false);
}

function paxBarColor(count) {
  if (count > PAX_EXPECTED) return "var(--danger)";
  if (count >= PAX_EXPECTED * 0.75) return "var(--warn)";
  return "var(--ok)";
}

function paxBarPct(count) {
  return Math.max(0, Math.min(100, (count / PAX_BAR_MAX) * 100));
}

// في نسخة الجوال، هذه الأعمدة فقط تظهر افتراضياً في البطاقة، والباقي يظهر عند النقر على البطاقة
const MOBILE_PRIMARY_COLS = ["flightNo", "city", "gate", "scheduled", "status"];

function buildCellContent(col, f) {
  switch (col.key) {
    case "type":
      return { html: f.type === "arrival" ? "قدوم" : "مغادرة" };
    case "flightNo":
      return { html: escapeHtml(f.flightNo) };
    case "airline":
      return { html: escapeHtml(f.airline) };
    case "city":
      return { html: escapeHtml(f.city) };
    case "terminal":
      return { html: escapeHtml(f.terminal) };
    case "gate":
      return { html: escapeHtml(f.gate) };
    case "scheduled":
      return { html: f.scheduled ? fmtTime(f.scheduled) : "—", extraClass: "time-cell" };
    case "actual":
      return { html: f.actual ? fmtTime(f.actual) : "—", extraClass: "time-cell" };
    case "status": {
      const st = STATUS_MAP[f.status] || STATUS_MAP.scheduled;
      return { html: `<span class="status-text ${st.cls}">${st.label}</span>` };
    }
    case "pax": {
      const raw = state.paxCounts[f.id];
      const num = raw === undefined || raw === "" || raw === null ? null : Number(raw);
      const pct = num ? paxBarPct(num) : 0;
      const color = num ? paxBarColor(num) : "var(--border)";
      return {
        html: `
          <div class="pax-cell">
            <input type="number" min="0" step="1" class="pax-input" data-flight-id="${escapeHtml(f.id)}" value="${num ?? ""}" placeholder="0">
            <div class="pax-bar-track"><div class="pax-bar-fill" style="width:${pct}%;background:${color}"></div></div>
          </div>`,
      };
    }
    default:
      return { html: "" };
  }
}

function buildCellHtml(col, f) {
  const { html, extraClass = "" } = buildCellContent(col, f);
  const mobileClass = MOBILE_PRIMARY_COLS.includes(col.key) ? "" : " col-secondary";
  const cls = `${extraClass}${mobileClass}`.trim();
  return `<td data-col="${col.key}" data-label="${col.label}"${cls ? ` class="${cls}"` : ""}>${html}</td>`;
}

function renderTableHead() {
  const thead = document.getElementById("tableHead");
  const visible = getVisibleColumns();
  thead.innerHTML = `<tr>${visible.map((c) => `<th data-col="${c.key}">${escapeHtml(c.label)}</th>`).join("")}</tr>`;
}

function renderTable(filtered) {
  const tbody = document.getElementById("flightsBody");
  const stateBox = document.getElementById("stateBox");
  const visible = getVisibleColumns();

  if (state.loading) {
    tbody.innerHTML = Array.from({ length: 8 }).map(() => `
      <tr>${visible.map(() => `<td><div class="skeleton"></div></td>`).join("")}</tr>
    `).join("");
    stateBox.innerHTML = "";
    document.querySelector("table").style.display = "";
    return;
  }

  if (!filtered.length) {
    tbody.innerHTML = "";
    document.querySelector("table").style.display = "none";
    stateBox.innerHTML = `
      <div class="state-box">
        <div class="icon">🔍</div>
        <h3>لا توجد رحلات مطابقة</h3>
        <p>جرّب تغيير الفلاتر أو التاريخ المحدد، أو اضغط "إعادة تعيين" للعودة لعرض جميع الرحلات.</p>
      </div>`;
    return;
  }

  document.querySelector("table").style.display = "";
  stateBox.innerHTML = "";

  tbody.innerHTML = filtered.map((f) => `<tr>${visible.map((c) => buildCellHtml(c, f)).join("")}</tr>`).join("");
}

function renderMeta(filtered) {
  document.getElementById("resultCount").textContent = `${filtered.length} نتيجة`;
  document.getElementById("lastUpdated").textContent =
    "آخر تحديث: " + new Date().toLocaleTimeString("ar-SA-u-nu-latn", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const badge = document.getElementById("liveBadge");
  const badgeText = document.getElementById("liveBadgeText");
  if (state.loading) {
    badge.style.background = "rgba(59,130,246,.12)";
    badge.style.borderColor = "rgba(59,130,246,.35)";
    badge.style.color = "#7db4ff";
    badgeText.textContent = "جارِ التحديث...";
  } else if (state.usingMock) {
    badge.style.background = "rgba(245,158,11,.12)";
    badge.style.borderColor = "rgba(245,158,11,.35)";
    badge.style.color = "#fbbf24";
    badgeText.textContent = "بيانات تجريبية (تعذّر الاتصال بكل المصادر)";
  } else if (state.dataSource === "official") {
    badge.style.background = "rgba(34,197,94,.12)";
    badge.style.borderColor = "rgba(34,197,94,.35)";
    badge.style.color = "#22c55e";
    badgeText.textContent = "بيانات مباشرة وفق المصادر الرسمية لمطار الملك خالد الدولي";
  } else {
    badge.style.background = "rgba(34,197,94,.12)";
    badge.style.borderColor = "rgba(34,197,94,.35)";
    badge.style.color = "#22c55e";
    badgeText.textContent = "بيانات مباشرة (AeroDataBox)";
  }
}

function renderAll() {
  const filtered = getFilteredFlights();
  renderChips();
  renderStats(filtered);
  renderTableHead();
  renderTable(filtered);
  renderMeta(filtered);
}

/* ---------------------------- Wiring UI ---------------------------- */

function setActiveSeg(val) {
  document.querySelectorAll("#typeSeg button").forEach((b) => {
    b.classList.toggle("active", b.dataset.val === val);
  });
}

function renderColumnsPanel() {
  const panel = document.getElementById("columnsPanel");
  panel.innerHTML = COLUMNS.map((c) => `
    <label><input type="checkbox" data-col-key="${c.key}" ${state.columns[c.key] !== false ? "checked" : ""}> ${escapeHtml(c.label)}</label>
  `).join("") + `<hr><button class="btn-link" id="showAllColumnsBtn" type="button">إظهار كل الأعمدة</button>`;

  panel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const key = e.target.dataset.colKey;
      state.columns[key] = e.target.checked;
      saveColumnVisibility(state.columns);
      renderTableHead();
      renderTable(getFilteredFlights());
    });
  });

  panel.querySelector("#showAllColumnsBtn").addEventListener("click", () => {
    COLUMNS.forEach((c) => { state.columns[c.key] = true; });
    saveColumnVisibility(state.columns);
    renderColumnsPanel();
    renderTableHead();
    renderTable(getFilteredFlights());
  });
}

function initUI() {
  document.getElementById("airportName").textContent = CFG.AIRPORT_NAME_AR || "مطار الملك خالد الدولي";
  document.getElementById("dateFilter").value = state.filters.date;
  document.getElementById("terminalFilter").value = state.filters.terminal;
  setActiveSeg(state.filters.type);

  renderColumnsPanel();
  document.getElementById("columnsBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const panel = document.getElementById("columnsPanel");
    panel.hidden = !panel.hidden;
  });
  document.addEventListener("click", (e) => {
    const wrap = document.querySelector(".col-toggle-wrap");
    const panel = document.getElementById("columnsPanel");
    if (wrap && !wrap.contains(e.target)) panel.hidden = true;
  });

  document.getElementById("flightsBody").addEventListener("input", (e) => {
    const target = e.target;
    if (!target.classList.contains("pax-input")) return;
    const flightId = target.dataset.flightId;
    const val = target.value;
    if (val === "") {
      delete state.paxCounts[flightId];
    } else {
      state.paxCounts[flightId] = Number(val);
    }
    savePaxCounts(state.paxCounts);

    const num = val === "" ? null : Number(val);
    const track = target.closest(".pax-cell")?.querySelector(".pax-bar-fill");
    if (track) {
      track.style.width = (num ? paxBarPct(num) : 0) + "%";
      track.style.background = num ? paxBarColor(num) : "var(--border)";
    }
  });

  // بطاقات الجوال: النقر على أي بطاقة يوسّعها لإظهار بقية التفاصيل (لا يفعّل عند النقر على حقل الإدخال)
  document.getElementById("flightsBody").addEventListener("click", (e) => {
    if (!window.matchMedia("(max-width: 720px)").matches) return;
    if (e.target.closest("input, button, a")) return;
    const tr = e.target.closest("tr");
    if (tr) tr.classList.toggle("expanded");
  });

  document.getElementById("resetPaxBtn").addEventListener("click", () => {
    if (!confirm("هل تريد مسح كل أعداد الركاب المُدخلة يدوياً لجميع الرحلات؟")) return;
    state.paxCounts = {};
    savePaxCounts(state.paxCounts);
    renderTable(getFilteredFlights());
  });

  document.querySelectorAll("#typeSeg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.filters.type = btn.dataset.val;
      saveTypeFilter(btn.dataset.val);
      setActiveSeg(btn.dataset.val);
      renderAll();
    });
  });

  document.getElementById("terminalFilter").addEventListener("change", (e) => {
    state.filters.terminal = e.target.value;
    saveTerminalFilter(e.target.value);
    renderAll();
  });

  document.getElementById("statusFilter").addEventListener("change", (e) => {
    state.filters.status = e.target.value;
    renderAll();
  });

  document.getElementById("airlineFilter").addEventListener("change", (e) => {
    state.filters.airline = e.target.value;
    renderAll();
  });

  document.getElementById("timeFrom").addEventListener("change", (e) => {
    state.filters.timeFrom = e.target.value;
    renderAll();
  });

  document.getElementById("timeTo").addEventListener("change", (e) => {
    state.filters.timeTo = e.target.value;
    renderAll();
  });

  document.getElementById("upcomingOnly").addEventListener("change", (e) => {
    state.filters.upcomingOnly = e.target.checked;
    renderAll();
  });

  document.getElementById("dateFilter").addEventListener("change", (e) => {
    state.filters.date = e.target.value || todayStr();
    loadFlights();
  });

  let searchDebounce;
  document.getElementById("searchBox").addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    const val = e.target.value;
    searchDebounce = setTimeout(() => {
      state.filters.q = val;
      renderAll();
    }, 220);
  });

  document.getElementById("refreshBtn").addEventListener("click", () => {
    const icon = document.getElementById("refreshIcon");
    icon.style.transition = "transform .5s";
    icon.style.transform = "rotate(360deg)";
    setTimeout(() => { icon.style.transform = "rotate(0deg)"; }, 500);
    loadFlights();
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    state.filters = {
      type: "all", terminal: "all", status: "all", airline: "all",
      date: todayStr(), timeFrom: "", timeTo: "", upcomingOnly: false, q: "",
    };
    saveTypeFilter("all");
    saveTerminalFilter("all");
    setActiveSeg("all");
    document.getElementById("terminalFilter").value = "all";
    document.getElementById("statusFilter").value = "all";
    document.getElementById("airlineFilter").value = "all";
    document.getElementById("timeFrom").value = "";
    document.getElementById("timeTo").value = "";
    document.getElementById("upcomingOnly").checked = false;
    document.getElementById("dateFilter").value = state.filters.date;
    document.getElementById("searchBox").value = "";
    loadFlights();
  });

  document.getElementById("copyBtn").addEventListener("click", copyTableToClipboard);
  document.getElementById("printBtn").addEventListener("click", printFlights);
  document.getElementById("exportWordBtn").addEventListener("click", exportWordDocument);
}

/* ---------------------------- Copy table (Excel-friendly) ---------------------------- */

function getCellPlainValue(col, f) {
  switch (col.key) {
    case "type": return f.type === "arrival" ? "قدوم" : "مغادرة";
    case "flightNo": return f.flightNo;
    case "airline": return f.airline;
    case "city": return f.city;
    case "terminal": return f.terminal;
    case "gate": return f.gate;
    case "scheduled": return f.scheduled ? fmtTime(f.scheduled) : "—";
    case "actual": return f.actual ? fmtTime(f.actual) : "—";
    case "status": return (STATUS_MAP[f.status] || STATUS_MAP.scheduled).label;
    case "pax": {
      const raw = state.paxCounts[f.id];
      return (raw === undefined || raw === "" || raw === null) ? "—" : String(raw);
    }
    default: return "";
  }
}

function buildTsv(filtered) {
  const visible = getVisibleColumns();
  const rows = [visible.map((c) => c.label).join("\t")];
  filtered.forEach((f) => {
    rows.push(visible.map((c) => getCellPlainValue(c, f)).join("\t"));
  });
  return rows.join("\n");
}

async function copyTableToClipboard() {
  const filtered = getFilteredFlights();
  const tsv = buildTsv(filtered);
  const btn = document.getElementById("copyBtn");
  const original = btn.innerHTML;

  try {
    await navigator.clipboard.writeText(tsv);
    btn.innerHTML = "✅ تم النسخ";
  } catch {
    // بديل احتياطي في حال منع المتصفح للوصول إلى الحافظة
    const ta = document.createElement("textarea");
    ta.value = tsv;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      btn.innerHTML = "✅ تم النسخ";
    } catch {
      btn.innerHTML = "⚠️ تعذّر النسخ";
    }
    document.body.removeChild(ta);
  }

  setTimeout(() => { btn.innerHTML = original; }, 1800);
}

/* ---------------------------- طباعة / PDF / تصدير Word ---------------------------- */

function buildPrintableHtmlTable(filtered) {
  const visible = getVisibleColumns();
  const rows = filtered.map((f) => `
      <tr>${visible.map((c) => `<td>${escapeHtml(getCellPlainValue(c, f))}</td>`).join("")}</tr>`).join("");

  return `
    <table>
      <thead>
        <tr>${visible.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function buildPrintableDocument(filtered) {
  const airport = CFG.AIRPORT_NAME_AR || "مطار الملك خالد الدولي";
  const now = new Date();
  const stamp = now.toLocaleString("ar-SA-u-nu-latn", { dateStyle: "long", timeStyle: "short" });

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(airport)} - جدول الرحلات</title>
<style>
  body{font-family:Tahoma,Arial,sans-serif;color:#111;margin:24px;}
  h1{font-size:18px;margin:0 0 4px;}
  .meta{font-size:12px;color:#555;margin-bottom:18px;}
  table{width:100%;border-collapse:collapse;font-size:12px;}
  th,td{border:1px solid #333;padding:6px 8px;text-align:right;}
  th{background:#eee;font-weight:bold;}
  tr{page-break-inside:avoid;}
  @page{size:landscape;margin:14mm;}
</style>
</head>
<body>
  <h1>${escapeHtml(airport)} - جدول الرحلات</h1>
  <div class="meta">تاريخ الطباعة: ${escapeHtml(stamp)} — عدد الرحلات: ${filtered.length}</div>
  ${buildPrintableHtmlTable(filtered)}
</body>
</html>`;
}

function printFlights() {
  const filtered = getFilteredFlights();
  const html = buildPrintableDocument(filtered);
  const win = window.open("", "_blank");
  if (!win) {
    alert("يرجى السماح بالنوافذ المنبثقة (Popups) لهذا الموقع لتتمكن من الطباعة.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.onload = () => win.print();
  // بعض المتصفحات لا تُطلق onload على نافذة مكتوبة بـ document.write بشكل موثوق
  setTimeout(() => { try { win.print(); } catch {} }, 400);
}

function exportWordDocument() {
  const filtered = getFilteredFlights();
  const airport = CFG.AIRPORT_NAME_AR || "مطار الملك خالد الدولي";
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(airport)} - جدول الرحلات</title>
<style>
  body{font-family:Tahoma,Arial,sans-serif;color:#111; direction:rtl;}
  h1{font-size:16pt;}
  table{width:100%;border-collapse:collapse;font-size:10.5pt;}
  th,td{border:1px solid #333;padding:5px 8px;text-align:right;}
  th{background:#eee;font-weight:bold;}
</style>
</head>
<body>
  <h1>${escapeHtml(airport)} - جدول الرحلات</h1>
  <p>عدد الرحلات: ${filtered.length}</p>
  ${buildPrintableHtmlTable(filtered)}
</body>
</html>`;

  const blob = new Blob(["﻿", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `رحلات-${state.filters.date || todayStr()}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/* ---------------------------- Boot ---------------------------- */

function boot() {
  initUI();
  renderClock();
  setInterval(renderClock, 1000);
  loadFlights();

  const refreshMs = (CFG.AUTO_REFRESH_SECONDS || 180) * 1000;
  setInterval(loadFlights, refreshMs);
}

document.addEventListener("DOMContentLoaded", boot);
