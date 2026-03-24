const SUPABASE_URL = "https://dkrtiuelioyshbjoocqm.supabase.co";
const SUPABASE_KEY = "sb_publishable_ts5SGrWhODsG6EH5dUt9Wg_KUvsf-CF";

// ======================= إرسال الاقتراح =======================
async function sendFeedbackToSupabase() {
    const type = document.getElementById("feedback-type").value;
    const message = document.getElementById("feedback-message").value.trim();
    const statusMsg = document.getElementById("feedback-status-msg");
    const submitBtn = document.getElementById("submit-feedback-btn");

    if (!message) {
        statusMsg.style.display = "block";
        statusMsg.style.color = "#d32f2f"; 
        statusMsg.textContent = "❗ يرجى كتابة التفاصيل قبل الإرسال.";
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
    statusMsg.style.display = "none";

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/feedbacks`, {
            method: "POST",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "return=minimal" 
            },
            body: JSON.stringify({
                type: type,
                message: message
            })
        });

        if (response.ok) {
            statusMsg.style.display = "block";
            statusMsg.style.color = "#198754"; 
            statusMsg.innerHTML = "✅ تم الإرسال بنجاح، سيتم إضافتها للنظام قريباً. شكراً لك!";
            document.getElementById("feedback-message").value = ""; 
        } else {
            const errorText = await response.text();
            let errorMessage = `حدث خطأ غير معروف (الكود: ${response.status})`;
            try {
                if (errorText) {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.message || errorJson.details || errorMessage;
                }
            } catch (e) {
                console.error("تعذر قراءة الخطأ:", errorText);
            }
            throw new Error(errorMessage);
        }
    } catch (error) {
        statusMsg.style.display = "block";
        statusMsg.style.color = "#d32f2f";
        statusMsg.textContent = "❌ حدث خطأ: " + error.message;
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال الاقتراح';
        setTimeout(() => { statusMsg.style.display = "none"; }, 6000);
    }
}

// ======================= عرض الاقتراحات =======================
function showFeedbacksPrompt() {
    // التحقق من وجود الإذن المسبق في التخزين
    const hasAccess = localStorage.getItem("adminSuggestionsAccess");
    
    if (hasAccess === "granted") {
        fetchAndDisplayFeedbacks();
    } else {
        const pass = prompt("الرجاء إدخال رمز المرور لعرض الاقتراحات:");
        if (pass === "123123") {
            // حفظ الدخول في المتصفح لكي لا يطلب الرمز مرة أخرى
            localStorage.setItem("adminSuggestionsAccess", "granted");
            fetchAndDisplayFeedbacks();
        } else if (pass !== null) {
            alert("رمز المرور غير صحيح!");
        }
    }
}

async function fetchAndDisplayFeedbacks() {
    const modal = document.getElementById("feedbacks-modal");
    const list = document.getElementById("feedbacks-list");
    
    modal.style.display = "flex";
    list.innerHTML = '<p style="text-align:center; margin-top: 20px;"><i class="fas fa-spinner fa-spin" style="font-size:2rem; color:var(--primary)"></i><br><br>جاري جلب الاقتراحات...</p>';

    try {
        // ترتيب تصاعدي (الأحدث أولاً)
        const response = await fetch(`${SUPABASE_URL}/rest/v1/feedbacks?select=*&order=created_at.desc`, {
            method: "GET",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) throw new Error("تعذر جلب البيانات من القاعدة");

        const data = await response.json();

        if (data.length === 0) {
            list.innerHTML = '<p style="text-align:center; color:#777; margin-top:20px;">لا توجد اقتراحات حالياً.</p>';
            return;
        }

        list.innerHTML = ""; // تفريغ القائمة
        
        data.forEach(item => {
            // تنسيق التاريخ والوقت
            const dateObj = new Date(item.created_at || new Date());
            const dateStr = dateObj.toLocaleDateString("ar-SA") + " - " + dateObj.toLocaleTimeString("ar-SA", {hour: '2-digit', minute:'2-digit'});

            const card = document.createElement("div");
            card.className = "feedback-card";
            card.innerHTML = `
                <div class="feedback-date"><i class="fas fa-clock"></i> ${dateStr}</div>
                <div class="feedback-text">${item.message}</div>
            `;
            list.appendChild(card);
        });

    } catch (error) {
        list.innerHTML = `<p style="text-align:center; color:red; margin-top:20px;">❌ حدث خطأ: ${error.message}</p>`;
    }
}

function closeFeedbacksModal() {
    document.getElementById("feedbacks-modal").style.display = "none";
}

// ======================= الواجهة وحركة الصندوق =======================
function toggleSuggestionBox() {
    const body = document.getElementById('suggestion-body');
    const icon = document.getElementById('suggestion-icon');
    const header = document.querySelector('.suggestion-header-btn');
    if (body) body.classList.toggle('open');
    if (icon) icon.classList.toggle('rotate');
    if (header) header.classList.toggle('active');
}

// ======================= الوضع الداكن (مبني على الوقت) =======================
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;

    const DARK_CLASS = "theme-dark";
    const OVERRIDE_KEY = "theme_manual_choice"; 
    const PHASE_KEY = "theme_time_phase"; 

    function applyTheme(makeDark) {
        if (makeDark) {
            document.body.classList.add(DARK_CLASS);
            btn.innerHTML = '<i class="fas fa-sun"></i><span class="theme-toggle-text">الوضع الفاتح</span>';
        } else {
            document.body.classList.remove(DARK_CLASS);
            btn.innerHTML = '<i class="fas fa-moon"></i><span class="theme-toggle-text">الوضع الداكن</span>';
        }
    }

    function checkAndApplyTime() {
        const hour = new Date().getHours();
        const isNight = (hour >= 19 || hour < 6);
        const currentPhase = isNight ? "night" : "day";
        const savedPhase = localStorage.getItem(PHASE_KEY);

        if (savedPhase !== null && savedPhase !== currentPhase) {
            localStorage.removeItem(OVERRIDE_KEY);
            localStorage.setItem(PHASE_KEY, currentPhase);
        } else if (savedPhase === null) {
            localStorage.setItem(PHASE_KEY, currentPhase);
        }

        const userChoice = localStorage.getItem(OVERRIDE_KEY);
        if (userChoice !== null) {
            applyTheme(userChoice === "dark");
        } else {
            applyTheme(isNight);
        }
    }

    checkAndApplyTime();
    setInterval(checkAndApplyTime, 60000);

    btn.addEventListener("click", (e) => {
        e.preventDefault(); 
        const isCurrentlyDark = document.body.classList.contains(DARK_CLASS);
        const newState = !isCurrentlyDark; 
        applyTheme(newState);
        localStorage.setItem(OVERRIDE_KEY, newState ? "dark" : "light");
        const hour = new Date().getHours();
        const currentPhase = (hour >= 19 || hour < 6) ? "night" : "day";
        localStorage.setItem(PHASE_KEY, currentPhase);
    });
});