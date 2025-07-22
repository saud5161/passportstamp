const { app, BrowserWindow, globalShortcut, Menu, ipcMain } = require('electron');

const path = require('path');
const https = require('https');
const fs = require('fs');
const { exec } = require('child_process');
const simpleGit = require('simple-git');
const git = simpleGit();
const iconv = require('iconv-lite');
let mainWindow;
const MAX_FILES = 5; // الحد الأقصى لعدد النسخ المسموح بها (بما في ذلك النسخة الأصلية)
let currentIndex = 0; // نبدأ من النسخة 1

// مسار ملف package.json
const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

// رابط التحقق من أحدث إصدار في GitHub
const githubApiUrl = 'https://api.github.com/repos/saud5161/Special-document/releases/latest';




ipcMain.on('save-shift', (event, value) => {
  const filePath = path.join(__dirname, 'shift.txt');
  fs.writeFileSync(filePath, value, 'utf-8');
});



// دالة لإنشاء نافذة التطبيق
function createWindow() {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        return;
    }

    mainWindow = new BrowserWindow({
        show: false,
        icon: path.join(__dirname, 'img', 'الجوازات-السعودية-_1_.ico'),
       webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false
}

    });

    // شريط القوائم
    const menu = Menu.buildFromTemplate([
        {
            label: 'ملف',
            submenu: [
                {
                    label: 'طباعة',
                    click: () => {
                        const focusedWindow = BrowserWindow.getFocusedWindow();
                        if (focusedWindow) {
                            focusedWindow.webContents.print();
                        }
                    }
                },
                { type: 'separator' },
                { label: 'خروج', role: 'quit' }
            ]
        },
        {
            label: 'تعديل',
            submenu: [
                { label: 'تراجع', role: 'undo' },
                { label: 'إعادة', role: 'redo' },
                { type: 'separator' },
                { label: 'قص', role: 'cut' },
                { label: 'نسخ', role: 'copy' },
                { label: 'لصق', role: 'paste' }
            ]
        },
        {
            label: 'عرض',
            submenu: [
                { label: 'تحديث', role: 'reload' },
                { label: 'وضع المطور', role: 'toggleDevTools' },
                { type: 'separator' },
                { label: 'تكبير', role: 'zoomIn' },
                { label: 'تصغير', role: 'zoomOut' },
                { label: 'إعادة ضبط التكبير', role: 'resetZoom' }
            ]
        },
        {
            label: 'نافذة',
            submenu: [
                { label: 'تصغير', role: 'minimize' },
                { label: 'إغلاق', role: 'close' }
            ]
        },
        {
            label: 'مساعدة',
            submenu: [
                { label: 'عن التطبيق', click: () => console.log('عن التطبيق') }
            ]
        }
    ]);
    Menu.setApplicationMenu(menu);
    mainWindow.setMenu(menu);
    mainWindow.loadFile('passport-d.html');
    
    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
        checkForUpdates(); // التحقق من التحديثات عند تشغيل التطبيق
    });

    // معالجة التنزيل التلقائي
    mainWindow.webContents.session.on('will-download', (event, item) => {
        const filePath = path.join(app.getPath('downloads'), item.getFilename());
        item.setSavePath(filePath);
    
        item.on('done', (e, state) => {
            if (state === 'completed') {
                openFile(filePath);
              
            } else {
                console.log(`Download failed: ${state}`);
            }
        });
    });
    

    // معالجة قائمة السياق للطباعة
    mainWindow.webContents.on('context-menu', (event, params) => {
        const menu = Menu.buildFromTemplate([
            {
                label: 'Print',
                click: () => {
                    const focusedWindow = BrowserWindow.getFocusedWindow();
                    if (focusedWindow) {
                        focusedWindow.webContents.print();
                    }
                }
            }
        ]);
        menu.popup();
    });

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

// دالة للتحقق من وجود تحديثات جديدة
function checkForUpdates() {
    https.get(githubApiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            const releaseData = JSON.parse(data);
            const latestVersion = releaseData.tag_name.replace('v', '');
            
            // وصف التحديث (Release Notes)
            const releaseNotes = releaseData.body || '';

            if (compareVersions(latestVersion, currentVersion)) {
                console.log(`يوجد إصدار جديد متاح: ${latestVersion}`);
                const assetUrl = (releaseData.assets && releaseData.assets.length > 0)
                    ? releaseData.assets[0].browser_download_url
                    : null;
                
                if (assetUrl) {
                    // عرض التحديث على جميع النوافذ
                    BrowserWindow.getAllWindows().forEach(window => {
                        showUpdateBanner(latestVersion, assetUrl, window);
                        showUpdateModal(latestVersion, assetUrl, releaseNotes, window);
                    });
                }
            } else {
                console.log('أنت تستخدم أحدث إصدار.');
            }
        });
    }).on('error', (err) => {
        console.error('حدث خطأ أثناء التحقق من التحديث:', err);
    });
}

// دالة للمقارنة بين الإصدارين
function compareVersions(latest, current) {
    const latestParts = latest.split('.').map(Number);
    const currentParts = current.split('.').map(Number);

    for (let i = 0; i < latestParts.length; i++) {
        if (latestParts[i] > currentParts[i]) {
            return true;
        } else if (latestParts[i] < currentParts[i]) {
            return false;
        }
    }
    return false;
}

// دالة لعرض نافذة التحديث
function showUpdateBanner(latestVersion, downloadUrl, window) {
    window.webContents.executeJavaScript(`
        let existingMessage = document.getElementById("update-message");
        if (!existingMessage) {
            const messageContainer = document.createElement("div");
            messageContainer.id = "update-message"; 
            messageContainer.style.backgroundColor = "#ff4d4d";
            messageContainer.style.color = "#ffffff";
            messageContainer.style.padding = "10px";
            messageContainer.style.textAlign = "center";
            messageContainer.style.position = "fixed";
            messageContainer.style.bottom = "0";
            messageContainer.style.width = "100%";
            messageContainer.style.zIndex = "1000";
            messageContainer.style.display = "flex";
            messageContainer.style.alignItems = "center";
            messageContainer.style.justifyContent = "center";
            messageContainer.style.gap = "10px";

            const icon = document.createElement("i");
            icon.className = "fas fa-exclamation-circle";
            icon.style.fontSize = "20px";

            const text = document.createElement("span");
            text.textContent = "يوجد تحديث جديد: الإصدار ${latestVersion} - ";

            const link = document.createElement("a");
            link.href = "${downloadUrl}";
            link.textContent = "لتحميل التحديث اضغط هنا";
            link.style.color = "#ffffff";
            link.style.fontWeight = "bold";
            link.style.textDecoration = "underline";
            link.setAttribute("download", "");

            messageContainer.appendChild(icon);
            messageContainer.appendChild(text);
            messageContainer.appendChild(link);

            document.body.appendChild(messageContainer);
        }
    `);
}

// دالة لعرض نافذة منبثقة للتحديث
function showUpdateModal(latestVersion, downloadUrl, releaseNotes, window) {
    window.webContents.executeJavaScript(`
        let existingModal = document.getElementById("update-modal");
        if (!existingModal) {
            const modalContainer = document.createElement("div");
            modalContainer.id = "update-modal";
            modalContainer.style.position = "fixed";
            modalContainer.style.top = "0";
            modalContainer.style.left = "0";
            modalContainer.style.width = "100%";
            modalContainer.style.height = "100%";
            modalContainer.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
            modalContainer.style.display = "flex";
            modalContainer.style.alignItems = "center";
            modalContainer.style.justifyContent = "center";
            modalContainer.style.zIndex = "10000";

            const modalBox = document.createElement("div");
            modalBox.style.position = "relative";
            modalBox.style.backgroundColor = "#ffffff";
            modalBox.style.borderRadius = "10px";
            modalBox.style.padding = "20px";
            modalBox.style.width = "90%";
            modalBox.style.maxWidth = "400px";
            modalBox.style.textAlign = "center";
            modalBox.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.1)";

            const closeButton = document.createElement("button");
            closeButton.textContent = "×";
            closeButton.style.position = "absolute";
            closeButton.style.top = "10px";
            closeButton.style.right = "10px";
            closeButton.style.backgroundColor = "transparent";
            closeButton.style.border = "none";
            closeButton.style.color = "#333";
            closeButton.style.fontSize = "18px";
            closeButton.style.cursor = "pointer";
            closeButton.addEventListener("click", function() {
                modalContainer.remove();
            });

            const title = document.createElement("h2");
            title.textContent = "تحديث جديد متاح";
            title.style.color = "#3d775f";
            title.style.marginBottom = "15px";

            const message = document.createElement("p");
            message.textContent = "يوجد إصدار جديد: الإصدار ${latestVersion}. يتوفر في التحديث: ${releaseNotes}";
            message.style.marginBottom = "20px";
            message.style.color = "#333";
            message.style.fontSize = "16px";
            message.style.fontWeight = "normal";
            message.style.borderRadius = "5px";
            message.style.backgroundColor = "#f0f8ff";
            message.style.padding = "10px";

            const countdownText = document.createElement("p");
            countdownText.id = "countdown-text";
            countdownText.textContent = "سيتم تنزيل التحديث في: 7 ثوانٍ";
            countdownText.style.color = "#333";
            countdownText.style.marginTop = "20px";

            const updateLaterButton = document.createElement("button");
            updateLaterButton.textContent = "تحديث لاحقاً";
            updateLaterButton.style.backgroundColor = "#ff6347";
            updateLaterButton.style.color = "#ffffff";
            updateLaterButton.style.border = "none";
            updateLaterButton.style.padding = "10px 20px";
            updateLaterButton.style.margin = "5px";
            updateLaterButton.style.borderRadius = "5px";
            updateLaterButton.style.cursor = "pointer";
            updateLaterButton.addEventListener("click", function() {
                clearInterval(countdownInterval);
                modalContainer.remove();
                console.log("التحديث تم تأجيله");
            });

            const pauseButton = document.createElement("button");
            pauseButton.textContent = "إيقاف مؤقت";
            pauseButton.style.backgroundColor = "#808080";
            pauseButton.style.color = "#ffffff";
            pauseButton.style.border = "none";
            pauseButton.style.padding = "10px 20px";
            pauseButton.style.margin = "5px";
            pauseButton.style.borderRadius = "5px";
            pauseButton.style.cursor = "pointer";
            let countdownPaused = false;
            pauseButton.addEventListener("click", function() {
                if (countdownPaused) {
                    countdownPaused = false;
                    pauseButton.textContent = "إيقاف مؤقت";
                    countdownInterval = setInterval(countdownFunction, 1000);
                } else {
                    countdownPaused = true;
                    pauseButton.textContent = "استئناف";
                    clearInterval(countdownInterval);
                }
            });

            let countdown = 7;
            let countdownInterval;
            const countdownFunction = () => {
                countdownText.textContent = "سيتم تنزيل التحديث في: " + countdown + " ثوانٍ";
                countdown--;
                if (countdown < 0) {
                    clearInterval(countdownInterval);
                    // التعديل هنا: جعل النص الأول باللون الأزرق وكلمة "يرجى غلق التطبيق" باللون الأحمر
                    countdownText.innerHTML = '<span style="color: blue;">سيتم تنزيل التحديث الآن... </span><span style="color: red;">يرجى غلق التطبيق عند البدء في التثبيت</span>';

                    // تحميل التحديث بعد انتهاء العد التنازلي
                    setTimeout(() => {
                        window.location.href = "${downloadUrl}";
                        closeAppAfterDownload();
                    }, 1000);
                }
            };
            countdownInterval = setInterval(countdownFunction, 1000);

            modalBox.appendChild(closeButton);
            modalBox.appendChild(title);
            modalBox.appendChild(message);
            modalBox.appendChild(countdownText);
            modalBox.appendChild(pauseButton);
            modalBox.appendChild(updateLaterButton);
            modalContainer.appendChild(modalBox);

            document.body.appendChild(modalContainer);
        }
    `);
}



// دالة لفتح ملفات متعددة
function openMultipleFiles() {
    const downloadsDir = app.getPath('downloads');
    for (let i = 1; i <= MAX_FILES; i++) {
        const filePath = path.join(downloadsDir, `document${i}.txt`);
        exec(`start "" "${filePath}"`, (error, stdout, stderr) => {
            if (error) {
                console.error(`خطأ في فتح الملف: ${error.message}`);
                return;
            }
            console.log(`تم فتح الملف بنجاح: ${filePath}`);
        });
    }
}

// دالة لفتح الملفات عند التنزيل
function openFile(filePath) {
    const downloadsDir = app.getPath('downloads');
    const fileName = path.basename(filePath);
    
    // التحقق إذا كان الملف هو ملف التحديث
    if (fileName.includes('Setup')) {
        // إذا كان الملف هو ملف التحديث، لا نضيف التكرار عليه
        exec(`start "" "${filePath}"`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error opening file: ${error.message}`);
                return;
            }
            console.log(`File opened successfully: ${stdout}`);
        });
    } else {
        // إذا لم يكن ملف التحديث، نضيف التكرار
        const newFileName = getNextFileName(downloadsDir, fileName);
        const newFilePath = path.join(downloadsDir, newFileName);

        fs.copyFile(filePath, newFilePath, (err) => {
            if (err) {
                console.error(`Error copying file: ${err.message}`);
                return;
            }
            exec(`start "" "${newFilePath}"`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error opening file: ${error.message}`);
                    return;
                }
                console.log(`File opened successfully: ${stdout}`);
            });
        });
    }
}


// دالة لتوليد أسماء جديدة للملفات
function getNextFileName(dir, fileName) {
    const fileExt = path.extname(fileName);
    const baseName = path.basename(fileName, fileExt);
    const newFileName = `${baseName}(${currentIndex})${fileExt}`;
    currentIndex = (currentIndex % MAX_FILES) + 1;
    return newFileName;
}

// تسجيل اختصار Ctrl+P عند تركيز التطبيق فقط
app.on('browser-window-focus', () => {
    globalShortcut.register('Control+P', () => {
        const focusedWindow = BrowserWindow.getFocusedWindow();
        if (focusedWindow) {
            focusedWindow.webContents.print();
        }
    });
});

// إلغاء تسجيل الاختصار عند فقدان التركيز
app.on('browser-window-blur', () => {
    globalShortcut.unregister('Control+P');
});

// لما يكون التطبيق جاهز ننشئ النافذة
app.whenReady().then(() => {
    createWindow();
    startUpdateCheckInterval(); // بدء التحقق من التحديثات كل دقيقتين
});

// تنظيف الاختصارات عند الخروج
app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

// منع تشغيل عدة نسخ من التطبيق
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    // إغلاق التطبيق لما تنقفل كل النوافذ (ماعدا في نظام macOS)
    
    app.on('window-all-closed', function () {
        if (process.platform !== 'darwin') app.quit();
    });

    app.on('activate', function () {
        if (mainWindow === null) createWindow();
    });
}
app.whenReady().then(createWindow);

ipcMain.on('save-shift', (event, data) => {
  const filePath = path.join(app.getPath('downloads'), 'shift.txt');

  // تحويل النص إلى ترميز windows-1256
  const encodedData = iconv.encode(data, 'windows-1256');

  fs.writeFileSync(filePath, encodedData);
});
function clearShiftIfMatchedTime() {
  const targetTimes = ['05:30', '13:30', '21:30'];
  let lastCleared = null;

  setInterval(() => {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"

    if (targetTimes.includes(currentTime) && lastCleared !== currentTime) {
      const filePath = path.join(app.getPath('downloads'), 'shift.txt');

      fs.writeFile(filePath, '', (err) => {
        if (err) {
          console.error('❌ خطأ أثناء تفريغ shift.txt:', err);
        } else {
          console.log(`✔ تم تفريغ shift.txt في ${currentTime}`);
          lastCleared = currentTime;
        }
      });
    }
  }, 1000 * 60); // تحقق كل دقيقة
}

// استدعاء الوظيفة عند بدء التشغيل
clearShiftIfMatchedTime();