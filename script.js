// دالة لإظهار أو إخفاء الشريط الجانبي
function toggleSidebar() {
    var sidebar = document.getElementById("sidebar");
    var content = document.querySelector(".content");
    sidebar.classList.toggle("hidden");
    // إذا كانت هناك أي إجراءات أخرى عند إظهار أو إخفاء الشريط الجانبي، يمكن إضافتها هنا
}

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
    var headings = document.querySelectorAll(".description h3"); // البحث في عناوين h3 فقط
    var found = false;

    headings.forEach(function(heading) {
        heading.style.backgroundColor = ""; // إعادة اللون الطبيعي للنص

        if (heading.textContent.toLowerCase().includes(searchTerm)) {
            if (!found) {
                heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
                found = true;
            }
            heading.style.backgroundColor = "#003366"; // لون الهاي لايت أزرق غامق
            setTimeout(function() {
                heading.style.backgroundColor = ""; // إعادة اللون الطبيعي بعد 7 ثوانٍ
                document.getElementById("search-input").value = ""; // مسح سجل البحث بعد 7 ثواني
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















  








