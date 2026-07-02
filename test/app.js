/* global pdfjsLib */
"use strict";

pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";

const state = {
  passengers: [],
  selected: [],
  query: "",
  flightNumber: ""
};

const elements = {
  input: document.getElementById("pdf-input"),
  choose: document.getElementById("choose-file"),
  dropZone: document.getElementById("drop-zone"),
  fileStatus: document.getElementById("file-status"),
  search: document.getElementById("passenger-search"),
  clearSearch: document.getElementById("clear-search"),
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
  toast: document.getElementById("toast")
};

function normalize(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[،/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const passengerPattern = /^(\d+)\.(.*?)\s+(?:(?:MR|MRS|MS|MISS|MSTR|PRCS)\s+)?[MFCI]\s+[A-Z]{3}\s+[A-Z]{3}\s+\S+\s+[A-Z]\s+(\d{2,3}[A-Z]?)$/i;
  const passportPattern = /^([A-Z]{3})\s+([A-Z0-9<]+)$/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/\s+/g, " ").trim();
    const match = line.match(passengerPattern);
    if (!match) continue;

    let passport = "";
    let nationality = "";

    for (let next = index + 1; next < Math.min(lines.length, index + 5); next += 1) {
      const candidate = lines[next].replace(/\s+/g, " ").trim();
      if (/^\d+\./.test(candidate)) break;
      const passportMatch = candidate.match(passportPattern);
      if (passportMatch) {
        nationality = passportMatch[1].toUpperCase();
        passport = passportMatch[2].toUpperCase();
        break;
      }
    }

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

function extractFlightNumber(lines) {
  for (const line of lines.slice(0, 25)) {
    const match = line.toUpperCase().match(/\b([A-Z]{2}\d{2,4})\b/);
    if (match) return match[1];
  }
  return "";
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

  return {
    passengers: parsePassengerLines(allLines),
    flightNumber: extractFlightNumber(allLines)
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
    elements.search.value = "";
    const flightLabel = state.flightNumber ? ` - الرحلة ${state.flightNumber}` : "";
    elements.fileStatus.textContent = `${file.name}${flightLabel} - تم استخراج ${passengers.length} راكب بنجاح`;
    render();
    showToast(`تم استخراج ${passengers.length} راكب.`);
  } catch (error) {
    console.error(error);
    elements.fileStatus.textContent = "تعذر قراءة البيان. تأكد أن الملف بنفس تنسيق تقرير Altea.";
    showToast(error.message || "حدث خطأ أثناء قراءة PDF.");
  } finally {
    elements.choose.disabled = false;
    elements.input.value = "";
  }
}

function filteredPassengers() {
  const query = normalize(state.query);
  if (!query) return state.passengers;
  return state.passengers.filter(passenger =>
    normalize(`${passenger.name} ${passenger.passport} ${passenger.seat} ${passenger.nationality}`).includes(query)
  );
}

function addPassenger(id) {
  if (state.selected.some(passenger => passenger.id === id)) return;
  const passenger = state.passengers.find(item => item.id === id);
  if (!passenger) return;
  state.selected.push({ ...passenger });
  render();
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

  return `الركاب الغير مسدد مغادرتهم على رحلة (${state.flightNumber})\n\n${passengerLines}\n\nاشعارنا فوراً عند وصول اي راكب على البوابة`;
}

function renderMessage() {
  const text = messageText();
  elements.message.textContent = text || "ستظهر الرسالة هنا بعد اختيار الركاب.";
  elements.selectedCount.textContent = state.selected.length;
  elements.send.disabled = !state.selected.length;
}

function render() {
  elements.totalCount.textContent = state.passengers.length;
  renderSource();
  renderSelected();
  renderMessage();
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
  state.query = "";
  elements.search.value = "";
  renderSource();
  elements.search.focus();
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
  elements.search.value = "";
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
