/* MZ Active professional training-program documents.
 * Dependency-free client-side DOCX writer plus a print-ready HTML preview.
 * WhatsApp delivery uses the device's native file share sheet (navigator.share
 * with files). No text-only link is presented as a delivered document. */
(() => {
  const KEY = 'mzactive-program-document';
  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  const COPY = {
    en: {
      brand: 'MZ ACTIVE · PERFORMANCE TRAINING',
      program: 'TRAINING PROGRAM',
      week: 'Week',
      day: 'Day / Date',
      session: 'Session',
      distance: 'Distance',
      duration: 'Duration',
      details: 'Complete workout description',
      coachNote: 'Coach note',
      coach: 'Coach',
      athlete: 'Athlete',
      rest: 'Rest day',
      savePdf: 'Save as PDF',
      downloadDocx: 'Download DOCX',
      share: 'Share document via WhatsApp',
      fallback: 'Open WhatsApp with a summary (no file attachment)',
      preview: 'Review the complete document before sending',
      shareInfo: 'Choose WhatsApp in the share sheet and select the recipient. MZ Active cannot confirm delivery; send the document yourself in WhatsApp.',
      fallbackInfo: 'This browser cannot attach files to WhatsApp. The DOCX has been downloaded — attach it manually in the WhatsApp chat.',
      shared: 'Share sheet opened. Select WhatsApp and send the document yourself.',
      downloaded: 'Document downloaded.',
      printing: 'Opening the print dialog — choose “Save as PDF”.',
      noPayload: 'This preview has expired. Return to the coaching studio and prepare the program again.',
    },
    ar: {
      brand: 'إم زي أكتيف · التدريب الأدائي',
      program: 'برنامج تدريبي',
      week: 'الأسبوع',
      day: 'اليوم / التاريخ',
      session: 'الحصة',
      distance: 'المسافة',
      duration: 'المدة',
      details: 'وصف الحصة كاملاً',
      coachNote: 'ملاحظة المدرب',
      coach: 'المدرب',
      athlete: 'الرياضي',
      rest: 'يوم راحة',
      savePdf: 'حفظ بصيغة PDF',
      downloadDocx: 'تنزيل DOCX',
      share: 'مشاركة المستند عبر واتساب',
      fallback: 'فتح واتساب بملخص (بدون إرفاق ملف)',
      preview: 'راجع المستند كاملاً قبل الإرسال',
      shareInfo: 'اختر واتساب من قائمة المشاركة وحدد المستلم. لا يمكن لـ MZ Active تأكيد التسليم؛ أرسل المستند بنفسك في واتساب.',
      fallbackInfo: 'لا يمكن لهذا المتصفح إرفاق ملفات في واتساب. تم تنزيل ملف DOCX — أرفقه يدوياً في محادثة واتساب.',
      shared: 'تم فتح قائمة المشاركة. اختر واتساب وأرسل المستند بنفسك.',
      downloaded: 'تم تنزيل المستند.',
      printing: 'جارٍ فتح نافذة الطباعة — اختر «حفظ كملف PDF».',
      noPayload: 'انتهت صلاحية هذه المعاينة. عد إلى استوديو التدريب وأعد تجهيز البرنامج.',
    },
  };

  const t = (lang, key) => (COPY[lang] || COPY.en)[key] || COPY.en[key];
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  }[char]));

  function parseWorkout(text) {
    const raw = String(text || '');
    const marker = /\[MZ:(\{[^}\n]*\})\]/.exec(raw);
    let meta = {};
    if (marker) { try { meta = JSON.parse(marker[1]); } catch { meta = {}; } }
    const clean = raw.replace(/\[MZ:[^\n]*\]\n?/g, '').trim();
    const lines = clean.split('\n').map(line => line.trim()).filter(Boolean);
    return {
      meta,
      title: lines[0] || '',
      lines,
      details: lines.join('\n'),
      distance: meta.km ? `${meta.km} km` : '',
      duration: meta.minutes ? `${meta.minutes} min` : '',
    };
  }

  function dateLabel(value, offset = 0) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '';
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
  }

  function dateRange(start, days) {
    const end = dateLabel(start, Math.max(0, days - 1));
    return end ? `${dateLabel(start)} – ${end}` : dateLabel(start);
  }

  /* Build a document payload from the coaching studio form. */
  function fromForm(root, options = {}) {
    const form = root || document.getElementById('whatsappTrainingForm');
    if (!form) return null;
    const value = id => form.querySelector(`#${id}`)?.value || '';
    const lang = options.language || (window.MZActiveLanguage?.get() === 'ar' ? 'ar' : 'en');
    const athlete = value('trainingClientName') || t(lang, 'athlete');
    const coach = options.coachName || value('coachName') || t(lang, 'coach');
    const weekStart = value('trainingWeekStart');
    const days = [...form.querySelectorAll('[data-day]')].map((area, index) => {
      const key = area.dataset.day || DAYS[index];
      const parsed = parseWorkout(area.value);
      const type = form.querySelector(`[data-session-type][data-day="${key}"]`)?.value || '';
      const extras = [...(form.querySelectorAll(`[data-extra-for="${key}"] textarea`) || [])].map(node => parseWorkout(node.value));
      return {
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        date: dateLabel(weekStart, index),
        type,
        title: parsed.title,
        distance: parsed.distance,
        duration: parsed.duration,
        lines: parsed.lines,
        extras,
        isRest: /rest|راحة/i.test(`${parsed.title} ${parsed.details} ${type}`),
      };
    }).filter(day => day.lines.length || day.extras.length);
    const note = value('weeklyCoachNote') || '';
    const programTitle = options.title || `${days.length} ${t(lang, 'program')}`;
    return {
      lang,
      coach,
      athlete,
      title: programTitle,
      date_range: dateRange(weekStart, 7),
      note,
      weeks: [{ label: `${t(lang, 'week')} 1`, days }],
      whatsapp_phone: value('trainingClientPhone') || '',
    };
  }

  /* ---------- Minimal DOCX (OOXML in a stored ZIP) ---------- */
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function concat(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
    return out;
  }

  function zipStore(files) {
    const encoder = new TextEncoder();
    const locals = [], centrals = [];
    let offset = 0;
    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0x21, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);
      local.set(name, 30);
      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x21, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      central.set(name, 46);
      locals.push(local, data);
      centrals.push(central);
      offset += local.length + data.length;
    }
    const cdSize = centrals.reduce((sum, chunk) => sum + chunk.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);
    return concat([...locals, ...centrals, end]);
  }

  function paragraph(text, options = {}) {
    const bidi = options.bidi ? '<w:bidi/>' : '';
    const style = options.style ? `<w:pStyle w:val="${options.style}"/>` : '';
    const spacing = options.space == null ? 120 : options.space;
    const strong = options.strong ? '<w:b/>' : '';
    const color = options.color ? `<w:color w:val="${options.color}"/>` : '';
    const size = options.size ? `<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>` : '';
    const runs = String(text == null ? '' : text).split('\n').map((line, index) => {
      const br = index ? '<w:r><w:br/></w:r>' : '';
      return `${br}<w:r><w:rPr>${strong}${color}${size}</w:rPr><w:t xml:space="preserve">${esc(line)}</w:t></w:r>`;
    }).join('');
    return `<w:p><w:pPr>${style}${bidi}<w:spacing w:after="${spacing}"/></w:pPr>${runs}</w:p>`;
  }

  function pageBreak() {
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }

  function table(rows, widths) {
    const grid = widths.map(width => `<w:gridCol w:w="${width}"/>`).join('');
    const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map(side => `<w:${side} w:val="single" w:sz="4" w:color="C9A227"/>`).join('');
    const body = rows.map(row => `<w:tr>${row.map((cell, index) => (
      `<w:tc><w:tcPr><w:tcW w:w="${widths[index]}" w:type="dxa"/></w:tcPr>${paragraph(cell, { space: 0, size: 19 })}</w:tc>`
    )).join('')}</w:tr>`).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
  }

  function documentXml(payload) {
    const lang = payload.lang === 'ar' ? 'ar' : 'en';
    const bidi = lang === 'ar';
    const c = key => t(lang, key);
    const parts = [
      paragraph(c('brand'), { style: 'Subtitle', color: 'C9A227', strong: true, size: 20, bidi }),
      paragraph(payload.coach || c('coach'), { size: 22, bidi }),
      paragraph(payload.athlete || c('athlete'), { style: 'Heading1', strong: true, size: 30, bidi }),
      paragraph(String(payload.title || c('program')).toUpperCase(), { style: 'Title', strong: true, size: 34, bidi }),
      paragraph(payload.date_range || '', { color: '4B5B5B', bidi }),
    ];
    payload.weeks.forEach((week, weekIndex) => {
      if (weekIndex) parts.push(pageBreak());
      parts.push(paragraph(week.label || `${c('week')} ${weekIndex + 1}`, { style: 'Heading2', strong: true, size: 24, bidi }));
      const rows = [[c('day'), c('session'), c('distance'), c('duration')]];
      week.days.forEach(day => {
        const header = [day.label || '', day.date || ''].filter(Boolean).join('\n');
        const session = [day.type || '', day.title || '', ...(day.lines || [])].filter(Boolean).join('\n');
        rows.push([header, session || c('rest'), day.distance || '—', day.duration || '—']);
        (day.extras || []).forEach(extra => {
          rows.push(['', [extra.title || '', ...extra.lines].filter(Boolean).join('\n'), extra.distance || '—', extra.duration || '—']);
        });
      });
      parts.push(table(rows, [1700, 5200, 1200, 1200]));
    });
    if (payload.note) {
      parts.push(paragraph(''));
      parts.push(paragraph(c('coachNote'), { style: 'Heading2', strong: true, size: 24, bidi }));
      parts.push(paragraph(payload.note, { bidi }));
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
      parts.join('') +
      `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>` +
      `</w:body></w:document>`;
  }

  const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `</Types>`;

  const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
    `</Relationships>`;

  const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Tahoma"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/></w:style>` +
    `</w:styles>`;

  function docxBytes(payload) {
    const now = new Date().toISOString();
    const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
      `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ` +
      `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>${esc(payload.title || 'Training Program')}</dc:title><dc:creator>MZ Active</dc:creator>` +
      `<cp:lastModifiedBy>MZ Active</cp:lastModifiedBy>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
      `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
    const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ` +
      `xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
      `<Application>MZ Active</Application></Properties>`;
    return zipStore([
      { name: '[Content_Types].xml', data: CONTENT_TYPES },
      { name: '_rels/.rels', data: ROOT_RELS },
      { name: 'word/document.xml', data: documentXml(payload) },
      { name: 'word/_rels/document.xml.rels', data: DOC_RELS },
      { name: 'word/styles.xml', data: STYLES },
      { name: 'docProps/core.xml', data: core },
      { name: 'docProps/app.xml', data: app },
    ]);
  }

  function fileName(payload) {
    const base = `${payload.athlete || 'athlete'}-${payload.title || 'training-program'}`
      .toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, '-').replace(/^-|-$/g, '') || 'training-program';
    return `${base}.docx`;
  }

  function save(payload) {
    try { sessionStorage.setItem(KEY, JSON.stringify(payload)); return true; } catch { return false; }
  }

  function load() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; }
  }

  function downloadDocx(payload) {
    const bytes = docxBytes(payload);
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName(payload);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return blob;
  }

  function docxFile(payload) {
    return new File([docxBytes(payload)], fileName(payload), {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  async function shareDocument(payload) {
    if (!navigator.share || typeof File === 'undefined') return false;
    try {
      await navigator.share({
        files: [docxFile(payload)],
        title: payload.title || 'Training Program',
        text: `${t(payload.lang, 'athlete')}: ${payload.athlete || ''}`,
      });
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') return true;
      return false;
    }
  }

  function digits(value) { return String(value || '').replace(/\D/g, ''); }

  function textFallbackUrl(payload) {
    const number = digits(payload.whatsapp_phone);
    const lines = [t(payload.lang, 'athlete') + ': ' + (payload.athlete || '')];
    (payload.weeks || []).forEach(week => {
      (week.days || []).forEach(day => {
        lines.push(`${day.label || ''} ${day.date || ''}: ${[day.title, ...(day.lines || [])].filter(Boolean).join(' · ')}`);
      });
    });
    if (payload.note) lines.push(`${t(payload.lang, 'coachNote')}: ${payload.note}`);
    lines.push(t(payload.lang, 'fallbackInfo'));
    return `https://wa.me/${number}?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  /* ---------- Print-ready preview ---------- */
  function renderPreview(payload, mount) {
    if (!mount || !payload) return;
    const lang = payload.lang === 'ar' ? 'ar' : 'en';
    const c = key => t(lang, key);
    mount.replaceChildren();
    const doc = document.createElement('article');
    doc.className = 'program-doc';
    doc.dir = lang === 'ar' ? 'rtl' : 'ltr';
    const heading = (text, cls) => { const node = document.createElement(cls === 'brand' ? 'p' : 'h2'); node.className = cls; node.textContent = text; return node; };
    doc.append(heading(c('brand'), 'brand'));
    const coach = document.createElement('p');
    coach.className = 'doc-coach';
    coach.textContent = `${c('coach')}: ${payload.coach || ''}`;
    doc.append(coach);
    doc.append(heading(payload.athlete || c('athlete'), 'doc-athlete'));
    doc.append(heading(String(payload.title || c('program')).toUpperCase(), 'doc-title'));
    const range = document.createElement('p');
    range.className = 'doc-range';
    range.textContent = payload.date_range || '';
    doc.append(range);
    (payload.weeks || []).forEach((week, index) => {
      if (index) {
        const page = document.createElement('div');
        page.className = 'doc-page-break';
        doc.append(page);
      }
      doc.append(heading(week.label || `${c('week')} ${index + 1}`, 'doc-week'));
      const table = document.createElement('table');
      table.className = 'doc-table';
      const head = document.createElement('thead');
      const headRow = document.createElement('tr');
      [c('day'), c('session'), c('distance'), c('duration')].forEach(label => {
        const th = document.createElement('th');
        th.textContent = label;
        headRow.append(th);
      });
      head.append(headRow);
      table.append(head);
      const body = document.createElement('tbody');
      (week.days || []).forEach(day => {
        const row = document.createElement('tr');
        if (day.isRest) row.className = 'rest-row';
        [([day.label || '', day.date || ''].filter(Boolean).join('\n')),
          [day.type || '', day.title || '', ...(day.lines || [])].filter(Boolean).join('\n'),
          day.distance || '—', day.duration || '—'].forEach(cell => {
          const td = document.createElement('td');
          td.textContent = cell;
          row.append(td);
        });
        body.append(row);
        (day.extras || []).forEach(extra => {
          const extraRow = document.createElement('tr');
          ['', [extra.title || '', ...extra.lines].filter(Boolean).join('\n'), extra.distance || '—', extra.duration || '—'].forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell;
            extraRow.append(td);
          });
          body.append(extraRow);
        });
      });
      table.append(body);
      doc.append(table);
    });
    if (payload.note) {
      doc.append(heading(c('coachNote'), 'doc-week'));
      const note = document.createElement('p');
      note.className = 'doc-note';
      note.textContent = payload.note;
      doc.append(note);
    }
    mount.append(doc);
  }

  window.MZAProgramDocument = {
    KEY, COPY, fromForm, parseWorkout, dateLabel, save, load,
    docxBytes, downloadDocx, docxFile, shareDocument, textFallbackUrl,
    renderPreview, translate: t,
  };
})();
