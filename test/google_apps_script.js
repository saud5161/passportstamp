/**
 * ================== الإعدادات ==================
 * عدّل فقط هذا الجزء عند الحاجة - لا يوجد شيء آخر تحتاج تعديله.
 */
const CONFIG = {
  // بحث Gmail: بما أن هذا الإيميل مخصص فقط لاستقبال المنفست/الترانزيت،
  // لا حاجة لأي كلمات بحث في العنوان - فقط "أي رسالة فيها مرفق PDF".
  GMAIL_SEARCH_QUERY: 'has:attachment filename:pdf',

  // مجلد Google Drive الجديد (GOOGLE_DRIVE_FOLDER_ID في app.js)
  DRIVE_FOLDER_ID: '1VaEkh0SUaYmeoVaYOLzFstF96d-CuoQR',

  // لصيقة توضع على الإيميلات المعالجة حتى لا تتكرر معالجتها
  PROCESSED_LABEL: 'Processed-Manifest'
};

/** الدالة الرئيسية - تُستدعى تلقائيًا كل دقيقة عبر المؤقّت */
function checkForNewManifestEmails() {
  const label = getOrCreateLabel_(CONFIG.PROCESSED_LABEL);
  const query = `${CONFIG.GMAIL_SEARCH_QUERY} -label:${CONFIG.PROCESSED_LABEL}`;
  const threads = GmailApp.search(query, 0, 20);
  if (!threads.length) return;

  const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);

  threads.forEach(thread => {
    thread.getMessages().forEach(message => {
      try {
        saveMessageAttachments_(message, folder);
      } catch (error) {
        Logger.log('خطأ في معالجة رسالة: ' + error);
      }
    });
    thread.addLabel(label);
  });
}

/**
 * يحفظ كل مرفقات PDF بالرسالة في Drive. اسم الملف يوضع بالترتيب التالي:
 * "رقم الرحلة - وقت الاستلام - اسم المرفق الأصلي" حتى تتعرف عليه الصفحة فورًا
 * (شارة رقم الرحلة) وتربط تلقائيًا بين منفست وترانزيت لنفس الرحلة.
 * رقم الرحلة يُستخرج من عنوان الرسالة أولًا، وإن لم يوجد فيه يُستخرج من اسم
 * المرفق نفسه - وإن تعذر إيجاده بالمرّتين، يُحفظ الملف بدون رقم رحلة (كما كان).
 */
function saveMessageAttachments_(message, folder) {
  const pdfAttachments = message.getAttachments()
    .filter(a => a.getContentType() === 'application/pdf');
  if (!pdfAttachments.length) return;

  const receivedAt = message.getDate();
  const timestamp = formatTimestamp_(receivedAt);
  const subject = message.getSubject();

  pdfAttachments.forEach(attachment => {
    const flightNumber = extractFlightNumber_(subject) || extractFlightNumber_(attachment.getName());
    const prefix = flightNumber ? `${flightNumber} - ` : '';
    const fileName = `${prefix}${timestamp} - ${attachment.getName()}`;
    const driveFile = folder.createFile(attachment.copyBlob().setName(fileName));
    driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  });
}

// نفس نمط رقم الرحلة المستخدم بالضبط في الصفحة (app.js) حتى تتطابق النتيجة دومًا:
// حرفان أو ثلاثة + رقمان لأربعة أرقام، مثل SV3321 أو XY12.
function extractFlightNumber_(text) {
  const match = String(text || '').toUpperCase().match(/\b([A-Z]{2,3}\d{2,4})\b/);
  return match ? match[1] : '';
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function formatTimestamp_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH-mm-ss');
}

/** شغّلها يدويًا مرة واحدة فقط لإنشاء المؤقّت (كل دقيقة) */
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'checkForNewManifestEmails') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('checkForNewManifestEmails').timeBased().everyMinutes(1).create();
  Logger.log('تم إنشاء المؤقّت - يعمل كل دقيقة الآن.');
}
