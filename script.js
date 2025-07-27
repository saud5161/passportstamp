 const correctPassword = "123123";

  // تحقق من وجود إذن مسبق
  window.addEventListener("DOMContentLoaded", () => {
    if (localStorage.getItem("departureAccess") === "granted") {
      document.getElementById("password-container").style.display = "none";
    }
  });

  function checkPassword() {
    const password = document.getElementById("page-password").value;
    const errorMsg = document.getElementById("error-msg");

    if (password === correctPassword) {
      localStorage.setItem("departureAccess", "granted");
      document.getElementById("password-container").style.display = "none";
    } else {
      errorMsg.textContent = "الرقم السري غير صحيح، في حال عدم توفر الرقم السري التواصل معي";
      errorMsg.style.display = "block";
      document.getElementById("page-password").value = ""; // تفريغ الحقل
    }
  }

  function redirectToExit() {
    window.location.href = "passport-d.html";
  }
// دالة لإظهار أو إخفاء الشريط الجانبي
function toggleSidebar() {
    var sidebar = document.getElementById("sidebar");
    var content = document.querySelector(".content");
    sidebar.classList.toggle("hidden");
    // إذا كانت هناك أي إجراءات أخرى عند إظهار أو إخفاء الشريط الجانبي، يمكن إضافتها هنا
}
window.addEventListener("load", function () {
    document.querySelectorAll('.quick-links a').forEach(link => {
        link.addEventListener('click', function(event) {
            event.preventDefault();

            const text = this.textContent.trim();
            const searchInput = document.getElementById("search-input");
            searchInput.value = text;

            performSearch();
        });
    });
});
document.addEventListener("DOMContentLoaded", () => {
  const name = document.getElementById("officer-name");
  const rank = document.getElementById("officer-rank");
  const shift = document.getElementById("shift-number");
  const hall = document.getElementById("hall-number");
  const button = document.getElementById("send-officer-info");
autoFillOfficerDetails();

  if (!button) {
    console.error("❌ الزر لم يتم العثور عليه!");
    return;
  }

  button.addEventListener("click", () => {
    console.log("📥 تم الضغط على زر الإرسال");

    if (!name.value || !rank.value || !shift.value || !hall.value) {
      alert("❗ يرجى تعبئة جميع الحقول");
      return;
    }

    const fullData = `ComboBox1=${shift.value}\nComboBox2=${hall.value}\nComboBox5=${rank.value}\nComboBox6=${name.value}`;

    if (window.electronAPI && window.electronAPI.saveShift) {
      window.electronAPI.saveShift(fullData);
      alert("✅ تم الحفظ بنجاح وادراج المعلومات في كل الخطابات");
    } else {
      console.error("⚠️ لم يتم تحميل electronAPI");
      alert("⚠️ فشل الاتصال بـ Electron لحفظ البيانات.");
    }
  });
});
// دالة لتعيين العنصر النشط في الشريط الجانبي
function setActive(element) {
    var items = document.querySelectorAll(".sidebar li");
    items.forEach(function(item) {
        item.classList.remove("active");
    });
    element.classList.add("active");
}

// دالة لفتح ملف PDF في نافذة جديدة
function openPDF(event) {
    event.preventDefault();
    var url = event.target.closest("a").href;
    var pdfWindow = window.open(url, '_blank');
    pdfWindow.focus();
}

// دالة لتغيير رابط ملف العرض عند اختيار ملف جديد
function changeFile(event, viewLinkId) {
    var fileInput = event.target;
    var file = fileInput.files[0];
    if (file) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var viewLink = document.getElementById(viewLinkId);
            viewLink.href = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}
//تفريغ الخانات
document.addEventListener('DOMContentLoaded', () => {
  const clearBtn = document.getElementById('clear-officer-info');
  const form = document.querySelector('.shift-form');

  if (clearBtn && form) {
    clearBtn.addEventListener('click', () => {
      form.querySelectorAll('input').forEach(input => {
        input.value = '';
      });
    });
  }

  clearShiftFormAtSpecificTimes(); // ← يستمر عمل التفريغ التلقائي أيضًا
});

// دالة لإعداد التاريخ الحالي وعرضه في العنصر الذي يحتوي على المعرف "date"
document.addEventListener("DOMContentLoaded", function() {
    var today = new Date();
    var options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    var formattedDate = today.toLocaleDateString('ar-SA', options);
    document.getElementById("date").textContent = formattedDate;
});

// دالة لتفعيل حقل إدخال الملف عند النقر على الزر
function toggleFileInput(button) {
    var fileInput = button.nextElementSibling;
    fileInput.click();
}
document.addEventListener("DOMContentLoaded", function() {
    var unavailableButtons = document.querySelectorAll(".unavailable");

    unavailableButtons.forEach(function(button) {
        button.addEventListener("click", function(event) {
            event.preventDefault();
            alert("سوف يتم توفيره قريباً");
        });
    });
 });


document.getElementById("print-button").addEventListener("click", function() {
    window.print();
});   
let slideIndex = 0;
const slides = document.querySelectorAll('.slide');
const totalSlides = slides.length;

function showSlide(index) {
    if (index >= totalSlides) {
        slideIndex = 0;
    } else if (index < 0) {
        slideIndex = totalSlides - 1;
    } else {
        slideIndex = index;
    }
    const offset = -slideIndex * 100;
    document.querySelector('.slider').style.transform = `translateX(${offset}%)`;
}

function moveSlide(direction) {
    showSlide(slideIndex + direction);
}

document.addEventListener("DOMContentLoaded", function() {
    showSlide(slideIndex);

    // تعيين الحركة التلقائية كل 20 ثانية
    setInterval(() => {
        moveSlide(1);
    }, 20000);
});
document.getElementById("search-button").addEventListener("click", performSearch);

document.getElementById("search-input").addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
        performSearch();
    }
});

function performSearch() {
    var searchTerm = document.getElementById("search-input").value.toLowerCase();
    // نبحث الآن في عناوين H3 داخل card-content
    var headings = document.querySelectorAll(".card-content h3");
    var found = false;

    headings.forEach(function(heading) {
        heading.style.backgroundColor = ""; // إعادة اللون الافتراضي

        if (heading.textContent.toLowerCase().includes(searchTerm)) {
            if (!found) {
                heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
                found = true;
            }
            heading.style.backgroundColor = "#badf19ff";
            setTimeout(function() {
                heading.style.backgroundColor = "";
                document.getElementById("search-input").value = "";
            }, 7000);
        }
    });
}

function fetchLatestRelease() {
    const notificationContent = document.getElementById('notification-content');

    // إذا كان المربع مرئيًا، قم بإخفائه
    if (notificationContent.style.display === 'block') {
        notificationContent.style.display = 'none';
    } else {
        // إذا كان المربع مخفيًا، قم بجلب آخر إصدار من GitHub
        fetch('https://api.github.com/repos/saud5161/Special-document/releases/latest')
        .then(response => response.json())
        .then(data => {
            // تحديث النص بمحتوى آخر إصدار
            document.getElementById('latest-release-text').textContent = data.body || 'لا يوجد إصدار جديد.';
            
            // إظهار مربع النص
            notificationContent.style.display = 'block';

            // إغلاق المربع تلقائيًا بعد 20 ثانية (20000 مللي ثانية)
            setTimeout(() => {
                notificationContent.style.display = 'none';
            }, 20000); // 20 ثانية
        })
        .catch(error => {
            document.getElementById('latest-release-text').textContent = 'حدث خطأ في جلب البيانات.';
        });
    }
}
function toggleHeadsetNotification(event) {
    event.preventDefault(); // لمنع السلوك الافتراضي للرابط
    const headsetNotificationContent = document.getElementById('headset-notification-content');

    // إذا كان المربع مرئيًا، قم بإخفائه
    if (headsetNotificationContent.style.display === 'block') {
        headsetNotificationContent.style.display = 'none';
    } else {
        // إظهار مربع النص
        headsetNotificationContent.style.display = 'block';

        // إغلاق المربع تلقائيًا بعد 20 ثانية
        setTimeout(() => {
            headsetNotificationContent.style.display = 'none';
        }, 20000); // 20 ثانية
    }
}
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');


function openFolder() {
    // تحديد مسار المجلد داخل مجلد التطبيق
    const folderPath = path.join(__dirname, 'dic', 'font');

    // فتح المجلد باستخدام مستكشف الملفات
    exec(`start "" "${folderPath}"`, (error) => {
        if (error) {
            console.error(`Error opening folder: ${error.message}`);
        } else {
            console.log('Folder opened successfully');
        }
    });
}
// دالة الطباعة
function printFile(filePath) {
    var iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.src = filePath;
    document.body.appendChild(iframe);

    iframe.onload = function() {
        iframe.contentWindow.print();
    };
}

function toggleInstructions() {
  var content = document.getElementById("instruction-content");
  var icon = document.getElementById("arrow-icon").firstElementChild;

  if (content.style.display === "none") {
    content.style.display = "block";
    icon.classList.remove("fa-chevron-down");
    icon.classList.add("fa-chevron-up");
  } else {
    content.style.display = "none";
    icon.classList.remove("fa-chevron-up");
    icon.classList.add("fa-chevron-down");
  }
}

// ======================== تحديث الملفات ===========================
// رابط المستودع الأساسي على GitHub
const repoBase = "https://raw.githubusercontent.com/saud5161/Special-document/main/";
const filesJsonUrl = repoBase + "files.json";

// ملف الكاش المحلي (للتوافق فقط — لم نعد نستخدمه فعليًا)
const localFilesJsonPath = path.join(__dirname, "files_local_cache.json");

// التحديث الكامل لجميع الملفات عند النقر
async function updateDocuments() {
    if (!navigator.onLine) {
        showMessage("⚠️ لا يوجد اتصال بالإنترنت", true);
        return;
    }

    showMessage("🔄 جاري التحديث...");

    try {
        // تحميل قائمة الملفات
        const res = await fetch(filesJsonUrl);
        if (!res.ok) throw new Error(`تعذر تحميل files.json: الحالة ${res.status}`);

        const remoteFiles = await res.json();
        const filePaths = Object.keys(remoteFiles);

        for (let filePath of filePaths) {
            const fileName = path.basename(filePath);

            // تجاهل ملفات النظام
            if (fileName.startsWith('~$') || fileName.toLowerCase() === 'desktop.ini') {
                console.log(`⏭️ تم تجاهل الملف: ${filePath}`);
                continue;
            }

            const localPath = path.join(__dirname, filePath);
            await downloadAndReplaceFile(repoBase + encodeURIComponent(filePath), localPath);
        }

        // حفظ نسخة الكاش الجديدة
        fs.writeFileSync(localFilesJsonPath, JSON.stringify(remoteFiles, null, 2));

        showMessage(`✅ تم تحديث ${filePaths.length} ملف${filePaths.length > 1 ? 'ات' : ''}`);
    } catch (error) {
        console.error("❌ خطأ أثناء التحديث:", error);
        showMessage("❌ حدث خطأ أثناء التحديث، الرجاء المحاولة لاحقًا", true);
    }
}

// تحميل ملف وتخزينه
async function downloadAndReplaceFile(fileUrl, localPath) {
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`تعذر تحميل الملف: ${fileUrl}`);

    const buffer = await res.arrayBuffer();
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, Buffer.from(buffer));
}

// عرض الرسائل على الواجهة
function showMessage(message, isError = false) {
    const el = document.getElementById("messageBox");
    if (el) {
        el.textContent = message;
        el.style.color = isError ? "red" : "blue";
    } else {
        console.log(message);
    }
}




async function downloadAndReplaceFile(fileUrl, localPath) {
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`تعذر تحميل الملف: ${fileUrl}`);

    const buffer = await res.arrayBuffer();
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, Buffer.from(buffer));
}

function showMessage(message, isError = false) {
    const el = document.getElementById("messageBox");
    if (el) {
        el.textContent = message;
        el.style.color = isError ? "red" : "blue";
    } else {
        console.log(message);
    }
}

setInterval(() => {
    updateDocuments(true);
}, 24 * 60 * 60 * 1000); // ← كل 24 ساعة = 86,400,000 مللي ثانية


document.addEventListener("DOMContentLoaded", () => {
    updateDocuments();
});
//معطيات الرتبة
function autoFillOfficerDetails() {
  const officerMap = {
    "ماجد عبدالعزيز السحيم": {
      rank: "نقيب",
      shift: "ج",
      hall: "4"
    },
    "فيصل عبدالإله الهرف": {
      rank: "ملازم أول",
      shift: "أ",
      hall: "4"
    }
  };

  const officerInput = document.getElementById('officer-name');
  const rankInput = document.getElementById('officer-rank');
  const shiftInput = document.getElementById('shift-number');
  const hallInput = document.getElementById('hall-number');

  if (officerInput) {
    officerInput.addEventListener('change', () => {
      const selectedName = officerInput.value.trim();
      const data = officerMap[selectedName];

      if (data) {
        rankInput.value = data.rank;
        shiftInput.value = data.shift;
        hallInput.value = data.hall;
      } else {
        // إذا لم يكن الاسم موجودًا، فرّغ الحقول
        rankInput.value = '';
        shiftInput.value = '';
        hallInput.value = '';
      }
    });
  }
}






