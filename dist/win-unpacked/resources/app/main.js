const { app, BrowserWindow, dialog, autoUpdater } = require('electron');
const path = require('path');
const fs = require('fs');
const { shell } = require('electron');
const simpleGit = require('simple-git'); // إضافة مكتبة simple-git
const git = simpleGit();

let mainWindow;

// تابع لإنشاء نافذة التطبيق
function createWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    show: false, // نستخدم هذا الخيار لإخفاء النافذة حتى يتم تكبيرها
    icon: path.join(__dirname, 'img', 'الجوازات-السعودية-_1_.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  mainWindow.setMenu(null);

  mainWindow.loadFile('passport-d.html');

  // تكبير النافذة إلى حجم الشاشة تلقائيًا
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show(); // إظهار النافذة بعد تكبيرها
  });

  // جلب التحديثات من GitHub للمجلد 'dic'
  const dicPath = path.join(__dirname, 'dic');
  git.cwd(dicPath)
     .pull('origin', 'main', (err, update) => {
       if (err) {
         console.error('Error pulling updates:', err);
       } else if (update && update.summary.changes) {
         console.log('Repository updated successfully');
       } else {
         console.log('No changes detected');
       }
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

  // معالجة فتح الروابط في نافذة جديدة مع إضافة زر الطباعة
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const newWindow = new BrowserWindow({
      width: 800,
      height: 600,
      icon: path.join(__dirname, 'img', 'الجوازات-السعودية-_1_.ico'),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    newWindow.loadURL(url);

    // إضافة زر الطباعة بعد تحميل الصفحة
    newWindow.webContents.on('did-finish-load', () => {
      newWindow.webContents.executeJavaScript(`
        const printButton = document.createElement('button');
        printButton.textContent = 'طباعة';
        printButton.style.position = 'fixed';
        printButton.style.top = '10px';
        printButton.style.right = '10px';
        printButton.style.padding = '10px';
        printButton.style.backgroundColor = '#0eb917';
        printButton.style.color = '#fff';
        printButton.style.border = 'none';
        printButton.style.borderRadius = '5px';
        printButton.style.cursor = 'pointer';
        document.body.appendChild(printButton);

        printButton.addEventListener('click', () => {
          window.print();
        });
      `);
    });

    return { action: 'deny' }; // منع الفتح في المتصفح الافتراضي
  });

  // التحقق من وجود تحديثات عند فتح التطبيق
  autoUpdater.checkForUpdatesAndNotify();

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function openFile(filePath) {
  shell.openPath(filePath).then(response => {
    if (response) {
      console.error(`Error opening file: ${response}`);
    }
  });
}

autoUpdater.on('update-available', (info) => {
  dialog.showMessageBox({
    type: 'info',
    title: 'تحديث متاح',
    message: 'يوجد تحديث جديد، هل تريد تنزيله الآن؟',
    buttons: ['نعم', 'لا']
  }).then((result) => {
    if (result.response === 0) { // إذا ضغط المستخدم على "نعم"
      autoUpdater.downloadUpdate();
    }
  });
});

autoUpdater.on('update-downloaded', (info) => {
  dialog.showMessageBox({
    type: 'info',
    title: 'تحديث جاهز',
    message: 'تم تنزيل التحديث، سيتم إعادة تشغيل التطبيق لتطبيق التحديث.',
    buttons: ['إعادة التشغيل']
  }).then(() => {
    autoUpdater.quitAndInstall();
  });
});

autoUpdater.on('error', (error) => {
  console.error('Error in auto-updater:', error);
});

app.whenReady().then(createWindow);

// هذا الجزء للتأكد من أن التطبيق يقوم بفتح نافذة واحدة فقط
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// منع تشغيل عدة نسخ من التطبيق
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', function () {
    if (mainWindow === null) createWindow();
  });
}
