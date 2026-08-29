"use strict";

/* ======================================================================
   لوحة رحلات مطار الملك خالد الدولي
   - تتصل مباشرة بموقع مطار الملك خالد الرسمي (kkia.sa) - مجاني بالكامل
     ولا يحتاج أي مفتاح أو بنية خارجية (لا Supabase ولا AeroDataBox).
   - عند تعذّر الاتصال، تُعرض بيانات تجريبية واقعية حتى تبقى الصفحة قابلة
     للاستخدام والعرض فوراً.
   ====================================================================== */

const CFG = window.APP_CONFIG || {};

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
  "unknown": { label: "غير معروف", cls: "scheduled" },
  "boarding": { label: "صعود الركاب", cls: "boarding" },
  "on-time": { label: "في الوقت المحدد", cls: "on-time" },
  "delayed": { label: "متأخرة", cls: "delayed" },
  "departed": { label: "أقلعت", cls: "departed" },
  "landed": { label: "هبطت", cls: "landed" },
  "cancelled": { label: "ملغاة", cls: "cancelled" },
};

// موقع مطار الملك خالد يسجّل رحلات طيران الرياض داخلياً تحت الرمز القديم "RA"
// (وهو رسمياً رمز الخطوط الجوية النيبالية) بدل الرمز الصحيح "RX". نصحّح رمز
// الرحلة المعروض بالكامل (RA401 → RX401) وليس اسم شركة الطيران فقط.
const FLIGHT_CODE_OVERRIDES = { RA: "RX" };

const AIRLINE_NAME_OVERRIDES = {
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
    timeFrom: nowTimeStr(),
    timeTo: "23:59",
    upcomingOnly: false,
    q: "",
  },
};

/* ---------------------------- Helpers ---------------------------- */

function todayStr() {
  // نستخدم مكوّنات التاريخ المحلية وليس toISOString() (الذي يعيد تاريخ UTC) لأن الرياض
  // بتوقيت UTC+3، فاستخدام UTC كان يجعل الصفحة تعرض تاريخ الأمس خلال أول 3 ساعات من كل يوم محلي.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function pad(n) { return String(n).padStart(2, "0"); }

// وقت الفتح الحالي (HH:MM) - يُستخدم كقيمة افتراضية لحقل "من الساعة" عند فتح/تحديث الصفحة فقط،
// ولا يتحدّث تلقائياً بعد ذلك إلا عند إعادة تحميل الصفحة أو الضغط على "إعادة تعيين"
function nowTimeStr() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

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

// قائمة احتياطية بأسماء مدن شائعة بالعربي - تُستخدم عندما لا تغطي قائمة kkia.sa (159 وجهة فقط) مدينة الرحلة
const CITY_NAME_AR_FALLBACK = {
  "PARIS": "باريس", "LONDON": "لندن", "DUBAI": "دبي", "ISTANBUL": "إسطنبول",
  "DELI": "دلهي", "BERGAMO": "بيرغامو", "CAIRO": "القاهرة", "ALEPPO": "حلب",
  "ALEXANDRIA": "الإسكندرية", "AMMAN": "عمّان", "MADRID": "مدريد", "PHUKET": "بوكيت",
  "SAN FRANCISCO": "سان فرانسيسكو", "TRABZON": "طرابزون", "BARCELONA": "برشلونة",
  "ROME": "روما", "MILAN": "ميلانو", "ATHENS": "أثينا", "VIENNA": "فيينا",
  "ZURICH": "زيورخ", "GENEVA": "جنيف", "AMSTERDAM": "أمستردام", "BRUSSELS": "بروكسل",
  "MUNICH": "ميونخ", "BERLIN": "برلين", "HAMBURG": "هامبورغ", "COPENHAGEN": "كوبنهاغن",
  "STOCKHOLM": "ستوكهولم", "OSLO": "أوسلو", "HELSINKI": "هلسنكي", "WARSAW": "وارسو",
  "PRAGUE": "براغ", "BUDAPEST": "بودابست", "LISBON": "لشبونة", "DUBLIN": "دبلن",
  "MANCHESTER": "مانشستر", "BIRMINGHAM": "برمنغهام", "MOSCOW": "موسكو",
  "NEW YORK": "نيويورك", "LOS ANGELES": "لوس أنجلوس", "CHICAGO": "شيكاغو",
  "WASHINGTON": "واشنطن", "TORONTO": "تورنتو", "MONTREAL": "مونتريال",
  "BEIJING": "بكين", "SHANGHAI": "شنغهاي", "GUANGZHOU": "قوانغتشو", "HONG KONG": "هونغ كونغ",
  "TOKYO": "طوكيو", "OSAKA": "أوساكا", "SEOUL": "سول", "SINGAPORE": "سنغافورة",
  "BANGKOK": "بانكوك", "MANILA": "مانيلا", "HANOI": "هانوي", "HO CHI MINH CITY": "هوشي منه",
  "NEW DELHI": "نيودلهي", "DELHI": "دلهي", "MUMBAI": "مومباي", "BENGALURU": "بنغالورو",
  "CHENNAI": "تشيناي", "HYDERABAD": "حيدر أباد", "KOLKATA": "كولكاتا",
  "LAHORE": "لاهور", "KARACHI": "كراتشي", "ISLAMABAD": "إسلام أباد",
  "DHAKA": "دكا", "COLOMBO": "كولومبو", "KATHMANDU": "كاتماندو",
  "JAKARTA": "جاكرتا", "KUALA LUMPUR": "كوالالمبور", "BALI": "بالي", "DENPASAR": "دنباسار",
  "NAIROBI": "نيروبي", "ADDIS ABABA": "أديس أبابا", "LAGOS": "لاغوس", "ACCRA": "أكرا",
  "JOHANNESBURG": "جوهانسبرغ", "CASABLANCA": "الدار البيضاء", "TUNIS": "تونس",
  "ALGIERS": "الجزائر", "TRIPOLI": "طرابلس", "KHARTOUM": "الخرطوم",
  "BAGHDAD": "بغداد", "BASRA": "البصرة", "ERBIL": "أربيل", "DAMASCUS": "دمشق",
  "BEIRUT": "بيروت", "TEHRAN": "طهران", "BAKU": "باكو", "TBILISI": "تبليسي",
  "YEREVAN": "يريفان", "ALMATY": "ألماتي", "TASHKENT": "طشقند",
  "SYDNEY": "سيدني", "MELBOURNE": "ملبورن", "AUCKLAND": "أوكلاند",
  "ANTALYA": "أنطاليا", "ADANA": "أضنة", "GAZIANTEP": "غازي عنتاب",
  "ABU-DABI": "أبوظبي", "ABU DHABI": "أبوظبي", "MYKONOS ISLAND": "ميكونوس", "MYKONOS": "ميكونوس",
};

function normalizeCityName(rawName) {
  if (!rawName) return null;
  return CITY_NAME_AR_FALLBACK[rawName.trim().toUpperCase()] || null;
}

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

  // لا نستنتج "متأخرة"/"في الوقت المحدد" من مجرد فارق بين الوقت المجدول والمقدَّر - هذا
  // الفارق غالباً بيانات غير موثوقة من المصدر. إن لم تكن هناك حالة مؤكدة (هبطت/أقلعت/صعود
  // ركاب) نعرض "غير معروف" بدل تخمين تأخير قد يكون غير صحيح.
  if (scheduled && estimated && estimated.getTime() !== scheduled.getTime()) {
    return "unknown";
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

  const rawAirlineCode = (f.airline?.code || "").toUpperCase();
  // موقع المطار يسجّل رحلات طيران الرياض داخلياً تحت الرمز القديم RA بدل الرمز
  // الصحيح RX - نصحّح رمز الرحلة نفسه (وليس اسم شركة الطيران فقط) ليظهر RX بدل RA
  const airlineCode = FLIGHT_CODE_OVERRIDES[rawAirlineCode] || rawAirlineCode;
  const otherAirportCode = (otherAirport?.code || "").toUpperCase();

  return {
    id: `KKIA-${f.id}`,
    type: isArrival ? "arrival" : "departure",
    flightNo: `${airlineCode} ${f.number || ""}`.trim() || "—",
    airline: AIRLINE_NAME_OVERRIDES[airlineCode] || AIRLINE_NAME_AR.get(airlineCode) || toTitleCase(f.airline?.description) || "غير معروف",
    airlineCode,
    city: CITY_NAME_AR.get(otherAirportCode)
      || normalizeCityName(otherAirport?.city?.name || otherAirport?.name)
      || toTitleCase(otherAirport?.city?.name || otherAirport?.name)
      || "—",
    terminal: terminalNum ? `الصالة ${terminalNum}` : "—",
    gate,
    // بدل عرض عمود منفصل "الوقت الفعلي"، نعرض الوقت المقدَّر (إن وُجد) مباشرة في عمود
    // "الوقت المجدول" نفسه - فلا يوجد عمود ثانٍ ولا استنتاج تأخير من الفارق بينهما.
    scheduled: estimated || scheduled,
    status: deriveOfficialStatus(f, now),
  };
}

// نتحقق أن التاريخ المحلي الفعلي لوقت الرحلة المجدول يطابق التاريخ المطلوب تماماً - لأن استجابة
// موقع المطار أحياناً تُرجع نافذة زمنية أوسع قليلاً من يوم تقويمي واحد صارم (تسرّب رحلات من اليوم
// التالي/السابق قرب منتصف الليل)، وهذا كان يسبب ظهور رحلات من تاريخ آخر ضمن قائمة اليوم المحدد.
function isSameLocalDate(date, dateStr) {
  if (!date) return false;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}` === dateStr;
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
  const filtered = normalized.filter((f) => TERMINALS.includes(f.terminal) && isSameLocalDate(f.scheduled, dateStr));

  // إزالة التكرار: عند إعادة جدولة رحلة (تأخير) يُصدر المصدر أحياناً سجلاً جديداً بوقت مجدول مختلف
  // مع إبقاء السجل القديم أيضاً، فتظهر نفس الرحلة مرتين (مرة بوقتها الأصلي ومرة "متأخرة" بوقت جديد).
  // نجمع حسب رقم الرحلة+النوع+المدينة (بدل الوقت المجدول الذي قد يتغيّر) ونُبقي فقط على النسخة
  // ذات الحالة الأكثر تأكيداً (متأخرة/أقلعت/هبطت...) بدل الحالة الافتراضية، ما لم يكن الفارق
  // الزمني بين النسختين كبيراً (أكثر من 6 ساعات) فتُعامَلان كرحلتين مختلفتين فعلياً بنفس الرقم.
  function statusConfidenceRank(status) {
    return (status === "scheduled" || status === "on-time") ? 0 : 1;
  }

  const dedupeMap = new Map();
  filtered.forEach((f) => {
    const baseKey = `${f.type}-${f.flightNo}-${f.city}`;
    const existing = dedupeMap.get(baseKey);
    if (!existing) {
      dedupeMap.set(baseKey, f);
      return;
    }
    const diffHours = Math.abs((f.scheduled?.getTime() || 0) - (existing.scheduled?.getTime() || 0)) / 3600000;
    if (diffHours > 6) {
      // فارق كبير جداً - على الأرجح رحلتان منفصلتان فعلاً بنفس الرقم، لا تكرار لنفس الرحلة
      dedupeMap.set(`${baseKey}-${f.scheduled?.getTime()}`, f);
      return;
    }
    const existingRank = statusConfidenceRank(existing.status);
    const currentRank = statusConfidenceRank(f.status);
    if (currentRank > existingRank) {
      dedupeMap.set(baseKey, f);
    } else if (currentRank === existingRank && (f.scheduled?.getTime() || 0) > (existing.scheduled?.getTime() || 0)) {
      // عند تعادل درجة التأكد، نفضّل الوقت المجدول الأحدث لأنه غالباً التحديث الأخير
      dedupeMap.set(baseKey, f);
    }
  });

  const deduped = [...dedupeMap.values()];
  deduped.sort((a, b) => (a.scheduled?.getTime() || 0) - (b.scheduled?.getTime() || 0));
  return deduped;
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
    airline: AIRLINE_NAME_OVERRIDES[(f.airline?.iata || "").toUpperCase()]
      || AIRLINE_NAME_AR.get((f.airline?.iata || "").toUpperCase())
      || toTitleCase(f.airline?.name)
      || "غير معروف",
    airlineCode: f.airline?.iata || "",
    city: (move?.airport?.iata && CITY_NAME_AR.get(move.airport.iata.toUpperCase()))
      || normalizeCityName(move?.airport?.municipalityName || move?.airport?.name)
      || move?.airport?.municipalityName || move?.airport?.name || "—",
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

// رجوع للاعتماد المباشر على موقع مطار الملك خالد الرسمي (kkia.sa) - مجاني بالكامل،
// بدون مفتاح، وبدون أي بنية خارجية (لا Supabase ولا AeroDataBox ولا مهام مجدولة).
async function loadFlights() {
  state.loading = true;
  state.error = null;
  renderAll();

  const dateStr = state.filters.date || todayStr();

  try {
    let flights = await fetchOfficialFlights(dateStr);
    // نطاق الوقت الممتد لليوم التالي (مثلاً من 22:00 إلى 06:00): نجلب رحلات اليوم التالي
    // أيضاً وندمجها، لأن الفلترة تعتمد على التاريخ/الوقت الفعلي لكل رحلة على أي حال
    if (isTimeRangeWrapped()) {
      try {
        const nextDateStr = addDaysToDateStr(dateStr, 1);
        const nextFlights = await fetchOfficialFlights(nextDateStr);
        flights = flights.concat(nextFlights);
      } catch (nextErr) {
        console.error("تعذّر جلب رحلات اليوم التالي لنطاق الوقت الممتد:", nextErr);
      }
    }
    state.flights = flights;
    state.usingMock = false;
    state.dataSource = "official";
    state.error = null;
  } catch (officialErr) {
    console.error("official source failed:", officialErr);
    state.flights = generateMockFlights(dateStr);
    state.usingMock = true;
    state.dataSource = "mock";
    state.error = "تعذّر الاتصال بموقع المطار الرسمي (" + officialErr.message + "). يتم الآن عرض بيانات تجريبية.";
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

function hmToMinutes(hm) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

// نطاق الوقت يدعم الامتداد لليوم التالي: إن كان "إلى" أصغر من "من" (مثلاً من 22:00 إلى 06:00)
// فهذا يعني أن النطاق يمتد عبر منتصف الليل.
function isTimeRangeWrapped() {
  const { timeFrom, timeTo } = state.filters;
  if (!timeFrom || !timeTo) return false;
  return hmToMinutes(timeTo) < hmToMinutes(timeFrom);
}

function getTimeRangeBounds() {
  const { timeFrom, timeTo, date } = state.filters;
  if (!timeFrom || !timeTo) return null;
  const baseDate = date || todayStr();
  const [fh, fm] = timeFrom.split(":").map(Number);
  const [th, tm] = timeTo.split(":").map(Number);
  const start = new Date(`${baseDate}T00:00:00`);
  start.setHours(fh, fm, 0, 0);
  const end = new Date(`${baseDate}T00:00:00`);
  end.setHours(th, tm, 0, 0);
  if (end < start) end.setDate(end.getDate() + 1); // امتداد لليوم التالي
  return { start, end };
}

function getFilteredFlights() {
  const { type, terminal, status, airline, q, upcomingOnly, date } = state.filters;
  const query = q.trim().toLowerCase();
  const now = new Date();
  const isToday = date === todayStr();
  const timeBounds = getTimeRangeBounds();

  return state.flights.filter((f) => {
    if (type !== "all" && f.type !== type) return false;
    if (terminal !== "all" && f.terminal !== terminal) return false;
    if (status !== "all" && f.status !== status) return false;
    if (airline !== "all" && f.airlineCode !== airline) return false;
    if (query) {
      const hay = `${f.flightNo} ${f.airline} ${f.city}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    if (timeBounds && f.scheduled) {
      if (f.scheduled < timeBounds.start || f.scheduled > timeBounds.end) return false;
    }
    if (upcomingOnly && isToday && f.scheduled && f.scheduled < now) return false;
    return true;
  });
}

/* ---------------------------- شريط نطاق الوقت (مقبضان قابلان للسحب) ---------------------------- */

function minutesToHM(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

const TIME_RANGE_STEP = 5; // دقة السحب: أقرب 5 دقائق

function snapMinutes(min) {
  return Math.round(min / TIME_RANGE_STEP) * TIME_RANGE_STEP;
}

function minutesFromClientX(trackEl, clientX) {
  const rect = trackEl.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return Math.max(0, Math.min(1439, snapMinutes(ratio * 1439)));
}

// يحدّث حالة الفلتر فقط (بدون إعادة جلب) - يُستخدم أثناء السحب المباشر لسلاسة الحركة
function setTimeRangeLive(fromMin, toMin) {
  if (fromMin !== null) state.filters.timeFrom = minutesToHM(fromMin);
  if (toMin !== null) state.filters.timeTo = minutesToHM(toMin);
  renderTimeRangeSlider();
}

function renderTimeRangeSlider() {
  const track = document.getElementById("trTrack");
  const handleFrom = document.getElementById("trHandleFrom");
  const handleTo = document.getElementById("trHandleTo");
  const fill = document.getElementById("trFill");
  const fillWrapStart = document.getElementById("trFillWrapStart");
  const labelFrom = document.getElementById("trLabelFrom");
  const labelTo = document.getElementById("trLabelTo");
  const wrapHint = document.getElementById("trWrapHint");
  const tooltipFrom = document.getElementById("trTooltipFrom");
  const tooltipTo = document.getElementById("trTooltipTo");
  if (!track) return;

  const fromMin = hmToMinutes(state.filters.timeFrom || "00:00");
  const toMin = hmToMinutes(state.filters.timeTo || "23:59");
  const width = track.clientWidth;
  const wrapped = toMin < fromMin;

  const pxFrom = (fromMin / 1439) * width;
  const pxTo = (toMin / 1439) * width;

  handleFrom.style.left = `${pxFrom}px`;
  handleTo.style.left = `${pxTo}px`;
  handleFrom.setAttribute("aria-valuenow", fromMin);
  handleTo.setAttribute("aria-valuenow", toMin);
  handleFrom.setAttribute("aria-valuetext", minutesToHM(fromMin));
  handleTo.setAttribute("aria-valuetext", minutesToHM(toMin));

  // فقاعة الوقت العائمة تتبع كل مقبض بنفس موضعه أفقياً
  tooltipFrom.style.left = `${pxFrom}px`;
  tooltipTo.style.left = `${pxTo}px`;
  tooltipFrom.textContent = minutesToHM(fromMin);
  tooltipTo.textContent = minutesToHM(toMin);

  if (wrapped) {
    fill.style.left = `${pxFrom}px`;
    fill.style.width = `${Math.max(0, width - pxFrom)}px`;
    fillWrapStart.hidden = false;
    fillWrapStart.style.left = "0px";
    fillWrapStart.style.width = `${pxTo}px`;
  } else {
    fill.style.left = `${pxFrom}px`;
    fill.style.width = `${Math.max(0, pxTo - pxFrom)}px`;
    fillWrapStart.hidden = true;
  }

  labelFrom.textContent = minutesToHM(fromMin);
  labelTo.textContent = minutesToHM(toMin);
  wrapHint.hidden = !wrapped;
}

function initTimeRangeSlider() {
  const track = document.getElementById("trTrack");
  const handleFrom = document.getElementById("trHandleFrom");
  const handleTo = document.getElementById("trHandleTo");
  const tooltipFrom = document.getElementById("trTooltipFrom");
  const tooltipTo = document.getElementById("trTooltipTo");
  let dragging = null; // "from" | "to" | null

  function startDrag(handle, tooltip, which) {
    return (e) => {
      dragging = which;
      handle.classList.add("dragging");
      tooltip.classList.add("dragging");
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
  }

  function onMove(which) {
    return (e) => {
      if (dragging !== which) return;
      const min = minutesFromClientX(track, e.clientX);
      if (which === "from") setTimeRangeLive(min, null);
      else setTimeRangeLive(null, min);
    };
  }

  function onUp(handle, tooltip, which) {
    return () => {
      if (dragging !== which) return;
      dragging = null;
      handle.classList.remove("dragging");
      tooltip.classList.remove("dragging");
      loadFlights();
    };
  }

  handleFrom.addEventListener("pointerdown", startDrag(handleFrom, tooltipFrom, "from"));
  handleFrom.addEventListener("pointermove", onMove("from"));
  handleFrom.addEventListener("pointerup", onUp(handleFrom, tooltipFrom, "from"));
  handleFrom.addEventListener("pointercancel", onUp(handleFrom, tooltipFrom, "from"));

  handleTo.addEventListener("pointerdown", startDrag(handleTo, tooltipTo, "to"));
  handleTo.addEventListener("pointermove", onMove("to"));
  handleTo.addEventListener("pointerup", onUp(handleTo, tooltipTo, "to"));
  handleTo.addEventListener("pointercancel", onUp(handleTo, tooltipTo, "to"));

  // النقر على الشريط مباشرة (خارج المقبضين) ينقل أقرب مقبض لموضع النقر
  track.addEventListener("pointerdown", (e) => {
    if (e.target === handleFrom || e.target === handleTo) return;
    const min = minutesFromClientX(track, e.clientX);
    const fromMin = hmToMinutes(state.filters.timeFrom || "00:00");
    const toMin = hmToMinutes(state.filters.timeTo || "23:59");
    if (Math.abs(min - fromMin) <= Math.abs(min - toMin)) setTimeRangeLive(min, null);
    else setTimeRangeLive(null, min);
    loadFlights();
  });

  // دعم لوحة المفاتيح (أسهم اليسار/اليمين) لكل مقبض لتحسين إمكانية الوصول
  function onKey(which, handle) {
    return (e) => {
      const stepMap = { ArrowLeft: -TIME_RANGE_STEP, ArrowRight: TIME_RANGE_STEP, ArrowDown: -TIME_RANGE_STEP, ArrowUp: TIME_RANGE_STEP };
      const delta = stepMap[e.key];
      if (delta === undefined) return;
      e.preventDefault();
      const cur = hmToMinutes(which === "from" ? state.filters.timeFrom : state.filters.timeTo);
      const next = Math.max(0, Math.min(1439, cur + delta));
      if (which === "from") setTimeRangeLive(next, null);
      else setTimeRangeLive(null, next);
      loadFlights();
    };
  }
  handleFrom.addEventListener("keydown", onKey("from", handleFrom));
  handleTo.addEventListener("keydown", onKey("to", handleTo));

  window.addEventListener("resize", renderTimeRangeSlider);

  renderTimeRangeSlider();
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
  if ((timeFrom && timeFrom !== "00:00") || (timeTo && timeTo !== "23:59")) {
    const wrapSuffix = isTimeRangeWrapped() ? " 🌙 +غداً" : "";
    chips.push({ key: "timeRange", label: `🕐 الوقت: ${timeFrom || "00:00"} - ${timeTo || "23:59"}${wrapSuffix}` });
  }
  if (upcomingOnly) chips.push({ key: "upcoming", label: "القادمة حالياً فقط" });
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
      if (key === "timeRange") { setTimeRangeLive(0, 1439); loadFlights(); return; }
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

// معالجة موحّدة لحقل إدخال عدد الركاب - تُستخدم من جدول الرحلات ومن نافذة الإدخال السريع معاً
function applyPaxInputChange(target) {
  const flightId = target.dataset.flightId;
  const val = target.value;
  if (val === "") {
    delete state.paxCounts[flightId];
  } else {
    state.paxCounts[flightId] = Number(val);
  }
  savePaxCounts(state.paxCounts);

  const num = val === "" ? null : Number(val);
  document.querySelectorAll(`.pax-input[data-flight-id="${CSS.escape(flightId)}"]`).forEach((input) => {
    if (input !== target) input.value = val;
    const track = input.closest(".pax-cell")?.querySelector(".pax-bar-fill");
    if (track) {
      track.style.width = (num ? paxBarPct(num) : 0) + "%";
      track.style.background = num ? paxBarColor(num) : "var(--border)";
    }
  });
}

// في نسخة الجوال، هذه الأعمدة فقط تظهر افتراضياً في البطاقة، والباقي يظهر عند النقر على البطاقة
const MOBILE_PRIMARY_COLS = ["flightNo", "city", "gate", "scheduled", "status"];

function buildCellContent(col, f) {
  switch (col.key) {
    case "type":
      return { html: `<span class="cell-value">${f.type === "arrival" ? "قدوم" : "مغادرة"}</span>` };
    case "flightNo":
      return { html: `<span class="cell-value">${escapeHtml(f.flightNo)}</span>` };
    case "airline":
      return { html: `<span class="cell-value">${escapeHtml(f.airline)}</span>` };
    case "city":
      return { html: `<span class="cell-value">${escapeHtml(f.city)}</span>` };
    case "terminal":
      return { html: `<span class="cell-value">${escapeHtml(f.terminal)}</span>` };
    case "gate":
      return { html: `<span class="cell-value">${escapeHtml(f.gate)}</span>` };
    case "scheduled":
      return { html: `<span class="cell-value">${f.scheduled ? fmtTime(f.scheduled) : "—"}</span>`, extraClass: "time-cell" };
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
  } else {
    badge.style.background = "rgba(34,197,94,.12)";
    badge.style.borderColor = "rgba(34,197,94,.35)";
    badge.style.color = "#22c55e";
    badgeText.textContent = "بيانات مباشرة وفق المصادر الرسمية لمطار الملك خالد الدولي";
  }
}

function renderAll() {
  const filtered = getFilteredFlights();
  renderChips();
  renderStats(filtered);
  renderTableHead();
  renderTable(filtered);
  renderMeta(filtered);
  renderTimeRangeSlider();
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
  initTimeRangeSlider();

  renderColumnsPanel();

  function setColumnsPanelOpen(open) {
    const panel = document.getElementById("columnsPanel");
    panel.hidden = !open;
    let backdrop = document.querySelector(".col-toggle-backdrop");
    if (open && window.matchMedia("(max-width: 720px)").matches) {
      if (!backdrop) {
        backdrop = document.createElement("div");
        backdrop.className = "col-toggle-backdrop";
        backdrop.addEventListener("click", () => setColumnsPanelOpen(false));
        document.body.appendChild(backdrop);
      }
    } else if (backdrop) {
      backdrop.remove();
    }
  }

  document.getElementById("columnsBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const panel = document.getElementById("columnsPanel");
    setColumnsPanelOpen(panel.hidden);
  });
  document.addEventListener("click", (e) => {
    const wrap = document.querySelector(".col-toggle-wrap");
    if (wrap && !wrap.contains(e.target)) setColumnsPanelOpen(false);
  });

  document.getElementById("flightsBody").addEventListener("input", (e) => {
    if (!e.target.classList.contains("pax-input")) return;
    applyPaxInputChange(e.target);
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

  document.getElementById("densityBtn").addEventListener("click", () => setDensityModalOpen(true));
  document.getElementById("closeDensityBtn").addEventListener("click", () => setDensityModalOpen(false));
  document.getElementById("densityChart").addEventListener("click", (e) => {
    const col = e.target.closest(".density-col");
    if (!col) return;
    showDensityDetail(Number(col.dataset.hour));
  });

  document.getElementById("quickPaxBtn").addEventListener("click", () => setQuickPaxModalOpen(true));
  document.getElementById("closeQuickPaxBtn").addEventListener("click", () => setQuickPaxModalOpen(false));

  document.getElementById("quickPaxList").addEventListener("input", (e) => {
    if (!e.target.classList.contains("pax-input")) return;
    applyPaxInputChange(e.target);
  });

  // الانتقال السريع للحقل التالي بالضغط على Enter لتسريع الإدخال المتتابع
  document.getElementById("quickPaxList").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !e.target.classList.contains("pax-input")) return;
    e.preventDefault();
    const inputs = [...document.querySelectorAll("#quickPaxList .pax-input")];
    const idx = inputs.indexOf(e.target);
    const next = inputs[idx + 1];
    if (next) { next.focus(); next.select(); }
    else e.target.blur();
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

  // شريط نطاق الوقت (المقبضان) يُوصَّل عبر wireTimeRangeSlider() - راجعها أدناه

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
      date: todayStr(), timeFrom: nowTimeStr(), timeTo: "23:59", upcomingOnly: false, q: "",
    };
    saveTypeFilter("all");
    saveTerminalFilter("all");
    setActiveSeg("all");
    document.getElementById("terminalFilter").value = "all";
    document.getElementById("statusFilter").value = "all";
    document.getElementById("airlineFilter").value = "all";
    renderTimeRangeSlider();
    document.getElementById("upcomingOnly").checked = false;
    document.getElementById("dateFilter").value = state.filters.date;
    document.getElementById("searchBox").value = "";
    loadFlights();
  });

  document.getElementById("copyBtn").addEventListener("click", copyTableToClipboard);
  document.getElementById("printBtn").addEventListener("click", printFlights);
  document.getElementById("exportWordBtn").addEventListener("click", exportWordDocument);
  document.getElementById("exportReportsBtn").addEventListener("click", copyReportsToClipboard);
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

// ألوان صريحة (وليست متغيرات CSS) لأن مستند Word لا يدعم متغيرات CSS، وحتى تظهر الألوان بشكل صحيح في PDF أيضاً
function paxBarColorHex(count) {
  if (count > PAX_EXPECTED) return "#ef4444";
  if (count >= PAX_EXPECTED * 0.75) return "#f59e0b";
  return "#22c55e";
}

// نستخدم جدولاً داخلياً بسيطاً (بدل flex/متغيرات CSS) ليعمل الشريط الملوّن بشكل صحيح
// سواء عند الطباعة/PDF أو عند فتح الملف في Word، لأن محرك عرض Word محدود الدعم لـ CSS الحديث
function buildPaxBarCellHtml(f) {
  const raw = state.paxCounts[f.id];
  const num = raw === undefined || raw === "" || raw === null ? null : Number(raw);
  if (num === null) return "—";

  const pct = Math.max(2, Math.round(paxBarPct(num)));
  const color = paxBarColorHex(num);
  return `
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; display:inline-table; vertical-align:middle;">
      <tr>
        <td style="font-weight:bold; padding-left:6px; white-space:nowrap; border:none;">${num}</td>
        <td style="border:none;">
          <table cellpadding="0" cellspacing="0" width="90" height="10"
                 style="border-collapse:collapse; width:90px; height:10px; background:#e5e7eb; border:1px solid #ccc;">
            <tr>
              <td width="${pct}%" style="background:${color}; height:10px; font-size:1px; line-height:1px; border:none;">&nbsp;</td>
              <td style="font-size:1px; line-height:1px; border:none;">&nbsp;</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

// نضع حدود/تباعد الجدول الخارجي كأنماط inline صريحة (وليس عبر قواعد CSS للوسم <td> عموماً)
// لأن Word لا يدعم موصّلات CSS مثل ">" لعزل الجداول المتداخلة (شريط الركاب)، فأي قاعدة عامة
// على <td> كانت ستُطبَّق أيضاً على خلايا الشريط الداخلية وتُفسد شكلها.
const PRINT_CELL_STYLE = "border:1px solid #333;padding:6px 8px;text-align:right;";
const PRINT_HEAD_STYLE = PRINT_CELL_STYLE + "background:#eee;font-weight:bold;";

function buildPrintableHtmlTable(filtered) {
  const visible = getVisibleColumns();
  const rows = filtered.map((f) => `
      <tr>${visible.map((c) => `<td style="${PRINT_CELL_STYLE}">${c.key === "pax" ? buildPaxBarCellHtml(f) : escapeHtml(getCellPlainValue(c, f))}</td>`).join("")}</tr>`).join("");

  return `
    <table class="flights-table" style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>${visible.map((c) => `<th style="${PRINT_HEAD_STYLE}">${escapeHtml(c.label)}</th>`).join("")}</tr>
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
  table.flights-table{width:100%;border-collapse:collapse;font-size:12px;}
  table.flights-table > thead > tr > th, table.flights-table > tbody > tr > td{border:1px solid #333;padding:6px 8px;text-align:right;}
  table.flights-table > thead > tr > th{background:#eee;font-weight:bold;}
  table.flights-table > tbody > tr{page-break-inside:avoid;}
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
  // نطبع دائماً عبر إطار مخفي داخل الصفحة نفسها بدل فتح نافذة/تبويب جديد: عند تشغيل الموقع
  // كتطبيق ويب مثبّت على الشاشة الرئيسية بالآيفون (PWA)، تفتح نافذة window.open فعلاً لكن
  // بدون أي شريط تنقل أو زر رجوع، مما يحبس المستخدم في تلك الصفحة. الإطار المخفي يتجنب
  // المشكلة كلياً لأنه لا يُظهر للمستخدم شيئاً سوى نافذة الطباعة الأصلية لنظام التشغيل.
  printViaHiddenFrame(html);
}

// طباعة عبر iframe مخفي داخل الصفحة نفسها - يتجنب مشكلة عدم القدرة على الرجوع بعد فتح
// صفحة/نافذة منفصلة عند تشغيل الموقع كتطبيق ويب مثبّت على الشاشة الرئيسية (PWA) في الآيفون
function printViaHiddenFrame(html) {
  let frame = document.getElementById("printFrame");
  if (!frame) {
    frame = document.createElement("iframe");
    frame.id = "printFrame";
    frame.style.cssText = "position:fixed; right:0; bottom:0; width:0; height:0; border:0; visibility:hidden;";
    document.body.appendChild(frame);
  }
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  const triggerPrint = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch {
      alert("تعذّر فتح نافذة الطباعة. يرجى التأكد من السماح بالنوافذ المنبثقة لهذا الموقع.");
    }
  };
  frame.onload = triggerPrint;
  setTimeout(triggerPrint, 400);
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
  table.flights-table{width:100%;border-collapse:collapse;font-size:10.5pt;}
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

const ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
function toArabicDigits(value) {
  return String(value).replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)]);
}

// نسخ سريع للتقارير: 3 أعمدة فقط (رمز الرحلة / رقم الرحلة بالعربي / المدينة) بدون عناوين أعمدة،
// يُنسخ مباشرة للحافظة (وليس ملف Word) ليُلصق فوراً في أي تقرير أو رسالة
function buildReportsTsv(filtered) {
  return filtered.map((f) => {
    const parts = (f.flightNo || "").trim().split(/\s+/);
    const code = parts[0] || "—";
    const number = parts.length > 1 ? parts.slice(1).join(" ") : "";
    return [code, toArabicDigits(number), f.city].join("\t");
  }).join("\n");
}

async function copyReportsToClipboard() {
  const filtered = getFilteredFlights();
  const tsv = buildReportsTsv(filtered);
  const btn = document.getElementById("exportReportsBtn");
  const original = btn.innerHTML;

  try {
    await navigator.clipboard.writeText(tsv);
    btn.innerHTML = "✅ تم النسخ";
  } catch {
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

/* ---------------------------- كثافة الرحلات حسب الوقت ---------------------------- */

// إن أُدخل عدد ركاب يدوياً لأي رحلة ضمن الرحلات المعروضة، تُحسب الكثافة بمجموع الركاب لكل ساعة.
// وإلا (لا يوجد أي عدد ركاب مُدخل) تُحسب الكثافة بعدد الرحلات المجدولة في كل ساعة كبديل معقول.
function computeDensity(filtered) {
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, value: 0, flights: [] }));
  const hasPax = filtered.some((f) => {
    const raw = state.paxCounts[f.id];
    return raw !== undefined && raw !== "" && raw !== null && Number(raw) > 0;
  });

  filtered.forEach((f) => {
    if (!f.scheduled) return;
    const h = f.scheduled.getHours();
    const raw = state.paxCounts[f.id];
    const num = raw === undefined || raw === "" || raw === null ? null : Number(raw);
    buckets[h].flights.push({ flightNo: f.flightNo, city: f.city, type: f.type, pax: num });
    buckets[h].value += hasPax ? (num || 0) : 1;
  });

  buckets.forEach((b) => b.flights.sort((a, c) => (c.pax || 0) - (a.pax || 0)));

  return { buckets, mode: hasPax ? "pax" : "flights" };
}

// آخر بيانات كثافة محسوبة، تُستخدم عند النقر على أي عمود لعرض تفاصيل تلك الساعة
let lastDensityBuckets = [];
let lastDensityMode = "flights";

function renderDensityChart() {
  const filtered = getFilteredFlights();
  const { buckets, mode } = computeDensity(filtered);
  lastDensityBuckets = buckets;
  lastDensityMode = mode;

  const maxVal = Math.max(...buckets.map((b) => b.value), 0);

  const noteEl = document.getElementById("densityModeNote");
  const peakEl = document.getElementById("densityPeak");
  const chartEl = document.getElementById("densityChart");
  const detailEl = document.getElementById("densityDetail");

  detailEl.innerHTML = `<div class="density-empty">اضغط على أي عمود لعرض تفاصيل الرحلات وعدد الركاب في تلك الساعة</div>`;

  noteEl.textContent = mode === "pax"
    ? "الكثافة محسوبة بناءً على عدد الركاب المُدخل يدوياً لكل رحلة ضمن الرحلات المعروضة حالياً."
    : "لا يوجد عدد ركاب مُدخل حتى الآن، لذلك الكثافة محسوبة بناءً على عدد الرحلات المجدولة في كل ساعة.";

  if (maxVal <= 0) {
    peakEl.style.display = "none";
    chartEl.innerHTML = `<div class="density-empty">لا توجد رحلات كافية لعرض الكثافة ضمن الفلاتر الحالية.</div>`;
    return;
  }

  const peakHours = buckets.filter((b) => b.value === maxVal).map((b) => b.hour);
  peakEl.style.display = "flex";
  const peakLabel = peakHours.map((h) => `${pad(h)}:00`).join("، ");
  peakEl.innerHTML = `⏰ وقت الذروة: <span>${escapeHtml(peakLabel)}</span> (${maxVal} ${mode === "pax" ? "راكب متوقع" : "رحلة"})`;

  chartEl.innerHTML = buckets.map((b) => {
    const pct = Math.max(4, (b.value / maxVal) * 100);
    const isPeak = b.value === maxVal;
    const color = b.value === 0 ? "var(--border)" : isPeak ? "var(--danger)" : (b.value / maxVal > 0.6 ? "var(--warn)" : "var(--ok)");
    return `
      <div class="density-col ${isPeak ? "peak" : ""}" data-hour="${b.hour}" title="${pad(b.hour)}:00 — ${b.value} ${mode === "pax" ? "راكب" : "رحلة"} (اضغط للتفاصيل)">
        <div class="density-col-bar" style="height:${pct}%; background:${color}"></div>
        <div class="density-col-hour">${pad(b.hour)}</div>
      </div>`;
  }).join("");
}

function showDensityDetail(hour) {
  const bucket = lastDensityBuckets[hour];
  const detailEl = document.getElementById("densityDetail");
  document.querySelectorAll(".density-col").forEach((c) => c.classList.toggle("selected", Number(c.dataset.hour) === hour));

  if (!bucket || !bucket.flights.length) {
    detailEl.innerHTML = `<div class="density-empty">لا توجد رحلات مجدولة الساعة ${pad(hour)}:00</div>`;
    return;
  }

  const rows = bucket.flights.map((f) => {
    const dir = f.type === "arrival" ? "قدوم" : "مغادرة";
    const paxLabel = f.pax !== null ? `<span class="pax-val">${f.pax} راكب</span>` : `<span>— لم يُدخل</span>`;
    return `<div class="density-detail-row"><span>${escapeHtml(f.flightNo)} · ${escapeHtml(dir)} · ${escapeHtml(f.city)}</span>${paxLabel}</div>`;
  }).join("");

  detailEl.innerHTML = `<h4>تفاصيل الساعة ${pad(hour)}:00 — ${bucket.flights.length} رحلة</h4>${rows}`;
}

function setDensityModalOpen(open) {
  const modal = document.getElementById("densityModal");
  modal.hidden = !open;
  let backdrop = document.querySelector(".density-backdrop");
  if (open) {
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "density-backdrop";
      backdrop.addEventListener("click", () => setDensityModalOpen(false));
      document.body.appendChild(backdrop);
    }
    renderDensityChart();
  } else if (backdrop) {
    backdrop.remove();
  }
}

/* ---------------------------- إدخال سريع لعدد الركاب (الجوال) ---------------------------- */

function renderQuickPaxList() {
  const filtered = getFilteredFlights();
  const list = document.getElementById("quickPaxList");

  if (!filtered.length) {
    list.innerHTML = `<div class="density-empty">لا توجد رحلات مطابقة للفلاتر الحالية.</div>`;
    return;
  }

  list.innerHTML = filtered.map((f) => {
    const dir = f.type === "arrival" ? "قدوم" : "مغادرة";
    const time = f.scheduled ? fmtTime(f.scheduled) : "—";
    const paxHtml = buildCellContent({ key: "pax" }, f).html;
    return `
      <div class="quickpax-row">
        <div class="quickpax-info">
          <div class="quickpax-flightno">${escapeHtml(f.flightNo)}</div>
          <div class="quickpax-meta">${escapeHtml(dir)} · ${escapeHtml(f.city)} · ${time}</div>
        </div>
        ${paxHtml}
      </div>`;
  }).join("");
}

function setQuickPaxModalOpen(open) {
  const modal = document.getElementById("quickPaxModal");
  modal.hidden = !open;
  let backdrop = document.querySelector(".quickpax-backdrop");
  if (open) {
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "quickpax-backdrop";
      backdrop.addEventListener("click", () => setQuickPaxModalOpen(false));
      document.body.appendChild(backdrop);
    }
    renderQuickPaxList();
    const firstInput = document.querySelector("#quickPaxList .pax-input");
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
  } else if (backdrop) {
    backdrop.remove();
  }
}

/* ---------------------------- Boot ---------------------------- */

function boot() {
  initUI();
  renderClock();
  setInterval(renderClock, 1000);
  loadFlights();
  // لا يوجد تحديث تلقائي للبيانات بالنية - التحديث يتم فقط عند ضغط المستخدم لزر "تحديث"،
  // للحفاظ على حصة الطلبات الشهرية المجانية لمزوّد البيانات.
}

document.addEventListener("DOMContentLoaded", boot);
