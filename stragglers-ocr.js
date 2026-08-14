/*
 * تحليل صور تقارير الجوازات (Absher/حركة الحدود) لاستخراج بيانات
 * الركاب المتخلفين تلقائياً وتعبئة نموذج "إشعار عن المتخلفين".
 *
 * يعمل بالكامل داخل المتصفح (Tesseract.js يُحمَّل من CDN عند أول استخدام
 * فقط) — لا تُرسل أي صورة أو بيانات لأي خادم خارجي، بناءً على اختيار
 * إبقاء المعالجة محلية بسبب حساسية بيانات المسافرين.
 *
 * منهج رفع الدقة المعتمد (بلا اتصال بأي ذكاء اصطناعي سحابي):
 * 1) تحسين الصورة: تكبير + تدرج رمادي + رفع تباين + تحويل ثنائي (Otsu).
 * 2) قراءة كل كلمة بإحداثياتها الفعلية (bbox) وثقة قراءتها من Tesseract،
 *    ثم إعادة تجميعها في "صفوف" بحسب التقارب الرأسي الفعلي في الصورة،
 *    بدل الاعتماد على تقسيم الأسطر الداخلي في Tesseract الذي قد يخلط
 *    أعمدة الجدول ببعضها (وهو ما سبب الأخطاء السابقة).
 * 3) البحث عن كل قيمة بجوار عنوانها الفعلي في التقرير (مثل "رقم الهوية
 *    (سامس)" لرقم الإقامة، و"وسيلة النقل" لرقم الرحلة، و"التاريخ - الوقت"
 *    لتاريخ الحركة) بدل البحث الحر في كامل النص.
 * 4) بوابة ثقة (Confidence Gate): أي حقل لم تتجاوز ثقة قراءته الحد الأدنى
 *    (MIN_CONFIDENCE) لا تتم تعبئته تلقائياً على الإطلاق ويُترك فارغاً
 *    ليُدخله الموظف يدوياً، بدل عرض قراءة قد تكون خاطئة كأنها مؤكدة.
 *    هذا هو الضمان العملي الوحيد الممكن محلياً لتقليل أثر الخطأ على بيانات
 *    حساسة — لا يوجد محرك OCR مجاني يضمن دقة 100%، لكن ترك الحقل فارغاً
 *    بدل تعبئته بتخمين خاطئ يحوّل "خطأ صامت" إلى "غياب واضح يستدعي الإدخال
 *    اليدوي"، وهذا ما يقلل فعلياً احتمال إرسال معلومة خاطئة دون ملاحظتها.
 * 5) لا نُخمّن أي بيانات غير مقروءة فعلياً من الصورة (مثل مدينة الوجهة).
 *
 * MIN_CONFIDENCE قيمة أولية غير مُعايرة على صور حقيقية من عملكم — إن
 * لاحظتم رفض حقول صحيحة كثيراً بعد التجربة الفعلية اخفضوها، أو إن قُبلت
 * قراءات خاطئة ارفعوها.
 */
const StragglersOCR = (() => {

    const MIN_CONFIDENCE = 60; // من 0 إلى 100، قابلة للمعايرة (انظر الملاحظة أعلاه)

    const NATIONALITIES = {
        'PHL': 'الفلبين', 'IND': 'الهند', 'IDN': 'اندونيسيا', 'BGD': 'بنغلاديش',
        'PAK': 'باكستان', 'EGY': 'مصر', 'SDN': 'السودان', 'YEM': 'اليمن',
        'SYR': 'سوريا', 'JOR': 'الأردن', 'LBN': 'لبنان', 'MAR': 'المغرب',
        'TUN': 'تونس', 'DZA': 'الجزائر', 'ETH': 'أثيوبيا', 'KEN': 'كينيا',
        'UGA': 'أوغندا', 'NPL': 'نيبال', 'LKA': 'سيريلانكا', 'THA': 'تايلاند',
        'CHN': 'الصين', 'USA': 'أمريكا', 'GBR': 'بريطانيا', 'NGA': 'نيجيريا',
        'AFG': 'أفغانستان', 'MMR': 'ميانمار'
    };

    const FIELD_LABELS = {
        name: 'الاسم', passport: 'رقم الجواز', residency: 'رقم الإقامة',
        flight: 'رقم الرحلة', date: 'تاريخ الحركة'
    };

    let tesseractLoading = null;

    function ensureTesseract() {
        if (window.Tesseract) return Promise.resolve();
        if (tesseractLoading) return tesseractLoading;
        tesseractLoading = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('تعذر تحميل مكتبة تحليل الصور'));
            document.head.appendChild(s);
        });
        return tesseractLoading;
    }

    // ---------- تحسين الصورة قبل التحليل ----------
    function otsuThreshold(hist, total) {
        let sum = 0;
        for (let i = 0; i < 256; i++) sum += i * hist[i];
        let sumB = 0, wB = 0, maxVar = -1, threshold = 127;
        for (let t = 0; t < 256; t++) {
            wB += hist[t];
            if (wB === 0) continue;
            const wF = total - wB;
            if (wF === 0) break;
            sumB += t * hist[t];
            const mB = sumB / wB;
            const mF = (sum - sumB) / wF;
            const between = wB * wF * (mB - mF) * (mB - mF);
            if (between > maxVar) { maxVar = between; threshold = t; }
        }
        return threshold;
    }

    function preprocessImage(file) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const MIN_WIDTH = 1600, MAX_WIDTH = 2400;
                    let scale = 1;
                    if (img.width < MIN_WIDTH) scale = Math.min(2.5, MIN_WIDTH / img.width);
                    const targetWidth = Math.min(MAX_WIDTH, Math.round(img.width * scale));
                    const finalScale = targetWidth / img.width;
                    const w = Math.max(1, Math.round(img.width * finalScale));
                    const h = Math.max(1, Math.round(img.height * finalScale));

                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);

                    const imgData = ctx.getImageData(0, 0, w, h);
                    const d = imgData.data;
                    const n = w * h;
                    const gray = new Uint8ClampedArray(n);
                    const hist = new Array(256).fill(0);
                    const contrastFactor = 1.3;
                    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
                        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                        const c = Math.min(255, Math.max(0, (g - 128) * contrastFactor + 128));
                        gray[p] = c;
                        hist[Math.round(c)]++;
                    }
                    const threshold = otsuThreshold(hist, n);
                    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
                        const v = gray[p] > threshold ? 255 : 0;
                        d[i] = d[i + 1] = d[i + 2] = v;
                    }
                    ctx.putImageData(imgData, 0, 0);
                    canvas.toBlob((blob) => resolve(blob || file), 'image/png');
                } catch (e) {
                    resolve(file); // نتابع بالصورة الأصلية إن تعذر التحسين
                }
            };
            img.onerror = () => resolve(file);
            img.src = URL.createObjectURL(file);
        });
    }

    // ---------- تشغيل Tesseract والحصول على الكلمات بإحداثياتها وثقتها ----------
    async function recognizeWords(blob) {
        let worker = null;
        try {
            worker = await Tesseract.createWorker('eng+ara');
            if (Tesseract.PSM) {
                await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
            }
            const { data } = await worker.recognize(blob, {}, { blocks: true });
            const words = [];
            (data.blocks || []).forEach(block => {
                (block.paragraphs || []).forEach(para => {
                    (para.lines || []).forEach(line => {
                        (line.words || []).forEach(w => words.push(w));
                    });
                });
            });
            return { text: data.text || '', words };
        } finally {
            if (worker) { try { await worker.terminate(); } catch (_) {} }
        }
    }

    // ---------- تجميع الكلمات في صفوف بحسب التقارب الرأسي الفعلي في الصورة ----------
    function buildRows(words) {
        const items = words
            .filter(w => w.text && w.text.trim() && w.bbox)
            .map(w => ({
                text: w.text.trim(),
                conf: typeof w.confidence === 'number' ? w.confidence : 0,
                x0: w.bbox.x0,
                yc: (w.bbox.y0 + w.bbox.y1) / 2,
                h: Math.max(1, w.bbox.y1 - w.bbox.y0)
            }))
            .sort((a, b) => a.yc - b.yc);

        const rows = [];
        for (const w of items) {
            const tol = w.h * 0.6;
            const row = rows.find(r => Math.abs(r.yc - w.yc) <= Math.max(tol, r.tol));
            if (row) {
                row.words.push(w);
                row.yc = (row.yc * (row.words.length - 1) + w.yc) / row.words.length;
            } else {
                rows.push({ yc: w.yc, tol, words: [w] });
            }
        }
        rows.sort((a, b) => a.yc - b.yc);
        rows.forEach(r => r.words.sort((a, b) => a.x0 - b.x0));
        return rows.map(r => ({
            text: r.words.map(w => w.text).join(' '),
            avgConf: r.words.reduce((s, w) => s + w.conf, 0) / r.words.length
        }));
    }

    // ---------- أدوات استخراج مرتكزة على تسمية الحقل، مع ثقة حقيقية من الصورة ----------
    // نبحث عن أقل عدد صفوف ممكن يحوي القيمة (صف واحد أولاً، ثم نوسّع تدريجياً
    // فقط عند الحاجة) بدل أخذ نافذة ثابتة من الصفوف دائماً — لأن أخذ نافذة
    // ثابتة قد يُدخل صفوفاً عالية الثقة من حقل مجاور في متوسط الثقة ويُخفي
    // ضعف قراءة القيمة الفعلية.
    function findNear(rows, keywordsOrdered, pattern, maxRowSpan = 3) {
        for (const kw of keywordsOrdered) {
            for (let i = 0; i < rows.length; i++) {
                if (!rows[i].text.includes(kw)) continue;
                for (let span = 1; span <= maxRowSpan && i + span <= rows.length; span++) {
                    const slice = rows.slice(i, i + span);
                    const chunk = slice.map(r => r.text).join(' ');
                    const m = chunk.match(pattern);
                    if (m) {
                        const conf = slice.reduce((s, r) => s + r.avgConf, 0) / slice.length;
                        return { value: m[0], confidence: conf };
                    }
                }
            }
        }
        return null;
    }

    function findLabelValue(rows, labelKeywords) {
        for (const kw of labelKeywords) {
            for (let i = 0; i < rows.length; i++) {
                const idx = rows[i].text.indexOf(kw);
                if (idx === -1) continue;
                const sameRow = rows[i].text.slice(idx + kw.length).replace(/^[:\s-]+/, '').trim();
                if (sameRow) return { value: sameRow, confidence: rows[i].avgConf };
                if (rows[i + 1]) return { value: rows[i + 1].text.trim(), confidence: rows[i + 1].avgConf };
            }
        }
        return null;
    }

    // ثقة "حقيقية" لقيمة عُثر عليها بنمط عام (غير مرتكز على تسمية): نحدّد أي
    // صف تنتمي إليه فعلياً في الصورة ونأخذ ثقة ذلك الصف، بدل افتراض ثقة عالية
    function confidenceOf(rows, value) {
        const clean = value.replace(/\s+/g, '');
        const row = rows.find(r => r.text.replace(/\s+/g, '').includes(clean));
        return row ? row.avgConf : 0;
    }

    function normalizeNumeric(s) {
        return s.replace(/\s+/g, '')
            .replace(/[Oo]/g, '0')
            .replace(/[Il|]/g, '1')
            .replace(/[Ss]/g, '5')
            .replace(/[Bb]/g, '8')
            .replace(/[Zz]/g, '2');
    }

    function extractName(rows, fullText) {
        const first = findLabelValue(rows, ['الاسم الأول', 'الاسم الاول']);
        const family = findLabelValue(rows, ['اسم العائلة', 'اسم العائله']);
        const firstWord = first ? (first.value.match(/[A-Za-z]{2,}/) || [])[0] : '';
        const familyWord = family ? (family.value.match(/[A-Za-z]{2,}/) || [])[0] : '';
        if (firstWord && familyWord) {
            return {
                value: `${firstWord.toUpperCase()} ${familyWord.toUpperCase()}`,
                confidence: Math.min(first.confidence, family.confidence)
            };
        }
        const m = fullText.match(/\b[A-Za-z]{2,}(?:\s+[A-Za-z]{2,}){1,2}\b/);
        if (!m) return null;
        const value = m[0].replace(/\s+/g, ' ').trim().toUpperCase();
        return { value, confidence: confidenceOf(rows, m[0]) };
    }

    function extractPassport(rows, fullText) {
        const pattern = /\b[A-Za-z]{1,2}\d{6,9}[A-Za-z]?\b/;
        const near = findNear(rows, ['رقم الوثيقة', 'رقم الجواز'], pattern);
        if (near) return { value: near.value.toUpperCase(), confidence: near.confidence };
        const m = fullText.match(pattern);
        if (!m) return null;
        return { value: m[0].toUpperCase(), confidence: confidenceOf(rows, m[0]) };
    }

    function extractResidency(rows, passport) {
        const loosePattern = /\d[\d \-]{7,13}\d/;
        const near = findNear(rows, ['سامس', 'رقم الهوية', 'رقم الإقامة', 'رقم الاقامة'], loosePattern);
        if (!near) return null;
        const clean = normalizeNumeric(near.value);
        if (/^\d{9,10}$/.test(clean) && clean !== passport) {
            return { value: clean, confidence: near.confidence };
        }
        return null;
    }

    function extractFlight(rows) {
        const pattern = /\b[A-Za-z]{2}\s?-?\d{3,4}\b/;
        // "وسيلة النقل" عادة أوضح من عمود "الرحلة" لاحتوائه أحياناً أيقونة تكسر القراءة
        const near = findNear(rows, ['وسيلة النقل', 'الرحلة'], pattern);
        if (!near) return null;
        return { value: near.value.replace(/\s+/g, '').toUpperCase(), confidence: near.confidence };
    }

    function extractDate(rows) {
        const withTimePattern = /(20\d{2})-(\d{2})-(\d{2})\s+\d{1,2}:\d{2}/;
        const near = findNear(rows, ['التاريخ - الوقت', 'التاريخ-الوقت', 'التاريخ والوقت'], withTimePattern);
        if (!near) return null;
        const m = near.value.match(withTimePattern);
        if (!m) return null;
        return { value: `${m[1]}-${m[2]}-${m[3]}`, confidence: near.confidence };
    }

    function extractNationality(text) {
        for (const code in NATIONALITIES) if (text.includes(code)) return NATIONALITIES[code];
        for (const name of Object.values(NATIONALITIES)) if (text.includes(name)) return name;
        return '';
    }

    async function analyze(index, file, statusEl) {
        statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري تحسين جودة الصورة...';
        const improved = await preprocessImage(file);

        statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري تحميل مكتبة التحليل...';
        await ensureTesseract();

        statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري تحليل الصورة... قد يستغرق ذلك بضع ثوانٍ';

        let text = '', rows = [];
        try {
            const result = await recognizeWords(improved);
            text = result.text;
            rows = buildRows(result.words);
        } catch (e) {
            console.error('تعذّر التحليل المتقدم (بالإحداثيات)، سيتم استخدام نص بسيط بدون درجة ثقة موثوقة', e);
            const { data } = await Tesseract.recognize(improved, 'eng+ara');
            text = data.text || '';
            rows = getLines(text).map(l => ({ text: l, avgConf: 0 }));
        }

        const passport = extractPassport(rows, text);
        const results = {
            name: extractName(rows, text),
            passport,
            residency: extractResidency(rows, passport ? passport.value : ''),
            flight: extractFlight(rows),
            date: extractDate(rows)
        };
        const nationality = extractNationality(text);

        const setVal = (id, value) => { const el = document.getElementById(id); if (el) el.value = value; };

        const accepted = [];
        const foundButRejected = [];
        Object.keys(results).forEach(key => {
            const r = results[key];
            if (!r) return;
            if (r.confidence >= MIN_CONFIDENCE) accepted.push(key);
            else foundButRejected.push(key);
        });

        if (accepted.includes('name')) setVal(`st_name_${index}`, results.name.value);
        if (accepted.includes('passport')) setVal(`st_pass_${index}`, results.passport.value);
        if (accepted.includes('residency')) setVal(`st_res_${index}`, results.residency.value);
        if (accepted.includes('flight')) setVal(`st_flight_${index}`, results.flight.value);
        if (nationality) setVal(`st_nat_${index}`, nationality);

        if (accepted.includes('date')) {
            const dateEl = document.getElementById(`st_late_date_${index}`);
            if (dateEl) {
                dateEl.value = results.date.value;
                if (typeof updateStLateDate === 'function') updateStLateDate(index);
            }
        }

        const rawBox = document.getElementById(`st_img_raw_${index}`);
        if (rawBox) rawBox.value = text.trim();

        const okLabels = accepted.map(k => FIELD_LABELS[k]);
        const needLabels = Object.keys(FIELD_LABELS)
            .filter(k => !accepted.includes(k))
            .map(k => FIELD_LABELS[k]);

        let msg = '';
        if (okLabels.length || nationality) {
            const all = nationality ? [...okLabels, 'الجنسية'] : okLabels;
            msg += `✅ عُبِّئت بثقة كافية: ${all.join('، ')}. `;
        }
        if (needLabels.length) {
            msg += `⚠️ تحتاج إدخال يدوي (لم تُقبل القراءة تلقائياً): ${needLabels.join('، ')}.`;
        }
        statusEl.innerHTML = msg || '⚠️ لم يتم التعرف على أي حقل بثقة كافية، الرجاء التعبئة يدوياً أو عرض النص الخام';
    }

    function getLines(text) {
        return text.split('\n').map(l => l.trim()).filter(Boolean);
    }

    function handleImage(index, inputEl) {
        const file = inputEl.files && inputEl.files[0];
        if (!file) return;

        const preview = document.getElementById(`st_img_preview_${index}`);
        const status = document.getElementById(`st_img_status_${index}`);
        if (preview) {
            preview.src = URL.createObjectURL(file);
            preview.style.display = 'inline-block';
        }
        if (status) {
            status.style.display = 'flex';
            status.textContent = '';
        }

        inputEl.disabled = true;
        analyze(index, file, status)
            .catch(err => {
                console.error(err);
                if (status) status.textContent = '⚠️ تعذر تحليل الصورة تلقائياً، الرجاء تعبئة الحقول يدوياً';
            })
            .finally(() => { inputEl.disabled = false; });
    }

    function toggleRaw(index) {
        const box = document.getElementById(`st_img_raw_${index}`);
        if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
    }

    function clearImage(index) {
        const input = document.getElementById(`st_img_${index}`);
        const preview = document.getElementById(`st_img_preview_${index}`);
        const status = document.getElementById(`st_img_status_${index}`);
        const rawBox = document.getElementById(`st_img_raw_${index}`);
        if (input) input.value = '';
        if (preview) { preview.removeAttribute('src'); preview.style.display = 'none'; }
        if (status) { status.textContent = ''; status.style.display = 'none'; }
        if (rawBox) { rawBox.value = ''; rawBox.style.display = 'none'; }
    }

    return { handleImage, clearImage, toggleRaw };
})();

window.StragglersOCR = StragglersOCR;
