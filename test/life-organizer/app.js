(() => {
  "use strict";

  const STORAGE_KEY = "lo_tasks_v1";
  const SETTINGS_KEY = "lo_settings_v1";
  const NOTIFIED_KEY = "lo_notified_v1";

  const CATEGORIES = [
    { id: "english", label: "الإنجليزية", icon: "🗣️", color: "#4c8bf5" },
    { id: "focus", label: "التركيز", icon: "🧠", color: "#a855f7" },
    { id: "coding", label: "البرمجة", icon: "💻", color: "#22c55e" },
    { id: "gaming", label: "الألعاب", icon: "🎮", color: "#f97316" },
    { id: "health", label: "الصحة", icon: "💊", color: "#ef4444" },
    { id: "sport", label: "رياضة", icon: "🏋️", color: "#06b6d4" },
    { id: "reading", label: "قراءة", icon: "📖", color: "#eab308" },
    { id: "prayer", label: "عبادة", icon: "🕌", color: "#14b8a6" },
    { id: "sleep", label: "نوم", icon: "🌙", color: "#6366f1" },
    { id: "water", label: "ماء", icon: "💧", color: "#0ea5e9" },
    { id: "work", label: "عمل", icon: "💼", color: "#64748b" },
    { id: "other", label: "أخرى", icon: "⭐", color: "#635bff" },
  ];

  const DAY_NAMES = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
  const DAY_SHORT = ["أحد", "اثنين", "ثلا", "أرب", "خميس", "جمعة", "سبت"];

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const catOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

  const PRIORITIES = { low: { label: "منخفضة", weight: 0 }, medium: { label: "متوسطة", weight: 1 }, high: { label: "عالية", weight: 2 } };
  const SOON_THRESHOLD_MIN = 30;

  // One-time migration: this version moves to Supabase as the source of
  // truth, so any old locally-seeded sample tasks are cleared once.
  if (!localStorage.getItem("lo_migrated_v2")) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("lo_seeded");
    localStorage.setItem("lo_migrated_v2", "1");
  }

  // ---------- State ----------
  let tasks = loadTasks();
  let settings = loadSettings();
  let selectedCategory = CATEGORIES[0].id;
  let selectedType = "daily";
  let selectedPriority = "medium";
  let selectedTimeMode = "fixed";
  let selectedDays = new Set();
  let editingId = null;
  let currentView = "today";
  let searchQuery = "";
  let filterCategory = "all";
  let doneCollapsed = true;

  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  function saveTasks() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }

  // ---------- Supabase ----------
  let supabaseClient = null;
  function initSupabase() {
    if (window.supabase && typeof SUPABASE_URL !== "undefined" && SUPABASE_URL) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
  }

  function rowToTask(row) {
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      priority: row.priority,
      type: row.type,
      flexible: !!row.flexible,
      time: row.time,
      days: row.days || [],
      date: row.date,
      duration: row.duration,
      notes: row.notes || "",
      remind: row.remind,
      completions: row.completions || [],
      streak: row.streak || 0,
      createdAt: row.created_at,
    };
  }

  function taskToRow(t) {
    return {
      title: t.title,
      category: t.category,
      priority: t.priority,
      type: t.type,
      flexible: !!t.flexible,
      time: t.time || null,
      days: t.days || [],
      date: t.date || null,
      duration: t.duration,
      notes: t.notes || "",
      remind: t.remind,
      completions: t.completions || [],
      streak: t.streak || 0,
    };
  }

  async function fetchTasksFromDB() {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient.from("tasks").select("*").order("created_at", { ascending: true });
    if (error) { console.warn("Supabase fetch error", error); return null; }
    return data.map(rowToTask);
  }

  async function insertTaskDB(t) {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient.from("tasks").insert(taskToRow(t)).select().single();
    if (error) { console.warn("Supabase insert error", error); return null; }
    return rowToTask(data);
  }

  async function updateTaskDB(id, patch) {
    if (!supabaseClient) return false;
    const { error } = await supabaseClient.from("tasks").update(patch).eq("id", id);
    if (error) { console.warn("Supabase update error", error); return false; }
    return true;
  }

  async function deleteTaskDB(id) {
    if (!supabaseClient) return false;
    const { error } = await supabaseClient.from("tasks").delete().eq("id", id);
    if (error) { console.warn("Supabase delete error", error); return false; }
    return true;
  }

  async function deleteAllTasksDB() {
    if (!supabaseClient) return false;
    const { error } = await supabaseClient.from("tasks").delete().not("id", "is", null);
    if (error) { console.warn("Supabase delete-all error", error); return false; }
    return true;
  }

  function setSyncStatus(state) {
    const dot = $("syncDot");
    const text = $("syncStatusText");
    if (!dot || !text) return;
    dot.className = "sync-dot " + state;
    const map = {
      checking: "جاري التحقق من الاتصال...",
      online: "متصل ومتزامن مع Supabase ✅",
      offline: "غير متصل بقاعدة البيانات — يعمل محلياً وسيُزامن لاحقاً",
      syncing: "جاري المزامنة...",
    };
    text.textContent = map[state] || "";
  }

  async function loadAndSyncTasks() {
    setSyncStatus("checking");
    const remote = await fetchTasksFromDB();
    if (remote) {
      tasks = remote;
      saveTasks();
      setSyncStatus("online");
      renderAll();
    } else {
      setSyncStatus("offline");
    }
  }

  function syncTaskUpdate(id, patch) {
    updateTaskDB(id, patch).then((ok) => setSyncStatus(ok ? "online" : "offline"));
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...defaultSettings(), ...JSON.parse(raw) } : defaultSettings();
    } catch { return defaultSettings(); }
  }
  function defaultSettings() {
    return { sound: true, earlyReminder: false, weekStart: 6, notifyEnabled: false, theme: "system" };
  }
  function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

  function loadNotified() {
    try {
      const raw = localStorage.getItem(NOTIFIED_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      if (obj.date !== todayISO()) return { date: todayISO(), ids: [] };
      return obj;
    } catch { return { date: todayISO(), ids: [] }; }
  }
  function markNotified(key) {
    const n = loadNotified();
    n.ids.push(key);
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(n));
  }
  function wasNotified(key) {
    const n = loadNotified();
    return n.ids.includes(key);
  }

  // ---------- DOM refs ----------
  const $ = (id) => document.getElementById(id);
  const todayEmpty = $("todayEmpty");
  const overdueGroup = $("overdueGroup"), overdueList = $("overdueList"), overdueCount = $("overdueCount");
  const soonGroup = $("soonGroup"), soonList = $("soonList"), soonCount = $("soonCount");
  const upcomingGroup = $("upcomingGroup"), upcomingList = $("upcomingList"), upcomingCount = $("upcomingCount");
  const anytimeGroup = $("anytimeGroup"), anytimeList = $("anytimeList"), anytimeCount = $("anytimeCount");
  const doneGroup = $("doneGroup"), doneList = $("doneList"), doneCount = $("doneCount");
  const doneToggle = $("doneToggle"), doneChevron = $("doneChevron");
  const allList = $("allList");
  const allEmpty = $("allEmpty");
  const filterEmpty = $("filterEmpty");
  const searchInput = $("searchInput");
  const filterChips = $("filterChips");
  const statsGrid = $("statsGrid");
  const streaksList = $("streaksList");
  const weekChart = $("weekChart");
  const progressFill = $("progressFill");
  const progressLabel = $("progressLabel");
  const greeting = $("greeting");
  const todayLabel = $("todayLabel");
  const sheetOverlay = $("sheetOverlay");
  const taskForm = $("taskForm");
  const sheetTitle = $("sheetTitle");
  const categoryPicker = $("categoryPicker");
  const daysPicker = $("daysPicker");
  const daysField = $("daysField");
  const dateField = $("dateField");
  const deleteTaskBtn = $("deleteTaskBtn");
  const toast = $("toast");
  const alertBanner = $("alertBanner");
  const lockScreen = $("lockScreen");
  const appRoot = $("app");
  const lockForm = $("lockForm");
  const lockInput = $("lockInput");
  const lockError = $("lockError");

  // ---------- Init UI ----------
  function initGreeting() {
    const h = new Date().getHours();
    let g = "مساء الخير";
    if (h < 12) g = "صباح الخير";
    else if (h < 17) g = "طاب يومك";
    else if (h < 21) g = "مساء الخير";
    else g = "تصبح على خير";
    greeting.textContent = g + " 👋";
    const days = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
    const months = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
    const d = new Date();
    todayLabel.textContent = `${days[d.getDay()]}، ${d.getDate()} ${months[d.getMonth()]}`;
  }

  function renderCategoryPicker() {
    categoryPicker.innerHTML = "";
    CATEGORIES.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (c.id === selectedCategory ? " selected" : "");
      btn.innerHTML = `<span>${c.icon}</span><span>${c.label}</span>`;
      btn.style.borderColor = c.id === selectedCategory ? c.color : "";
      btn.style.background = c.id === selectedCategory ? c.color : "";
      btn.addEventListener("click", () => {
        selectedCategory = c.id;
        renderCategoryPicker();
      });
      categoryPicker.appendChild(btn);
    });
  }

  function renderDaysPicker() {
    daysPicker.innerHTML = "";
    DAY_SHORT.forEach((name, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (selectedDays.has(idx) ? " selected" : "");
      btn.textContent = name;
      btn.addEventListener("click", () => {
        if (selectedDays.has(idx)) selectedDays.delete(idx);
        else selectedDays.add(idx);
        renderDaysPicker();
      });
      daysPicker.appendChild(btn);
    });
  }

  function setType(type) {
    selectedType = type;
    document.querySelectorAll("#typeSegmented .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.type === type));
    daysField.style.display = type === "weekly" ? "flex" : "none";
    dateField.style.display = type === "once" ? "flex" : "none";
    $("f-date").required = type === "once";
  }

  function setPriority(p) {
    selectedPriority = p;
    document.querySelectorAll("#prioritySegmented .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.priority === p));
  }

  function setTimeMode(mode) {
    selectedTimeMode = mode;
    document.querySelectorAll("#timeModeSegmented .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.timemode === mode));
    const fixed = mode === "fixed";
    $("timeRow").style.display = fixed ? "grid" : "none";
    $("durationOnlyField").style.display = fixed ? "none" : "flex";
    $("remindField").style.display = fixed ? "flex" : "none";
    $("f-time").required = fixed;
  }

  // ---------- Task helpers ----------
  function isDueToday(task) {
    const dow = new Date().getDay();
    if (task.type === "daily") return true;
    if (task.type === "weekly") return task.days && task.days.includes(dow);
    if (task.type === "once") return task.date === todayISO();
    return false;
  }

  function completionKey(task) {
    return task.type === "once" ? task.date : todayISO();
  }

  function isDoneToday(task) {
    return (task.completions || []).includes(completionKey(task));
  }

  function toggleDone(id) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    t.completions = t.completions || [];
    const key = completionKey(t);
    const idx = t.completions.indexOf(key);
    if (idx >= 0) {
      t.completions.splice(idx, 1);
    } else {
      t.completions.push(key);
      updateStreak(t);
      confettiToast();
    }
    saveTasks();
    renderAll();
    syncTaskUpdate(id, { completions: t.completions, streak: t.streak });
  }

  function updateStreak(t) {
    // simple streak: count consecutive completion days ending today
    t.streak = (t.streak || 0) + 1;
  }

  function computeStreak(t) {
    if (!t.completions || !t.completions.length) return 0;
    let streak = 0;
    const d = new Date();
    for (;;) {
      const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      if (t.type === "weekly" && !t.days.includes(d.getDay())) {
        d.setDate(d.getDate() - 1);
        if (streak > 400) break;
        continue;
      }
      if (t.completions.includes(iso)) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  function sortByTime(list) {
    return list.slice().sort((a, b) => {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });
  }

  function minutesUntil(task) {
    if (!task.time) return null;
    const [h, m] = task.time.split(":").map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(h, m, 0, 0);
    return Math.round((target - now) / 60000);
  }

  function getTaskStatus(task) {
    if (isDoneToday(task)) return "done";
    if (task.flexible || !task.time) return "anytime";
    const diff = minutesUntil(task);
    if (diff === null) return "anytime";
    if (diff < 0) return "overdue";
    if (diff <= SOON_THRESHOLD_MIN) return "soon";
    return "upcoming";
  }

  // ---------- Rendering ----------
  function taskCard(task, opts = {}) {
    const c = catOf(task.category);
    const done = isDoneToday(task);
    const status = getTaskStatus(task);
    const priority = task.priority || "medium";
    const card = document.createElement("div");
    card.className = "task-card priority-" + priority + (done ? " done" : "");
    card.dataset.id = task.id;

    const metaParts = [];
    if (task.type === "daily") metaParts.push("يومياً");
    if (task.type === "weekly") metaParts.push((task.days || []).map((d) => DAY_SHORT[d]).join("، "));
    if (task.type === "once") metaParts.push("مرة واحدة");
    if (task.flexible) metaParts.push("🕊️ مرن");
    if (task.duration) metaParts.push(`${task.duration} د`);

    const streak = computeStreak(task);
    let badge = "";
    if (!opts.hideBadge && !done) {
      if (status === "overdue") badge = `<button type="button" class="badge-pill badge-overdue" title="اضغط لتحديدها كمكتملة">متأخر ⏰ · تحديد كمكتملة ✓</button>`;
      else if (status === "soon") badge = `<button type="button" class="badge-pill badge-soon" title="اضغط لتحديدها كمكتملة">قريب ⏳ · تحديد كمكتملة ✓</button>`;
    }

    card.innerHTML = `
      <button class="task-check" aria-label="إنجاز">${done ? "✓" : ""}</button>
      <div class="task-cat-icon" style="background:${c.color}22; color:${c.color}">${c.icon}</div>
      <div class="task-info">
        <p class="task-title">${escapeHtml(task.title)}</p>
        <div class="task-meta">
          <span>${c.label}</span>
          <span class="dot">•</span>
          <span>${metaParts.join(" · ")}</span>
          ${streak > 1 ? `<span class="task-streak">🔥 ${streak}</span>` : ""}
        </div>
        ${badge ? `<div class="task-meta">${badge}</div>` : ""}
      </div>
      <div class="task-time">${task.flexible ? "🕊️" : (task.time || "")}</div>
    `;
    card.querySelector(".task-check").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleDone(task.id);
    });
    const badgeBtn = card.querySelector(".badge-pill");
    if (badgeBtn) {
      badgeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleDone(task.id);
      });
    }
    card.addEventListener("click", () => openEdit(task.id));
    return card;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderToday() {
    const due = sortByTime(tasks.filter(isDueToday));
    todayEmpty.classList.toggle("hidden", due.length > 0);

    const overdue = [], soon = [], upcoming = [], anytime = [], doneTasks = [];
    due.forEach((t) => {
      const status = getTaskStatus(t);
      if (status === "done") doneTasks.push(t);
      else if (status === "overdue") overdue.push(t);
      else if (status === "soon") soon.push(t);
      else if (status === "anytime") anytime.push(t);
      else upcoming.push(t);
    });

    function fillGroup(group, listEl, countEl, list) {
      group.classList.toggle("hidden", list.length === 0);
      countEl.textContent = list.length;
      listEl.innerHTML = "";
      list.forEach((t) => listEl.appendChild(taskCard(t, { hideBadge: group === doneGroup })));
    }
    fillGroup(overdueGroup, overdueList, overdueCount, overdue);
    fillGroup(soonGroup, soonList, soonCount, soon);
    fillGroup(upcomingGroup, upcomingList, upcomingCount, upcoming);
    fillGroup(anytimeGroup, anytimeList, anytimeCount, anytime);
    fillGroup(doneGroup, doneList, doneCount, doneTasks);
    doneList.classList.toggle("hidden", doneCollapsed);
    doneToggle.classList.toggle("collapsed", doneCollapsed);

    const doneN = doneTasks.length;
    const pct = due.length ? Math.round((doneN / due.length) * 100) : 0;
    progressFill.style.width = pct + "%";
    progressLabel.textContent = `${doneN} / ${due.length}`;
  }

  function renderFilterChips() {
    filterChips.innerHTML = "";
    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "chip" + (filterCategory === "all" ? " selected" : "");
    allBtn.textContent = "الكل";
    allBtn.addEventListener("click", () => { filterCategory = "all"; renderFilterChips(); renderAllTasks(); });
    filterChips.appendChild(allBtn);
    CATEGORIES.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (filterCategory === c.id ? " selected" : "");
      btn.innerHTML = `<span>${c.icon}</span><span>${c.label}</span>`;
      if (filterCategory === c.id) { btn.style.background = c.color; btn.style.borderColor = c.color; }
      btn.addEventListener("click", () => { filterCategory = c.id; renderFilterChips(); renderAllTasks(); });
      filterChips.appendChild(btn);
    });
  }

  function renderAllTasks() {
    allList.innerHTML = "";
    allEmpty.classList.toggle("hidden", tasks.length > 0);

    let filtered = tasks;
    if (filterCategory !== "all") filtered = filtered.filter((t) => t.category === filterCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((t) => t.title.toLowerCase().includes(q) || (t.notes || "").toLowerCase().includes(q));
    }

    filterEmpty.classList.toggle("hidden", !(tasks.length > 0 && filtered.length === 0));

    const groups = { daily: [], weekly: [], once: [] };
    filtered.forEach((t) => groups[t.type]?.push(t));

    const labels = { daily: "🔁 يومياً", weekly: "📅 أسبوعياً", once: "📌 مرة واحدة" };
    ["daily", "weekly", "once"].forEach((type) => {
      if (!groups[type].length) return;
      const head = document.createElement("div");
      head.className = "time-group-label";
      head.textContent = labels[type];
      allList.appendChild(head);
      sortByTime(groups[type]).forEach((t) => allList.appendChild(taskCard(t)));
    });
  }

  function renderWeekChart() {
    weekChart.innerHTML = "";
    const dayLabels = ["أحد", "اثنين", "ثلا", "أرب", "خميس", "جمعة", "سبت"];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dow = d.getDay();
      const dueThatDay = tasks.filter((t) => {
        if (t.type === "daily") return true;
        if (t.type === "weekly") return t.days && t.days.includes(dow);
        if (t.type === "once") return t.date === iso;
        return false;
      });
      const doneThatDay = dueThatDay.filter((t) => (t.completions || []).includes(iso)).length;
      const pct = dueThatDay.length ? Math.round((doneThatDay / dueThatDay.length) * 100) : 0;
      const isToday = i === 0;

      const wrap = document.createElement("div");
      wrap.className = "week-bar-wrap";
      wrap.innerHTML = `
        <div class="week-bar-track"><div class="week-bar-fill${isToday ? " today-bar" : ""}" style="height:${pct}%"></div></div>
        <div class="week-bar-label">${dayLabels[dow]}</div>
      `;
      weekChart.appendChild(wrap);
    }
  }

  function renderStats() {
    const totalTasks = tasks.length;
    const dueToday = tasks.filter(isDueToday);
    const doneToday = dueToday.filter(isDoneToday).length;
    const bestStreak = tasks.reduce((max, t) => Math.max(max, computeStreak(t)), 0);
    const totalCompletions = tasks.reduce((sum, t) => sum + (t.completions ? t.completions.length : 0), 0);

    statsGrid.innerHTML = "";
    const stats = [
      { v: totalTasks, l: "إجمالي المهام" },
      { v: `${doneToday}/${dueToday.length}`, l: "مُنجَز اليوم" },
      { v: bestStreak, l: "أفضل سلسلة 🔥" },
      { v: totalCompletions, l: "مرات الإنجاز" },
    ];
    stats.forEach((s) => {
      const el = document.createElement("div");
      el.className = "stat-card";
      el.innerHTML = `<div class="stat-value">${s.v}</div><div class="stat-label">${s.l}</div>`;
      statsGrid.appendChild(el);
    });

    streaksList.innerHTML = "";
    const withStreak = tasks
      .map((t) => ({ t, s: computeStreak(t) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8);
    if (!withStreak.length) {
      const p = document.createElement("p");
      p.className = "muted small";
      p.textContent = "أنجز مهامك يومياً لتبدأ سلسلة 🔥";
      streaksList.appendChild(p);
    } else {
      withStreak.forEach(({ t, s }) => {
        const c = catOf(t.category);
        const row = document.createElement("div");
        row.className = "task-card";
        row.innerHTML = `
          <div class="task-cat-icon" style="background:${c.color}22; color:${c.color}">${c.icon}</div>
          <div class="task-info">
            <p class="task-title">${escapeHtml(t.title)}</p>
          </div>
          <div class="task-streak" style="font-size:14px">🔥 ${s} يوم</div>
        `;
        streaksList.appendChild(row);
      });
    }
  }

  function renderAll() {
    renderToday();
    renderFilterChips();
    renderAllTasks();
    renderStats();
    renderWeekChart();
  }

  // ---------- Sheet (Add/Edit) ----------
  function openAdd() {
    editingId = null;
    sheetTitle.textContent = "مهمة جديدة";
    taskForm.reset();
    selectedCategory = CATEGORIES[0].id;
    selectedDays = new Set([new Date().getDay()]);
    setType("daily");
    setPriority("medium");
    setTimeMode("fixed");
    $("f-time").value = "08:00";
    $("f-date").value = todayISO();
    $("f-remind").checked = true;
    deleteTaskBtn.classList.add("hidden");
    renderCategoryPicker();
    renderDaysPicker();
    openSheet();
  }

  function openEdit(id) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    editingId = id;
    sheetTitle.textContent = "تعديل المهمة";
    $("f-title").value = t.title;
    selectedCategory = t.category;
    selectedDays = new Set(t.days || []);
    setType(t.type);
    setPriority(t.priority || "medium");
    setTimeMode(t.flexible ? "flexible" : "fixed");
    $("f-time").value = t.time || "08:00";
    $("f-date").value = t.date || todayISO();
    $("f-duration").value = t.duration || "";
    $("f-duration-flex").value = t.duration || "";
    $("f-notes").value = t.notes || "";
    $("f-remind").checked = t.remind !== false;
    deleteTaskBtn.classList.remove("hidden");
    renderCategoryPicker();
    renderDaysPicker();
    openSheet();
  }

  function openSheet() {
    sheetOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeSheet() {
    sheetOverlay.classList.remove("open");
    document.body.style.overflow = "";
  }

  taskForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = $("f-title").value.trim();
    if (!title) return;
    if (selectedType === "weekly" && selectedDays.size === 0) {
      showToast("اختر يوماً واحداً على الأقل");
      return;
    }
    const flexible = selectedTimeMode === "flexible";
    const duration = flexible
      ? ($("f-duration-flex").value ? Number($("f-duration-flex").value) : null)
      : ($("f-duration").value ? Number($("f-duration").value) : null);

    const data = {
      title,
      category: selectedCategory,
      priority: selectedPriority,
      type: selectedType,
      flexible,
      days: Array.from(selectedDays),
      date: $("f-date").value || todayISO(),
      time: flexible ? null : $("f-time").value,
      duration,
      notes: $("f-notes").value.trim(),
      remind: flexible ? false : $("f-remind").checked,
    };

    if (editingId) {
      const t = tasks.find((x) => x.id === editingId);
      Object.assign(t, data);
      saveTasks();
      renderAll();
      closeSheet();
      showToast("تم تحديث المهمة ✏️");
      syncTaskUpdate(editingId, taskToRow(t));
    } else {
      const localTask = { id: uid(), completions: [], streak: 0, createdAt: Date.now(), ...data };
      tasks.push(localTask);
      saveTasks();
      renderAll();
      closeSheet();
      showToast("تمت إضافة المهمة ✅");
      insertTaskDB(localTask).then((saved) => {
        if (saved) {
          const idx = tasks.findIndex((t) => t.id === localTask.id);
          if (idx >= 0) tasks[idx] = { ...saved };
          saveTasks();
          renderAll();
          setSyncStatus("online");
        } else {
          setSyncStatus("offline");
        }
      });
    }
  });

  deleteTaskBtn.addEventListener("click", () => {
    if (!editingId) return;
    const idToDelete = editingId;
    tasks = tasks.filter((t) => t.id !== idToDelete);
    saveTasks();
    renderAll();
    closeSheet();
    showToast("تم حذف المهمة 🗑️");
    deleteTaskDB(idToDelete).then((ok) => setSyncStatus(ok ? "online" : "offline"));
  });

  $("sheetClose").addEventListener("click", closeSheet);
  sheetOverlay.addEventListener("click", (e) => { if (e.target === sheetOverlay) closeSheet(); });
  $("fab").addEventListener("click", openAdd);
  document.querySelectorAll('[data-action="open-add"]').forEach((b) => b.addEventListener("click", openAdd));

  document.querySelectorAll("#typeSegmented .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => setType(btn.dataset.type));
  });
  document.querySelectorAll("#prioritySegmented .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => setPriority(btn.dataset.priority));
  });
  document.querySelectorAll("#timeModeSegmented .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => setTimeMode(btn.dataset.timemode));
  });

  doneToggle.addEventListener("click", () => {
    doneCollapsed = !doneCollapsed;
    doneList.classList.toggle("hidden", doneCollapsed);
    doneToggle.classList.toggle("collapsed", doneCollapsed);
  });

  let searchTimer = null;
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderAllTasks, 120);
  });

  // ---------- Nav ----------
  function switchView(view) {
    currentView = view;
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    $("view-" + view).classList.add("active");
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    if (view === "stats") renderStats();
  }
  document.querySelectorAll(".nav-btn").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  }
  function confettiToast() {
    const msgs = ["أحسنت! 🎉", "استمر هكذا! 💪", "عمل رائع ✨", "خطوة أقرب لهدفك 🚀"];
    showToast(msgs[Math.floor(Math.random() * msgs.length)]);
  }

  // ---------- Notifications ----------
  async function registerSW() {
    if ("serviceWorker" in navigator) {
      try { await navigator.serviceWorker.register("sw.js"); } catch (e) { console.warn("SW failed", e); }
    }
  }

  function updateNotifyUI() {
    const supported = "Notification" in window;
    const perm = supported ? Notification.permission : "unsupported";
    const granted = perm === "granted";
    const denied = perm === "denied";
    $("notifyBtn").classList.toggle("active-state", granted);
    $("notifyBtn").textContent = denied ? "🔕" : "🔔";
    $("settingsNotifyBtn").textContent = granted ? "مفعّل ✓" : denied ? "محظور" : "تفعيل";
    $("settingsNotifyBtn").disabled = denied;
    $("notifyBlockedInfo").classList.toggle("hidden", !denied);
    $("notifyStatusText").textContent = granted
      ? "الإشعارات مفعّلة، ستصلك في وقتها"
      : denied
      ? "الإشعارات محظورة من المتصفح — راجع الخطوات أدناه"
      : "تفعيل إشعارات المتصفح لمهامك";
    settings.notifyEnabled = granted;
    saveSettings();
  }

  async function requestNotifyPermission() {
    if (!("Notification" in window)) {
      showToast("متصفحك لا يدعم الإشعارات");
      return;
    }
    if (Notification.permission === "denied") {
      showToast("الإذن محظور، فعّله يدوياً من إعدادات الموقع في المتصفح");
      updateNotifyUI();
      return;
    }
    const perm = await Notification.requestPermission();
    updateNotifyUI();
    if (perm === "granted") {
      showToast("تم تفعيل التنبيهات 🔔");
      new Notification("منظم يومي", { body: "سنذكّرك بمهامك في وقتها 🎯", icon: "icons/icon-192.png" });
    } else if (perm === "denied") {
      showToast("تم رفض الإذن، راجع خطوات التفعيل اليدوي بالأسفل");
    }
  }

  $("notifyBtn").addEventListener("click", requestNotifyPermission);
  $("settingsNotifyBtn").addEventListener("click", requestNotifyPermission);

  function fireNotification(task, prefix = "") {
    const c = catOf(task.category);
    const title = `${prefix}${c.icon} ${task.title}`;
    const body = task.notes || `حان وقت "${task.title}" الآن`;
    const granted = "Notification" in window && Notification.permission === "granted";

    if (granted) {
      const options = {
        body,
        icon: "icons/icon-192.png",
        badge: "icons/icon-192.png",
        tag: task.id + completionKey(task),
        vibrate: [120, 60, 120],
        dir: "rtl",
        lang: "ar",
      };
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, options));
      } else {
        new Notification(title, options);
      }
    }
    // Always show the in-app banner too — works even when OS permission is blocked.
    showAlertBanner(task, title, body);
    if (settings.sound) playBeep();
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  }

  let bannerTimer = null;
  let bannerTaskId = null;
  function showAlertBanner(task, title, body) {
    bannerTaskId = task.id;
    $("alertIcon").textContent = catOf(task.category).icon;
    $("alertTitle").textContent = title;
    $("alertSubtitle").textContent = body;
    alertBanner.classList.toggle("urgent", getTaskStatus(task) === "overdue");
    alertBanner.classList.add("show");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(hideAlertBanner, 15000);
  }
  function hideAlertBanner() {
    alertBanner.classList.remove("show");
    clearTimeout(bannerTimer);
  }
  $("alertCloseBtn").addEventListener("click", hideAlertBanner);
  $("alertDoneBtn").addEventListener("click", () => {
    if (bannerTaskId) toggleDone(bannerTaskId);
    hideAlertBanner();
  });

  let audioCtx = null;
  function playBeep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.15, audioCtx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.4);
      o.connect(g).connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + 0.42);
    } catch {}
  }

  function checkDueNotifications() {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    tasks.forEach((task) => {
      if (!task.remind || !task.time || !isDueToday(task)) return;
      if (isDoneToday(task)) return;
      const key = task.id + completionKey(task) + hhmm;
      if (task.time === hhmm && !wasNotified(key)) {
        fireNotification(task);
        markNotified(key);
      }
      if (settings.earlyReminder) {
        const [h, m] = task.time.split(":").map(Number);
        const early = new Date(now);
        early.setHours(h, m - 5, 0, 0);
        const earlyHHMM = `${String(early.getHours()).padStart(2, "0")}:${String(early.getMinutes()).padStart(2, "0")}`;
        const earlyKey = task.id + completionKey(task) + earlyHHMM + "early";
        if (earlyHHMM === hhmm && !wasNotified(earlyKey)) {
          fireNotification(task, "بعد 5 دقائق: ");
          markNotified(earlyKey);
        }
      }
    });
  }

  // ---------- Theme ----------
  function applyTheme(theme) {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    document.querySelectorAll("#themeSegmented .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.theme === theme));
  }
  document.querySelectorAll("#themeSegmented .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      settings.theme = btn.dataset.theme;
      saveSettings();
      applyTheme(settings.theme);
    });
  });

  // ---------- Settings wiring ----------
  $("soundToggle").addEventListener("change", (e) => { settings.sound = e.target.checked; saveSettings(); });
  $("earlyReminderToggle").addEventListener("change", (e) => { settings.earlyReminder = e.target.checked; saveSettings(); });
  $("weekStartSelect").addEventListener("change", (e) => { settings.weekStart = Number(e.target.value); saveSettings(); });

  $("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ tasks, settings }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-tasks-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("تم تصدير البيانات 📦");
  });

  $("importInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (Array.isArray(data.tasks)) {
          tasks = data.tasks.map((t) => ({ ...t, id: uid() }));
          saveTasks();
          renderAll();
          showToast("تم الاستيراد، جاري رفعها لقاعدة البيانات...");
          Promise.all(tasks.map((t) => insertTaskDB(t))).then((saved) => {
            tasks = saved.map((row, i) => (row ? rowToTask(row) : tasks[i]));
            saveTasks();
            renderAll();
            setSyncStatus(saved.every(Boolean) ? "online" : "offline");
          });
        }
        if (data.settings) {
          settings = { ...settings, ...data.settings };
          saveSettings();
          applySettingsToUI();
        }
      } catch {
        showToast("ملف غير صالح");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  $("resetBtn").addEventListener("click", () => {
    if (!confirm("هل أنت متأكد من حذف جميع المهام والبيانات؟ لا يمكن التراجع.")) return;
    tasks = [];
    saveTasks();
    localStorage.removeItem(NOTIFIED_KEY);
    renderAll();
    showToast("تم حذف كل البيانات");
    deleteAllTasksDB().then((ok) => setSyncStatus(ok ? "online" : "offline"));
  });

  function applySettingsToUI() {
    $("soundToggle").checked = settings.sound;
    $("earlyReminderToggle").checked = settings.earlyReminder;
    $("weekStartSelect").value = String(settings.weekStart);
    applyTheme(settings.theme || "system");
  }

  // ---------- Init ----------
  function init() {
    initSupabase();
    initGreeting();
    applySettingsToUI();
    renderCategoryPicker();
    renderDaysPicker();
    renderAll();
    updateNotifyUI();
    registerSW();
    loadAndSyncTasks();

    setInterval(() => {
      checkDueNotifications();
      initGreeting();
    }, 20000);
    checkDueNotifications();

    setInterval(renderToday, 60000);
  }

  // ---------- Lock screen ----------
  const LOCK_KEY = "lo_unlocked_v1";
  const APP_PASSWORD = "123123";

  function unlockApp() {
    lockScreen.classList.add("hidden");
    appRoot.classList.remove("hidden");
    init();
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (localStorage.getItem(LOCK_KEY) === "1") {
      unlockApp();
      return;
    }
    lockInput.focus();
    lockForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (lockInput.value === APP_PASSWORD) {
        localStorage.setItem(LOCK_KEY, "1");
        unlockApp();
      } else {
        lockError.classList.remove("hidden");
        const card = document.querySelector(".lock-card");
        card.classList.add("shake");
        lockInput.value = "";
        setTimeout(() => card.classList.remove("shake"), 400);
      }
    });
  });
})();
