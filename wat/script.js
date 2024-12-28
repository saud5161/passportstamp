/***** يشتغل عند فتح الصفحة مباشرة *****/
window.onload = function() {
    hideAllFields();
};

/***** دالة لإخفاء جميع الحقول *****/
function hideAllFields() {
    // مثال على الحقول الرئيسة
    document.getElementById("numPassengersContainer").style.display = "none";
    document.getElementById("passengerFields").style.display = "none";
    document.getElementById("visaExpiryFields").style.display = "none";
    document.getElementById("passportExpiryFields").style.display = "none";

    // نخفي الحاوية الجديدة للمدة المتبقية (أشهر + أيام)
    if (document.getElementById("remainingTimeContainer")) {
        document.getElementById("remainingTimeContainer").style.display = "none";
    }

    // دواعي السفر
    document.getElementById("travelReasonLabel").style.display = "none";
    document.getElementById("travelReason").style.display = "none";

    // وقت الإقلاع
    document.getElementById("departureTimeContainer").style.display = "none";

    // الخطوط
    document.getElementById("airlines").style.display = "none";

    // الملاحظات
    document.getElementById("notes").style.display = "none";

    // اسم المرسل ورقمه
    document.getElementById("senderName").style.display = "none";
    document.getElementById("senderNumber").style.display = "none";
}

/***** زر تفريغ الخانات *****/
function clearFields() {
    document.getElementById("noteType").value = "";
    hideAllFields();
}

/***** عند تغيير نوع الملاحظة *****/
function handleNoteTypeChange() {
    hideAllFields();

    var noteType = document.getElementById("noteType").value;
    window.currentNoteType = noteType;

    // "انتهاء تأشيرة زيارة"
    if (noteType === "انتهاء تأشيرة زيارة") {
        document.getElementById("numPassengersContainer").style.display = "block";
        document.getElementById("passengerFields").style.display = "block";
        document.getElementById("visaExpiryFields").style.display = "block";

        // في "انتهاء تأشيرة زيارة" بنستخدم حقل واحد سابقًا (remainingDays).
        // لو ما تبي أشهر+أيام، خليه مثل ما كان. وهنا نخفي/نظهر حسب رغبتك.
        // مثلاً تبقيه بنفس آليته الأصلية أو تستعمل حقلين.
        // سنتركه مخفي لأنه بناءً على طلبك "أقل من 6 أشهر" هو اللي يحتاج الأشهر+الأيام.

        document.getElementById("notes").style.display = "block";
        document.getElementById("senderName").style.display = "block";
        document.getElementById("senderNumber").style.display = "block";

        document.getElementById("departureTimeContainer").style.display = "block";
        document.getElementById("airlines").style.display = "block";

        // رقم الحدود ظاهر في المسافر الأول بدل رقم الجواز
        document.getElementById("borderNumber1").style.display = "block";
        if (document.getElementById("passportNumber1")) {
            document.getElementById("passportNumber1").style.display = "none";
        }

    }
    // "أقل من 6 أشهر"
    else if (noteType === "أقل من 6 أشهر") {
        document.getElementById("numPassengersContainer").style.display = "block";
        document.getElementById("passengerFields").style.display = "block";
        document.getElementById("passportExpiryFields").style.display = "block";

        // **نُظهر حقلين للأشهر والأيام** بدل حقل واحد
        if (document.getElementById("remainingTimeContainer")) {
            document.getElementById("remainingTimeContainer").style.display = "block";
        }

        document.getElementById("travelReasonLabel").style.display = "block";
        document.getElementById("travelReason").style.display = "block";
        document.getElementById("notes").style.display = "block";
        document.getElementById("senderName").style.display = "block";
        document.getElementById("senderNumber").style.display = "block";

        document.getElementById("departureTimeContainer").style.display = "block";
        document.getElementById("airlines").style.display = "block";

        // رقم الجواز ظاهر - رقم الحدود مخفي
        document.getElementById("passportNumber1").style.display = "block";
        if (document.getElementById("borderNumber1")) {
            document.getElementById("borderNumber1").style.display = "none";
        }
    }
}

/***** تعبئة الملاحظات تلقائيًا لـ "انتهاء تأشيرة زيارة" *****/
function autoFillNotes() {
    var noteType = document.getElementById("noteType").value;
    var notesField = document.getElementById("notes");

    if (noteType === "انتهاء تأشيرة زيارة") {
        var expiryDay = document.getElementById("expiryDay").value.padStart(2, '0');
        var expiryMonth = document.getElementById("expiryMonth").value.padStart(2, '0');
        var expiryYear = document.getElementById("expiryYear").value;
        if (expiryDay && expiryMonth && expiryYear) {
            notesField.value =
              "عند انهاء اجرءات مغادرته اتضح لنا بأن المغادرة النهائية لتأشيرة منتهية بتاريخ "
              + expiryDay + "-" + expiryMonth + "-" + expiryYear;
        } else {
            notesField.value =
              "عند انهاء اجرءات مغادرته اتضح لنا بأن المغادرة النهائية لتأشيرة منتهية بتاريخ...";
        }
    } else {
        notesField.value = "";
    }
}

/***** تعبئة رقم المرسل لو الاسم "سعود" *****/
function autoFillSenderNumber() {
    var senderName = document.getElementById("senderName").value;
    var senderNumberField = document.getElementById("senderNumber");
    if (senderName === "سعود") {
        senderNumberField.value = "568190224";
    } else {
        senderNumberField.value = "";
    }
}

/***** فتح جهات الاتصال (تجريبي) *****/
function openContacts() {
    // هذه الطريقة ليست قياسية 100% وقد لا تعمل على كل الأجهزة
    // لكن كمثال بدائي:
    try {
        // للاندرويد intent:
        window.location.href = "intent://contacts#Intent;action=android.intent.action.VIEW;end;";
    } catch(e) {
        alert("يتعذر فتح جهات الاتصال على هذا الجهاز!");
    }
}

/***** الدالة الأساسية للإرسال للواتس *****/
function submitForm() {
    autoFillNotes();  // ملاحظات تأشيرة الزيارة لو احتجنا

    var noteType = document.getElementById("noteType").value;
    var senderNumber = document.getElementById("senderNumber").value;
    var numPassengers = parseInt(document.getElementById("numPassengers").value, 10) || 1;
    var message = "";

    // 1) نسرد بيانات المسافرين
    for (var i = 1; i <= numPassengers; i++) {
        var travelerName = document.getElementById("name" + i).value || "";
        var travelerNationality = document.getElementById("nationality" + i)
            ? document.getElementById("nationality" + i).value : "";

        if (noteType === "انتهاء تأشيرة زيارة") {
            // رقم الحدود
            var travelerBorder = document.getElementById("borderNumber" + i)
                ? document.getElementById("borderNumber" + i).value
                : "";
            message += "*اسم المسافر:* " + travelerName + "\n";
            message += "*رقم الحدود:* " + travelerBorder + "\n";
            message += "*الجنسية:* " + travelerNationality + "\n";

        } else if (noteType === "أقل من 6 أشهر") {
            // رقم الجواز
            var travelerPassport = document.getElementById("passportNumber" + i)
                ? document.getElementById("passportNumber" + i).value
                : "";
            message += "*اسم المسافر:* " + travelerName + "\n";
            message += "*رقم الجواز:* " + travelerPassport + "\n";
            message += "*الجنسية:* " + travelerNationality + "\n";
        }

        if (i < numPassengers) {
            message += "----\n";
        }
    }

    // 2) بعد المسافرين، نضيف المعلومات المشتركة مرّة واحدة
    message += "\n";

    // "انتهاء تأشيرة زيارة": تاريخ انتهاء التأشيرة
    if (noteType === "انتهاء تأشيرة زيارة") {
        var expiryDay = document.getElementById("expiryDay").value || "";
        var expiryMonth = document.getElementById("expiryMonth").value || "";
        var expiryYear = document.getElementById("expiryYear").value || "";
        message += "*تاريخ انتهاء التأشيرة:* " + expiryDay + "-" + expiryMonth + "-" + expiryYear + "\n";
    }

    // "أقل من 6 أشهر": تاريخ انتهاء الجواز + دواعي السفر
    if (noteType === "أقل من 6 أشهر") {
        var passportExpiryDay = document.getElementById("passportExpiryDay").value || "";
        var passportExpiryMonth = document.getElementById("passportExpiryMonth").value || "";
        var passportExpiryYear = document.getElementById("passportExpiryYear").value || "";
        message += "*تاريخ انتهاء الجواز:* " + passportExpiryDay + "-" + passportExpiryMonth + "-" + passportExpiryYear + "\n";

        var travelReasonVal = document.getElementById("travelReason").value || "";
        message += "*دواعي السفر:* " + travelReasonVal + "\n";
    }

    // 3) عدد الأشهر والأيام (بدل عدد أيام الانتهاء)
    // لو اخترت "أقل من 6 أشهر" وبتستخدم حقلين remainingMonths + remainingDays
    if (noteType === "أقل من 6 أشهر") {
        var remMonths = document.getElementById("remainingMonths").value || "0";
        var remDays = document.getElementById("remainingDays").value || "0";
        message += "*المدة المتبقية:* " + remMonths + " شهر و " + remDays + " يوم\n";
    }
    else {
        // أو لو ما زلت تستخدم أيام فقط في تأشيرة الزيارة، عدّل حسب رغبتك
        // message += ...
    }

    // 4) الخطوط
    var airlinesVal = document.getElementById("airlines").value || "";
    if (airlinesVal) {
        message += "*الخطوط:* " + airlinesVal + "\n";
    }

    // وقت الإقلاع
    var departureHour = document.getElementById("departureHour").value || "";
    var departureMinutes = document.getElementById("departureMinutes").value || "";
    if (departureHour || departureMinutes) {
        message += "*وقت الإقلاع:* " + departureHour + ":" + departureMinutes + "\n";
    }

    // الملاحظات
    var notesVal = document.getElementById("notes").value || "";
    if (notesVal) {
        message += "*الملاحظات:* " + notesVal + "\n";
    }

    // 5) ختام الرسالة
    message += "\n*بأمل اطلاع سعادتكم والتوجيه*";

    // 6) فتح الواتس
    var whatsappUrl = "https://wa.me/966" + senderNumber + "?text=" + encodeURIComponent(message);
    window.location.href = whatsappUrl;
}

/***** دالة تحديث حقول المسافرين 2..10 *****/
function updatePassengerFields() {
    var noteType = window.currentNoteType || document.getElementById("noteType").value;
    var numPassengers = parseInt(document.getElementById("numPassengers").value, 10) || 1;
    if (numPassengers < 1) numPassengers = 1; 
    if (numPassengers > 10) numPassengers = 10;  // سقف لـ10

    var additionalPassengersContainer = document.getElementById("additionalPassengers");
    additionalPassengersContainer.innerHTML = ""; 

    for (var i = 2; i <= numPassengers; i++) {
        var passengerGroup = document.createElement("div");
        passengerGroup.className = "passenger-group";

        // اسم المسافر
        var nameLabel = document.createElement("label");
        nameLabel.textContent = "اسم المسافر:";
        passengerGroup.appendChild(nameLabel);

        var nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.id = "name" + i;
        nameInput.required = true;
        passengerGroup.appendChild(nameInput);

        // عند "انتهاء تأشيرة زيارة" => رقم الحدود
        // عند "أقل من 6 أشهر" => رقم الجواز
        if (noteType === "انتهاء تأشيرة زيارة") {
            var borderLabel = document.createElement("label");
            borderLabel.textContent = "رقم الحدود:";
            passengerGroup.appendChild(borderLabel);

            var borderInput = document.createElement("input");
            borderInput.type = "number";
            borderInput.id = "borderNumber" + i;
            borderInput.required = true;
            passengerGroup.appendChild(borderInput);

        } else if (noteType === "أقل من 6 أشهر") {
            var passportLabel = document.createElement("label");
            passportLabel.textContent = "رقم الجواز:";
            passengerGroup.appendChild(passportLabel);

            var passportInput = document.createElement("input");
            passportInput.type = "text";
            passportInput.id = "passportNumber" + i;
            passportInput.required = true;
            passportInput.style.direction = "ltr";
            passengerGroup.appendChild(passportInput);
        }

        // الجنسية
        var nationalityLabel = document.createElement("label");
        nationalityLabel.textContent = "الجنسية:";
        passengerGroup.appendChild(nationalityLabel);

        var nationalityInput = document.createElement("input");
        nationalityInput.type = "text";
        nationalityInput.id = "nationality" + i;
        nationalityInput.required = true;
        passengerGroup.appendChild(nationalityInput);

        // ملاحظة توضيحية (اختياري)
        var hint = document.createElement("p");
        hint.className = "hint";
        hint.textContent = "تم اقتراح الجنسية حسب المسافر الأول";
        passengerGroup.appendChild(hint);

        additionalPassengersContainer.appendChild(passengerGroup);
    }

    copyNationalityToOthers();
}

/***** نسخ جنسية المسافر الأول *****/
function copyNationalityToOthers() {
    var nationality1Input = document.getElementById("nationality1");
    if (!nationality1Input) return;

    var nationality1 = nationality1Input.value;
    var numPassengers = parseInt(document.getElementById("numPassengers").value, 10) || 1;

    for (var i = 2; i <= numPassengers; i++) {
        var nationalityInput = document.getElementById("nationality" + i);
        if (nationality1 && nationalityInput) {
            nationalityInput.value = nationality1;
        }
    }
}
