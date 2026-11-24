/**
 * Pure Client-Side Question Bank Importer & Exporter (Zero External Dependencies)
 * Supports:
 * - CSV (UTF-8-BOM / UTF-8 / GB18030 / GBK auto-detect, RFC 4180 multi-line quotes)
 * - XLSX (Pure-JS ZIP + native DecompressionStream reader & OpenXML XLSX writer)
 * - JSON (lossless bank / full backup)
 */

window.ST = window.ST || {};

const QTYPE_META = {
  single: { label: '单选题', short: '单选', cls: 'badge-single' },
  multiple: { label: '多选题', short: '多选', cls: 'badge-multiple' },
  judge: { label: '判断题', short: '判断', cls: 'badge-judge' },
  short: { label: '简答题', short: '简答', cls: 'badge-short' },
};

const QTYPE_MAP = {
  单选题: 'single', 单选: 'single', 单项选择: 'single', 单项选择题: 'single', single: 'single', single_choice: 'single', radio: 'single',
  多选题: 'multiple', 多选: 'multiple', 多项选择: 'multiple', 多项选择题: 'multiple', multiple: 'multiple', multi: 'multiple', multiple_choice: 'multiple', checkbox: 'multiple',
  判断题: 'judge', 判断: 'judge', 是非题: 'judge', 对错题: 'judge', judge: 'judge', true_false: 'judge', tf: 'judge', boolean: 'judge',
  简答题: 'short', 简答: 'short', 问答题: 'short', 问答: 'short', 论述题: 'short', 计算题: 'short', 案例分析: 'short', 案例分析题: 'short', 分析题: 'short', 主观题: 'short', 填空题: 'short', short: 'short', short_answer: 'short', essay: 'short',
};

const JUDGE_TRUE = new Set(['A', '正确', '对', '是', 'T', 'TRUE', 'YES', 'Y', '1', '√', '✔']);
const JUDGE_FALSE = new Set(['B', '错误', '错', '否', 'F', 'FALSE', 'NO', 'N', '0', '×', '✕', '✗']);

const STANDARD_HEADERS = [
  '适用等级', '难度', '答题分数', '答题时间', '试题编号', '题型', '试题正文',
  '试题选项', '试题答案', '自变参数选项', '参数M数据集', '应变参数内容',
  '答案解析', '答案要点及评分标准', '依据 出处', '出题人', '备注',
];

const HEADER_ALIASES = {
  code: ['试题编号', '试题编码', '题号', '编号', '题目编号', 'code', 'id'],
  qtype: ['题型', '题目类型', '类型', '试题类型', 'qtype', 'type'],
  content: ['试题正文', '题干', '题目', '试题内容', '题目内容', '问题', 'content', 'question', 'stem'],
  options: ['试题选项', '选项', '备选项', 'options', 'choices'],
  answer: ['试题答案', '正确答案', '标准答案', '参考答案', '答案', 'answer'],
  explanation: ['答案解析', '判断题解析', '解析', '题目解析', '详解', 'explanation', 'analysis'],
  scoring_criteria: ['答案要点及评分标准', '评分标准', '得分要点', '答案要点', '评分要点', 'scoring_criteria', 'rubric'],
  category: ['依据出处', '二级纲要', '出处', '知识点', '分类', '章节', '模块', '专业分类', 'category', 'chapter', 'source'],
  difficulty: ['难度', '难易度', '难度等级', 'difficulty'],
  level: ['适用等级', '等级', '级别', 'level'],
  default_score: ['答题分数', '试题分数', '分值', '分数', '默认分值', 'default_score', 'score'],
  default_time: ['答题时间', '建议用时', '时间', 'default_time'],
  author: ['出题人', '作者', '命题人', 'author'],
  remark: ['备注', '说明', 'remark', 'note'],
};

const OPTION_COL_ALIASES = [
  ['选项a', 'a', 'optiona', 'option_a'],
  ['选项b', 'b', 'optionb', 'option_b'],
  ['选项c', 'c', 'optionc', 'option_c'],
  ['选项d', 'd', 'optiond', 'option_d'],
  ['选项e', 'e', 'optione', 'option_e'],
  ['选项f', 'f', 'optionf', 'option_f'],
  ['选项g', 'g', 'optiong', 'option_g'],
  ['选项h', 'h', 'optionh', 'option_h'],
];

function normHeader(name) {
  return String(name || '').trim().toLowerCase().replace(/[\s\u3000_\-/\\]+/g, '');
}

function cleanOptionText(text) {
  let s = String(text || '').trim();
  s = s.replace(/\r?\n+/g, '').trim();
  s = s.replace(/^[（(]?[A-Ha-h][）)]?\s*[、\.．\)）:：\-—]\s*/, '').trim();
  return s;
}

function safeFloat(val, fallback) {
  const n = parseFloat(String(val ?? '').trim());
  return Number.isFinite(n) ? n : fallback;
}

function normalizeQtype(raw, hasOptions, rawAnswer) {
  const s = String(raw || '').trim();
  const k = s.toLowerCase();
  if (QTYPE_MAP[s]) return QTYPE_MAP[s];
  if (QTYPE_MAP[k]) return QTYPE_MAP[k];
  if (s.includes('单选')) return 'single';
  if (s.includes('多选')) return 'multiple';
  if (s.includes('判断') || s.includes('是非')) return 'judge';
  if (/简答|问答|论述|计算|案例|主观|填空/.test(s)) return 'short';
  const ans = String(rawAnswer || '').trim().toUpperCase();
  if (!hasOptions) {
    if (JUDGE_TRUE.has(ans) || JUDGE_FALSE.has(ans)) return 'judge';
    if (ans) return 'short';
  } else {
    const letters = ans.match(/[A-H]/g) || [];
    if (letters.length > 1) return 'multiple';
    if (letters.length === 1) return 'single';
  }
  return null;
}

function parseOptionsField(rawOpts) {
  if (Array.isArray(rawOpts)) {
    return rawOpts.map(cleanOptionText).filter(Boolean);
  }
  const s = String(rawOpts || '').trim();
  if (!s) return [];
  let parts;
  if (s.includes('$;$')) {
    parts = s.split('$;$');
  } else if (s.includes('||')) {
    parts = s.split('||');
  } else if (s.includes('\n') && /(?:^|\n)\s*[A-Ha-h]\s*[、\.．\)）:：]/.test(s)) {
    parts = s.split(/\r?\n+/);
  } else if (s.includes('|')) {
    parts = s.split('|');
  } else if (s.includes('\n')) {
    parts = s.split(/\r?\n+/);
  } else {
    parts = [s];
  }
  return parts.map(cleanOptionText).filter(Boolean);
}

function normalizeAnswer(qtype, rawAns, options = []) {
  const s = String(rawAns ?? '').trim();
  if (qtype === 'judge') {
    const u = s.toUpperCase();
    if (JUDGE_TRUE.has(u) || JUDGE_TRUE.has(s) || s.includes('正确') || s.includes('对')) return 'A';
    if (JUDGE_FALSE.has(u) || JUDGE_FALSE.has(s) || s.includes('错误') || s.includes('错')) return 'B';
    return '';
  }
  if (qtype === 'single') {
    const u = s.toUpperCase();
    const letters = u.match(/[A-H]/g) || [];
    if (letters.length && u.replace(/[\s,，、\.．;；]/g, '').length <= 2) {
      return letters[0];
    }
    const idx = options.findIndex((o) => o.trim() === s);
    if (idx >= 0) return String.fromCharCode(65 + idx);
    return letters[0] || '';
  }
  if (qtype === 'multiple') {
    const u = s.toUpperCase();
    const letters = [...new Set(u.match(/[A-H]/g) || [])].sort();
    if (letters.length) return letters.join('');
    const parts = s.split(/[\$;\|,，、\n]+/).map((x) => x.trim()).filter(Boolean);
    const matched = [];
    options.forEach((o, i) => {
      if (parts.includes(o.trim())) matched.push(String.fromCharCode(65 + i));
    });
    return [...new Set(matched)].sort().join('');
  }
  return s;
}

// ---------------------------------------------------------------------------
// Text Decoding & RFC 4180 CSV Parser
// ---------------------------------------------------------------------------

function decodeBytesToText(uint8) {
  // Strip UTF-8 BOM if present
  if (uint8.length >= 3 && uint8[0] === 0xef && uint8[1] === 0xbb && uint8[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(uint8.subarray(3));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(uint8);
  } catch {
    try {
      return new TextDecoder('gb18030').decode(uint8);
    } catch {
      return new TextDecoder('utf-8').decode(uint8);
    }
  }
}

function parseCsvMatrix(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i += 1;
      } else if (ch === ',') {
        row.push(field);
        field = '';
        i += 1;
      } else if (ch === '\r') {
        row.push(field);
        field = '';
        if (row.some((c) => c.trim())) rows.push(row);
        row = [];
        i += (i + 1 < len && text[i + 1] === '\n') ? 2 : 1;
      } else if (ch === '\n') {
        row.push(field);
        field = '';
        if (row.some((c) => c.trim())) rows.push(row);
        row = [];
        i += 1;
      } else {
        field += ch;
        i += 1;
      }
    }
  }
  row.push(field);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

// ---------------------------------------------------------------------------
// Pure-JS XLSX Reader (ZIP + native DecompressionStream('deflate-raw'))
// ---------------------------------------------------------------------------

async function inflateRaw(compressedBytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前浏览器版本暂不支持离线解析 .xlsx，请先另存为 .csv 格式后导入');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(compressedBytes);
  writer.close();
  const ab = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(ab);
}

async function unzipEntries(uint8) {
  const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
  // Find End of Central Directory (0x06054b50) scanning backwards
  let eocdOffset = -1;
  const minPos = Math.max(0, uint8.length - 65558);
  for (let i = uint8.length - 22; i >= minPos; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('无效的 .xlsx 文件（非标准 ZIP 结构）');

  const cdEntries = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8');
  const files = {};

  for (let e = 0; e < cdEntries; e++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) break;
    const method = view.getUint16(cdOffset + 10, true);
    const compSize = view.getUint32(cdOffset + 20, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localHeaderOff = view.getUint32(cdOffset + 42, true);
    const name = decoder.decode(uint8.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
    cdOffset += 46 + nameLen + extraLen + commentLen;

    if (!name.startsWith('xl/')) continue;
    const lhNameLen = view.getUint16(localHeaderOff + 26, true);
    const lhExtraLen = view.getUint16(localHeaderOff + 28, true);
    const dataStart = localHeaderOff + 30 + lhNameLen + lhExtraLen;
    const rawSlice = uint8.subarray(dataStart, dataStart + compSize);

    if (method === 0) {
      files[name] = rawSlice;
    } else if (method === 8) {
      files[name] = await inflateRaw(rawSlice);
    }
  }
  return files;
}

function colLettersToIdx(letters) {
  let idx = 0;
  for (const ch of letters.toUpperCase()) {
    idx = idx * 26 + (ch.charCodeAt(0) - 64);
  }
  return idx - 1;
}

async function parseXlsxMatrix(uint8) {
  const files = await unzipEntries(uint8);
  const decoder = new TextDecoder('utf-8');
  const parser = new DOMParser();

  const sharedStrings = [];
  if (files['xl/sharedStrings.xml']) {
    const doc = parser.parseFromString(decoder.decode(files['xl/sharedStrings.xml']), 'application/xml');
    const sis = doc.getElementsByTagName('si');
    for (let i = 0; i < sis.length; i++) {
      const ts = sis[i].getElementsByTagName('t');
      let str = '';
      for (let j = 0; j < ts.length; j++) str += ts[j].textContent || '';
      sharedStrings.push(str);
    }
  }

  let sheetKey = files['xl/worksheets/sheet1.xml'] ? 'xl/worksheets/sheet1.xml' : null;
  if (!sheetKey) {
    sheetKey = Object.keys(files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  }
  if (!sheetKey) throw new Error('Excel 文件中未找到有效工作表');

  const sheetDoc = parser.parseFromString(decoder.decode(files[sheetKey]), 'application/xml');
  const rowEls = sheetDoc.getElementsByTagName('row');
  const matrix = [];

  for (let r = 0; r < rowEls.length; r++) {
    const cEls = rowEls[r].getElementsByTagName('c');
    const cells = {};
    let maxCol = -1;
    let nextCol = 0;
    for (let c = 0; c < cEls.length; c++) {
      const el = cEls[c];
      const ref = el.getAttribute('r') || '';
      const m = ref.match(/^([A-Za-z]+)/);
      const colIdx = m ? colLettersToIdx(m[1]) : nextCol;
      nextCol = colIdx + 1;

      const t = el.getAttribute('t') || '';
      let val = '';
      if (t === 'inlineStr') {
        const ts = el.getElementsByTagName('t');
        for (let k = 0; k < ts.length; k++) val += ts[k].textContent || '';
      } else {
        const vEl = el.getElementsByTagName('v')[0];
        if (vEl && vEl.textContent !== null) {
          if (t === 's') {
            const si = parseInt(vEl.textContent, 10);
            val = sharedStrings[si] ?? vEl.textContent;
          } else if (t === 'b') {
            val = vEl.textContent === '1' ? 'TRUE' : 'FALSE';
          } else {
            val = vEl.textContent;
          }
        }
      }
      cells[colIdx] = val;
      if (colIdx > maxCol) maxCol = colIdx;
    }
    if (maxCol >= 0) {
      const arr = [];
      for (let k = 0; k <= maxCol; k++) arr.push(cells[k] ?? '');
      if (arr.some((x) => String(x).trim())) matrix.push(arr);
    }
  }
  return matrix;
}

function matrixToDicts(rows) {
  if (!rows.length) return [];
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (rows[i].filter((c) => String(c || '').trim()).length >= 2) {
      headerIdx = i;
      break;
    }
  }
  const headers = rows[headerIdx].map((h) => String(h || '').trim());
  const out = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r.some((c) => String(c || '').trim())) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = r[idx] !== undefined ? String(r[idx]) : '';
    });
    out.push(obj);
  }
  return out;
}

function extractField(normRow, key) {
  for (const alias of HEADER_ALIASES[key]) {
    const ak = normHeader(alias);
    if (normRow[ak] !== undefined && normRow[ak] !== null && String(normRow[ak]).trim() !== '') {
      return normRow[ak];
    }
  }
  return '';
}

async function parseQuestionFile(file) {
  const filename = file.name || 'import.csv';
  const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : 'csv';
  const ab = await file.arrayBuffer();
  const uint8 = new Uint8Array(ab);

  let rawDicts = [];
  const isZipMagic = uint8.length >= 4 && uint8[0] === 0x50 && uint8[1] === 0x4b && uint8[2] === 0x03 && uint8[3] === 0x04;
  if (ext === 'json') {
    const parsed = JSON.parse(decodeBytesToText(uint8));
    if (Array.isArray(parsed)) rawDicts = parsed;
    else if (parsed && Array.isArray(parsed.questions)) rawDicts = parsed.questions;
    else throw new Error('JSON 格式无效：应为题目数组或含 questions 字段的对象');
  } else if (ext === 'xlsx' || (ext === 'xls' && isZipMagic)) {
    const matrix = await parseXlsxMatrix(uint8);
    rawDicts = matrixToDicts(matrix);
  } else if (ext === 'csv' || ext === 'txt') {
    const matrix = parseCsvMatrix(decodeBytesToText(uint8));
    rawDicts = matrixToDicts(matrix);
  } else if (ext === 'xls') {
    throw new Error('该 .xls 为旧版二进制 Excel 格式，请先在 Excel/WPS 中另存为 .xlsx 或 .csv 后导入');
  } else {
    throw new Error(`暂不支持 .${ext} 格式（支持 .csv、.xlsx、.json）`);
  }

  const questions = [];
  const warnings = [];

  rawDicts.forEach((row, idx) => {
    const lineNo = idx + 1;
    if (!row || typeof row !== 'object') {
      warnings.push(`第 ${lineNo} 条数据无效，已跳过`);
      return;
    }
    const normRow = {};
    Object.entries(row).forEach(([k, v]) => { normRow[normHeader(k)] = v; });

    const content = String(extractField(normRow, 'content') || '').trim();
    if (!content) {
      warnings.push(`第 ${lineNo} 行缺少试题正文，已跳过`);
      return;
    }

    let options = parseOptionsField(extractField(normRow, 'options'));
    if (!options.length) {
      const sep = [];
      for (const aliases of OPTION_COL_ALIASES) {
        let found = '';
        for (const a of aliases) {
          const ak = normHeader(a);
          if (normRow[ak] && String(normRow[ak]).trim()) {
            found = cleanOptionText(normRow[ak]);
            break;
          }
        }
        if (found) sep.push(found);
      }
      options = sep;
    }

    const rawAnswer = String(extractField(normRow, 'answer') || '').trim();
    const rawQtype = extractField(normRow, 'qtype');
    const qtype = normalizeQtype(rawQtype, options.length > 0, rawAnswer);

    if (!qtype) {
      warnings.push(`第 ${lineNo} 行无法识别题型（${rawQtype}），已跳过`);
      return;
    }
    if (qtype === 'judge') {
      options = ['正确', '错误'];
    } else if (qtype === 'short') {
      options = [];
    } else if (options.length < 2) {
      warnings.push(`第 ${lineNo} 行（${QTYPE_META[qtype].label}）选项不足 2 个，已跳过`);
      return;
    }

    let answer = normalizeAnswer(qtype, rawAnswer, options);
    if (!answer) {
      warnings.push(`第 ${lineNo} 行缺少有效答案（原始值：${rawAnswer}），已跳过`);
      return;
    }
    if (qtype === 'single' || qtype === 'multiple') {
      const maxLetter = String.fromCharCode(65 + options.length - 1);
      const valid = answer.split('').filter((ch) => ch >= 'A' && ch <= maxLetter);
      if (!valid.length) {
        warnings.push(`第 ${lineNo} 行答案 ${answer} 超出选项范围（A-${maxLetter}），已跳过`);
        return;
      }
      answer = valid.join('');
    }

    questions.push({
      code: String(extractField(normRow, 'code') || '').trim(),
      qtype,
      content,
      options,
      answer,
      explanation: String(extractField(normRow, 'explanation') || '').trim(),
      scoring_criteria: String(extractField(normRow, 'scoring_criteria') || '').trim(),
      category: String(extractField(normRow, 'category') || '').trim() || '未分类',
      difficulty: String(extractField(normRow, 'difficulty') || '').trim() || '中',
      level: String(extractField(normRow, 'level') || '').trim(),
      default_score: safeFloat(extractField(normRow, 'default_score'), 1.0),
      default_time: safeFloat(extractField(normRow, 'default_time'), 0.6),
      author: String(extractField(normRow, 'author') || '').trim(),
      remark: String(extractField(normRow, 'remark') || '').trim(),
    });
  });

  const by_type = { single: 0, multiple: 0, judge: 0, short: 0 };
  questions.forEach((q) => { by_type[q.qtype] = (by_type[q.qtype] || 0) + 1; });

  return {
    filename,
    suggested_bank_name: filename.replace(/\.[^.]+$/, ''),
    questions,
    total: questions.length,
    by_type,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Exporters (CSV UTF-8-BOM + Pure-JS XLSX Store-ZIP + JSON + Templates)
// ---------------------------------------------------------------------------

function csvCell(v) {
  const s = String(v ?? '');
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function questionToStandardRow(q) {
  const optsStr = (q.qtype === 'single' || q.qtype === 'multiple') ? (q.options || []).join('$;$') : '';
  return [
    q.level || '',
    q.difficulty || '中',
    q.default_score ?? 1,
    q.default_time ?? 0.6,
    q.code || '',
    QTYPE_META[q.qtype]?.label || q.qtype,
    q.content || '',
    optsStr,
    q.answer || '',
    '', '', '',
    q.explanation || '',
    q.scoring_criteria || '',
    q.category || '',
    q.author || '',
    q.remark || '',
  ];
}

function exportQuestionsCsvBlob(questions) {
  const lines = [STANDARD_HEADERS.map(csvCell).join(',')];
  questions.forEach((q) => lines.push(questionToStandardRow(q).map(csvCell).join(',')));
  return new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

// Pure-JS CRC32 & Store-ZIP XLSX builder (zero external libraries!)
const CRC_TABLE = (() => {
  const tbl = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    tbl[i] = c >>> 0;
  }
  return tbl;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buildZipStore(entries) {
  const enc = new TextEncoder();
  const localParts = [];
  const cdParts = [];
  let offset = 0;

  for (const [name, contentStr] of entries) {
    const nameBytes = enc.encode(name);
    const dataBytes = typeof contentStr === 'string' ? enc.encode(contentStr) : contentStr;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    const lh = new ArrayBuffer(30 + nameBytes.length);
    const lv = new DataView(lh);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8
    lv.setUint16(8, 0, true); // Store
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    new Uint8Array(lh, 30).set(nameBytes);
    localParts.push(new Uint8Array(lh), dataBytes);

    const cd = new ArrayBuffer(46 + nameBytes.length);
    const cv = new DataView(cd);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    new Uint8Array(cd, 46).set(nameBytes);
    cdParts.push(new Uint8Array(cd));

    offset += 30 + nameBytes.length + size;
  }

  const cdSize = cdParts.reduce((a, b) => a + b.length, 0);
  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...localParts, ...cdParts, new Uint8Array(eocd)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function xmlEsc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

function colIdxToLetter(idx) {
  let n = idx + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function exportQuestionsXlsxBlob(questions) {
  const allRows = [STANDARD_HEADERS, ...questions.map(questionToStandardRow)];
  const rowsXml = allRows.map((row, rIdx) => {
    const rNum = rIdx + 1;
    const cellsXml = row.map((val, cIdx) => {
      const ref = `${colIdxToLetter(cIdx)}${rNum}`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(val)}</t></is></c>`;
    }).join('');
    return `<row r="${rNum}">${cellsXml}</row>`;
  }).join('');

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const wbXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="题库" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowsXml}</sheetData>
</worksheet>`;

  return buildZipStore([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rels],
    ['xl/workbook.xml', wbXml],
    ['xl/_rels/workbook.xml.rels', wbRels],
    ['xl/worksheets/sheet1.xml', sheetXml],
  ]);
}

function getTemplateQuestions() {
  return [
    {
      level: '1.0', difficulty: '中', default_score: 1, default_time: 0.6,
      code: 'DEMO001', qtype: 'single',
      content: '馈线自动化三个主要阶段的先后顺序是（）。',
      options: ['故障定位、故障隔离、故障恢复', '故障定位、故障恢复、故障隔离', '故障隔离、故障恢复、故障定位', '故障隔离、故障定位、故障恢复'],
      answer: 'A',
      explanation: '馈线自动化处理故障依次为：定位故障区段、隔离故障区域、恢复非故障区段供电。',
      scoring_criteria: '', category: '示例章节', author: '模板示例',
      remark: '单选题示例：选项使用 $;$ 分隔，答案为单个字母',
    },
    {
      level: '1.0', difficulty: '中', default_score: 2, default_time: 1.0,
      code: 'DEMO002', qtype: 'multiple',
      content: '现场配电终端主要通过（）、（）等通信方式接入配电自动化系统。',
      options: ['光纤', '无线网络', '红外', '电缆'],
      answer: 'AB',
      explanation: '现场配电终端常见通信方式为光纤通信和无线网络通信。',
      scoring_criteria: '', category: '示例章节', author: '模板示例',
      remark: '多选题示例：答案为多个字母组合（如 AB 或 ABCD）',
    },
    {
      level: '1.0', difficulty: '易', default_score: 1, default_time: 0.5,
      code: 'DEMO003', qtype: 'judge',
      content: '配电自动化系统主站简称为配电主站。',
      options: ['正确', '错误'],
      answer: 'A',
      explanation: '判断题答案填 A/正确/对 表示正确，填 B/错误/错 表示错误。',
      scoring_criteria: '', category: '示例章节', author: '模板示例',
      remark: '判断题示例：试题选项可留空',
    },
    {
      level: '1.0', difficulty: '难', default_score: 5, default_time: 3.0,
      code: 'DEMO004', qtype: 'short',
      content: '简述集中型馈线自动化与就地型馈线自动化的主要区别。',
      options: [],
      answer: '集中型馈线自动化依赖高可靠通信网络，将各终端采集的故障信息上传至配电主站，由主站统一分析并下发遥控命令完成故障定位、隔离与非故障区段恢复供电；就地型馈线自动化不依赖主站全局控制，依靠现场自动化开关及终端自身逻辑或终端间对等通信就地完成故障处理。',
      explanation: '重点区分是否依赖主站集中决策与通信条件要求。',
      scoring_criteria: '1. 答出集中型依赖主站与通信（2.5分）；2. 答出就地型依靠现场开关/终端就地逻辑或对等通信（2.5分）。',
      category: '示例章节', author: '模板示例',
      remark: '简答题示例：试题选项留空，试题答案填参考答案，答案要点及评分标准可用于考后自评打分',
    },
  ];
}

function triggerDownloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 300);
}

window.ST.QTYPE_META = QTYPE_META;
window.ST.Importer = {
  normalizeAnswer,
  parseQuestionFile,
  exportQuestionsCsvBlob,
  exportQuestionsXlsxBlob,
  getTemplateQuestions,
  triggerDownloadBlob,
};
