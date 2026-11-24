/**
 * Pure Client-Side IndexedDB Database & Exam/Practice Engine for 刷题神器 PWA
 * 100% offline capable, zero backend dependencies.
 */

window.ST = window.ST || {};

const DB_NAME = 'ShuaTiShenQiPWA_v1';
const DB_VERSION = 1;

const DEFAULT_SETTINGS = {
  theme: 'light', // 'light' | 'eyecare' | 'dark'
  font_size: 'md', // 'sm' | 'md' | 'lg'
  practice_answer_mode: false, // false = 答题模式(无答案), true = 背题模式(有答案)
  practice_auto_next: false,
  wrong_auto_remove: false,
  active_bank_id: null,
  last_exam_config: {
    bank_id: null,
    category: '',
    counts: { single: 20, multiple: 10, judge: 10, short: 0 },
    scores: { single: 1, multiple: 2, judge: 1, short: 5 },
    duration_minutes: 45,
    pass_score: 30,
    instant_feedback: false,
    shuffle_options: true,
    prioritize_wrong: true,
    prioritize_unseen: true,
    partial_multi_score: false,
  },
};

function nowStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAnswerLabel(qtype, answer) {
  if (!answer) return '未作答';
  if (qtype === 'judge') {
    return answer === 'A' ? '正确（A）' : answer === 'B' ? '错误（B）' : answer;
  }
  return answer;
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${p(h)}:${p(m)}:${p(r)}` : `${p(m)}:${p(r)}`;
}

function formatNum(n) {
  const v = Number(n || 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
}

function qtypeBadgeHtml(qtype) {
  const m = window.ST.QTYPE_META[qtype] || { label: qtype, cls: 'badge-neutral' };
  return `<span class="badge ${m.cls}">${escapeHtml(m.label)}</span>`;
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function defaultStats(qid) {
  return {
    question_id: qid,
    attempt_count: 0,
    correct_count: 0,
    wrong_count: 0,
    in_wrong_book: false,
    bookmarked: false,
    note: '',
    last_user_answer: '',
    last_is_correct: null,
    last_practiced_at: '',
  };
}

class LocalQuizDB {
  constructor() {
    this._db = null;
  }

  async open() {
    if (this._db) return this._db;
    this._db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('banks')) {
          db.createObjectStore('banks', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('questions')) {
          const qs = db.createObjectStore('questions', { keyPath: 'id', autoIncrement: true });
          qs.createIndex('bank_id', 'bank_id', { unique: false });
          qs.createIndex('qtype', 'qtype', { unique: false });
        }
        if (!db.objectStoreNames.contains('stats')) {
          db.createObjectStore('stats', { keyPath: 'question_id' });
        }
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'scope_key' });
        }
        if (!db.objectStoreNames.contains('exams')) {
          db.createObjectStore('exams', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this._db;
  }

  _req(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async _getAll(storeName) {
    const db = await this.open();
    const tx = db.transaction(storeName, 'readonly');
    return this._req(tx.objectStore(storeName).getAll());
  }

  async _get(storeName, key) {
    const db = await this.open();
    const tx = db.transaction(storeName, 'readonly');
    return this._req(tx.objectStore(storeName).get(key));
  }

  async _put(storeName, value) {
    const db = await this.open();
    const tx = db.transaction(storeName, 'readwrite');
    return this._req(tx.objectStore(storeName).put(value));
  }

  async _add(storeName, value) {
    const db = await this.open();
    const tx = db.transaction(storeName, 'readwrite');
    return this._req(tx.objectStore(storeName).add(value));
  }

  async _delete(storeName, key) {
    const db = await this.open();
    const tx = db.transaction(storeName, 'readwrite');
    return this._req(tx.objectStore(storeName).delete(key));
  }

  async ensureSeeded() {
    await this.open();
    const banks = await this._getAll('banks');
    if (banks.length > 0) return;

    try {
      const resp = await fetch('./data/initial_bank.json');
      if (!resp.ok) return;
      const data = await resp.json();
      if (data && Array.isArray(data.questions) && data.questions.length > 0) {
        const res = await this.importQuestions({
          questions: data.questions,
          bankName: data.bank?.name || '配电自动化题库',
          description: data.bank?.description || '',
          sourceFile: data.bank?.source_file || 'initial_bank.csv',
          skipDuplicates: true,
        });
        await this.updateSettings({ active_bank_id: res.bank_id });
      }
    } catch (err) {
      console.warn('Seed initial_bank.json skipped:', err);
    }
  }

  // ------------------------------------------------------------------
  // Settings
  // ------------------------------------------------------------------

  async getSettings() {
    const rows = await this._getAll('settings');
    const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    rows.forEach((r) => { out[r.key] = r.value; });
    return out;
  }

  async updateSettings(updates) {
    const db = await this.open();
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    for (const [key, value] of Object.entries(updates)) {
      store.put({ key, value });
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return this.getSettings();
  }

  // ------------------------------------------------------------------
  // Banks
  // ------------------------------------------------------------------

  async listBanks() {
    const [banks, questions, statsList] = await Promise.all([
      this._getAll('banks'),
      this._getAll('questions'),
      this._getAll('stats'),
    ]);
    const statsMap = new Map(statsList.map((s) => [s.question_id, s]));

    return banks
      .sort((a, b) => a.id - b.id)
      .map((b) => {
        const bqs = questions.filter((q) => q.bank_id === b.id);
        const counts = { single: 0, multiple: 0, judge: 0, short: 0 };
        let practiced = 0;
        let wrong = 0;
        let bookmarked = 0;
        for (const q of bqs) {
          counts[q.qtype] = (counts[q.qtype] || 0) + 1;
          const s = statsMap.get(q.id);
          if (s) {
            if (s.attempt_count > 0) practiced++;
            if (s.in_wrong_book) wrong++;
            if (s.bookmarked) bookmarked++;
          }
        }
        return {
          ...b,
          total_count: bqs.length,
          counts,
          practiced_count: practiced,
          wrong_count: wrong,
          bookmark_count: bookmarked,
        };
      });
  }

  async createBank(name, description = '', sourceFile = '') {
    const now = nowStr();
    const id = await this._add('banks', {
      name: String(name || '').trim(),
      description: String(description || '').trim(),
      source_file: String(sourceFile || '').trim(),
      created_at: now,
      updated_at: now,
    });
    const list = await this.listBanks();
    return list.find((b) => b.id === id);
  }

  async updateBank(bankId, name, description = '') {
    const bank = await this._get('banks', bankId);
    if (!bank) throw new Error('题库不存在');
    bank.name = String(name || '').trim();
    bank.description = String(description || '').trim();
    bank.updated_at = nowStr();
    await this._put('banks', bank);
    const list = await this.listBanks();
    return list.find((b) => b.id === bankId);
  }

  async deleteBank(bankId) {
    const questions = await this._getAll('questions');
    const delIds = questions.filter((q) => q.bank_id === bankId).map((q) => q.id);
    const db = await this.open();
    const tx = db.transaction(['banks', 'questions', 'stats'], 'readwrite');
    tx.objectStore('banks').delete(bankId);
    const qStore = tx.objectStore('questions');
    const sStore = tx.objectStore('stats');
    for (const qid of delIds) {
      qStore.delete(qid);
      sStore.delete(qid);
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return true;
  }

  async importQuestions({
    questions,
    bankId = null,
    bankName = '',
    description = '',
    sourceFile = '',
    skipDuplicates = true,
  }) {
    const now = nowStr();
    let targetBankId = bankId ? Number(bankId) : null;
    if (!targetBankId) {
      const created = await this.createBank(
        (bankName || '').trim() || `导入题库 ${now.slice(0, 10)}`,
        description,
        sourceFile
      );
      targetBankId = created.id;
    } else {
      const bank = await this._get('banks', targetBankId);
      if (!bank) throw new Error('目标题库不存在');
      bank.updated_at = now;
      await this._put('banks', bank);
    }

    const allExisting = (await this._getAll('questions')).filter((q) => q.bank_id === targetBankId);
    const existingCodes = new Set(allExisting.map((q) => (q.code || '').trim()).filter(Boolean));
    const existingKeys = new Set(allExisting.map((q) => `${q.qtype}||${(q.content || '').trim()}`));

    const db = await this.open();
    const tx = db.transaction('questions', 'readwrite');
    const qStore = tx.objectStore('questions');

    let inserted = 0;
    let skipped = 0;
    const by_type = { single: 0, multiple: 0, judge: 0, short: 0 };

    for (const q of questions) {
      const code = String(q.code || '').trim();
      const content = String(q.content || '').trim();
      const qtype = q.qtype;
      const key = `${qtype}||${content}`;

      if (skipDuplicates) {
        if (code && existingCodes.has(code)) { skipped++; continue; }
        if (!code && existingKeys.has(key)) { skipped++; continue; }
      }

      const opts = qtype === 'short' ? [] : qtype === 'judge' ? ['正确', '错误'] : (q.options || []);
      qStore.add({
        bank_id: targetBankId,
        code,
        qtype,
        content,
        options: opts,
        answer: String(q.answer || '').trim(),
        explanation: String(q.explanation || '').trim(),
        scoring_criteria: String(q.scoring_criteria || '').trim(),
        category: String(q.category || '未分类').trim() || '未分类',
        difficulty: String(q.difficulty || '中').trim() || '中',
        level: String(q.level || '').trim(),
        default_score: Number(q.default_score || 1),
        default_time: Number(q.default_time || 0.6),
        author: String(q.author || '').trim(),
        remark: String(q.remark || '').trim(),
        created_at: now,
      });
      inserted++;
      by_type[qtype] = (by_type[qtype] || 0) + 1;
      if (code) existingCodes.add(code);
      existingKeys.add(key);
    }

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });

    return { bank_id: targetBankId, inserted, skipped, by_type };
  }

  // ------------------------------------------------------------------
  // Questions & Queries
  // ------------------------------------------------------------------

  async _enrichedQuestions(bankId = null) {
    const [banks, questions, statsList] = await Promise.all([
      this._getAll('banks'),
      this._getAll('questions'),
      this._getAll('stats'),
    ]);
    const bankMap = new Map(banks.map((b) => [b.id, b.name]));
    const statsMap = new Map(statsList.map((s) => [s.question_id, s]));

    let list = questions;
    if (bankId) list = list.filter((q) => q.bank_id === Number(bankId));
    list.sort((a, b) => a.id - b.id);

    return list.map((q) => ({
      ...q,
      bank_name: bankMap.get(q.bank_id) || '',
      stats: { ...defaultStats(q.id), ...(statsMap.get(q.id) || {}) },
    }));
  }

  async listCategories(bankId = null) {
    const items = await this._enrichedQuestions(bankId);
    const map = new Map();
    for (const q of items) {
      const c = q.category || '未分类';
      if (!map.has(c)) map.set(c, { category: c, count: 0, practiced: 0, wrong_count: 0 });
      const entry = map.get(c);
      entry.count++;
      if (q.stats.attempt_count > 0) entry.practiced++;
      if (q.stats.in_wrong_book) entry.wrong_count++;
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, 'zh-CN'));
  }

  async listQuestions({
    bankId = null,
    qtype = 'all',
    category = 'all',
    status = 'all',
    keyword = '',
    page = null,
    pageSize = 30,
  } = {}) {
    let items = await this._enrichedQuestions(bankId);
    if (qtype && qtype !== 'all') items = items.filter((q) => q.qtype === qtype);
    if (category && category !== 'all') items = items.filter((q) => q.category === category);
    if (status === 'unseen') items = items.filter((q) => q.stats.attempt_count === 0);
    else if (status === 'wrong') items = items.filter((q) => q.stats.in_wrong_book);
    else if (status === 'bookmarked') items = items.filter((q) => q.stats.bookmarked);
    else if (status === 'practiced') items = items.filter((q) => q.stats.attempt_count > 0);

    if (keyword && keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      items = items.filter((q) =>
        (q.content || '').toLowerCase().includes(kw) ||
        (q.code || '').toLowerCase().includes(kw) ||
        (q.category || '').toLowerCase().includes(kw) ||
        (q.explanation || '').toLowerCase().includes(kw) ||
        (q.answer || '').toLowerCase().includes(kw) ||
        (q.stats.note || '').toLowerCase().includes(kw) ||
        (q.options || []).some((o) => o.toLowerCase().includes(kw))
      );
    }

    const total = items.length;
    if (page !== null) {
      const start = Math.max(0, (page - 1) * pageSize);
      items = items.slice(start, start + pageSize);
    }
    return { total, items };
  }

  async getQuestion(questionId) {
    const q = await this._get('questions', Number(questionId));
    if (!q) return null;
    const [bank, stats] = await Promise.all([
      this._get('banks', q.bank_id),
      this._get('stats', q.id),
    ]);
    return {
      ...q,
      bank_name: bank?.name || '',
      stats: { ...defaultStats(q.id), ...(stats || {}) },
    };
  }

  async createQuestion(data) {
    const qtype = data.qtype;
    if (!['single', 'multiple', 'judge', 'short'].includes(qtype)) throw new Error('无效的题型');
    const content = String(data.content || '').trim();
    if (!content) throw new Error('试题正文不能为空');
    let options = Array.isArray(data.options) ? data.options.map((x) => String(x).trim()).filter(Boolean) : [];
    if (qtype === 'judge') options = ['正确', '错误'];
    else if (qtype === 'short') options = [];
    else if (options.length < 2) throw new Error('选择题至少需要 2 个选项');

    const answer = window.ST.Importer.normalizeAnswer(qtype, data.answer, options);
    if (!answer) throw new Error('请设置有效的正确答案');

    const now = nowStr();
    const id = await this._add('questions', {
      bank_id: Number(data.bank_id),
      code: String(data.code || '').trim(),
      qtype,
      content,
      options,
      answer,
      explanation: String(data.explanation || '').trim(),
      scoring_criteria: String(data.scoring_criteria || '').trim(),
      category: String(data.category || '未分类').trim() || '未分类',
      difficulty: String(data.difficulty || '中').trim() || '中',
      level: String(data.level || '').trim(),
      default_score: Number(data.default_score || 1),
      default_time: Number(data.default_time || 0.6),
      author: String(data.author || '').trim(),
      remark: String(data.remark || '').trim(),
      created_at: now,
    });
    const bank = await this._get('banks', Number(data.bank_id));
    if (bank) { bank.updated_at = now; await this._put('banks', bank); }
    return this.getQuestion(id);
  }

  async updateQuestion(questionId, data) {
    const existing = await this._get('questions', Number(questionId));
    if (!existing) throw new Error('题目不存在');
    const qtype = data.qtype;
    const content = String(data.content || '').trim();
    if (!content) throw new Error('试题正文不能为空');
    let options = Array.isArray(data.options) ? data.options.map((x) => String(x).trim()).filter(Boolean) : [];
    if (qtype === 'judge') options = ['正确', '错误'];
    else if (qtype === 'short') options = [];
    else if (options.length < 2) throw new Error('选择题至少需要 2 个选项');

    const answer = window.ST.Importer.normalizeAnswer(qtype, data.answer, options);
    if (!answer) throw new Error('请设置有效的正确答案');

    const updated = {
      ...existing,
      bank_id: Number(data.bank_id),
      code: String(data.code || '').trim(),
      qtype,
      content,
      options,
      answer,
      explanation: String(data.explanation || '').trim(),
      scoring_criteria: String(data.scoring_criteria || '').trim(),
      category: String(data.category || '未分类').trim() || '未分类',
      difficulty: String(data.difficulty || '中').trim() || '中',
      author: String(data.author || '').trim(),
      remark: String(data.remark || '').trim(),
    };
    await this._put('questions', updated);
    const bank = await this._get('banks', Number(data.bank_id));
    if (bank) { bank.updated_at = nowStr(); await this._put('banks', bank); }
    return this.getQuestion(questionId);
  }

  async deleteQuestion(questionId) {
    await this._delete('questions', Number(questionId));
    await this._delete('stats', Number(questionId));
    return true;
  }

  // ------------------------------------------------------------------
  // Practice Stats, Wrong Book, Bookmarks, Notes, Progress
  // ------------------------------------------------------------------

  async _recordAttempt(questionId, userAnswer, isCorrect, autoRemoveWrong = false) {
    const existing = (await this._get('stats', questionId)) || defaultStats(questionId);
    existing.attempt_count += 1;
    if (isCorrect) {
      existing.correct_count += 1;
      if (autoRemoveWrong) existing.in_wrong_book = false;
    } else {
      existing.wrong_count += 1;
      existing.in_wrong_book = true;
    }
    existing.last_user_answer = userAnswer;
    existing.last_is_correct = isCorrect ? 1 : 0;
    existing.last_practiced_at = nowStr();
    await this._put('stats', existing);
    return existing;
  }

  async submitPractice(questionId, userAnswer, selfIsCorrect = null) {
    const [q, settings] = await Promise.all([
      this._get('questions', Number(questionId)),
      this.getSettings(),
    ]);
    if (!q) throw new Error('题目不存在');
    const norm = window.ST.Importer.normalizeAnswer(q.qtype, userAnswer, q.options);
    const isCorrect = q.qtype === 'short'
      ? (selfIsCorrect !== null ? Boolean(selfIsCorrect) : true)
      : norm === q.answer;
    const stats = await this._recordAttempt(q.id, norm, isCorrect, Boolean(settings.wrong_auto_remove));
    return {
      question_id: q.id,
      user_answer: norm,
      correct_answer: q.answer,
      is_correct: isCorrect,
      stats,
    };
  }

  async toggleBookmark(questionId, forced = null) {
    const existing = (await this._get('stats', Number(questionId))) || defaultStats(Number(questionId));
    existing.bookmarked = forced !== null ? Boolean(forced) : !existing.bookmarked;
    await this._put('stats', existing);
    return { question_id: Number(questionId), bookmarked: existing.bookmarked };
  }

  async setWrongBook(questionId, inWrong) {
    const existing = (await this._get('stats', Number(questionId))) || defaultStats(Number(questionId));
    existing.in_wrong_book = Boolean(inWrong);
    await this._put('stats', existing);
    return { question_id: Number(questionId), in_wrong_book: existing.in_wrong_book };
  }

  async saveNote(questionId, note) {
    const existing = (await this._get('stats', Number(questionId))) || defaultStats(Number(questionId));
    existing.note = String(note || '').trim();
    await this._put('stats', existing);
    return { question_id: Number(questionId), note: existing.note };
  }

  async clearWrongBook(bankId = null) {
    const items = await this._enrichedQuestions(bankId);
    let count = 0;
    for (const q of items) {
      if (q.stats.in_wrong_book) {
        q.stats.in_wrong_book = false;
        await this._put('stats', q.stats);
        count++;
      }
    }
    return count;
  }

  async resetPracticeStats(bankId = null) {
    const items = await this._enrichedQuestions(bankId);
    for (const q of items) {
      if (q.stats.attempt_count > 0 || q.stats.in_wrong_book) {
        q.stats.attempt_count = 0;
        q.stats.correct_count = 0;
        q.stats.wrong_count = 0;
        q.stats.in_wrong_book = false;
        q.stats.last_user_answer = '';
        q.stats.last_is_correct = null;
        q.stats.last_practiced_at = '';
        await this._put('stats', q.stats);
      }
    }
    const allProg = await this._getAll('progress');
    for (const p of allProg) {
      if (!bankId || p.scope_key.startsWith(`bank:${bankId}|`)) {
        await this._delete('progress', p.scope_key);
      }
    }
    return true;
  }

  async getPracticeProgress(scopeKey) {
    const row = await this._get('progress', scopeKey);
    return row ? Number(row.current_index || 0) : 0;
  }

  async savePracticeProgress(scopeKey, currentIndex) {
    await this._put('progress', {
      scope_key: scopeKey,
      current_index: Math.max(0, Number(currentIndex || 0)),
      updated_at: nowStr(),
    });
  }

  // ------------------------------------------------------------------
  // Dashboard & Pool Summary
  // ------------------------------------------------------------------

  async getDashboard(bankId = null) {
    const [items, exams] = await Promise.all([
      this._enrichedQuestions(bankId),
      this._getAll('exams'),
    ]);

    const by_type = {
      single: { total: 0, practiced: 0, wrong_count: 0 },
      multiple: { total: 0, practiced: 0, wrong_count: 0 },
      judge: { total: 0, practiced: 0, wrong_count: 0 },
      short: { total: 0, practiced: 0, wrong_count: 0 },
    };

    let practicedQ = 0;
    let totalAttempts = 0;
    let totalCorrect = 0;
    let wrongBookCount = 0;
    let bookmarkCount = 0;

    for (const q of items) {
      const s = q.stats;
      by_type[q.qtype].total++;
      if (s.attempt_count > 0) {
        practicedQ++;
        by_type[q.qtype].practiced++;
      }
      if (s.in_wrong_book) {
        wrongBookCount++;
        by_type[q.qtype].wrong_count++;
      }
      if (s.bookmarked) bookmarkCount++;
      totalAttempts += s.attempt_count;
      totalCorrect += s.correct_count;
    }

    const categories = await this.listCategories(bankId);
    const scopedExams = bankId
      ? exams.filter((e) => Number(e.bank_id) === Number(bankId))
      : exams;
    const completed = scopedExams.filter((e) => e.status === 'completed').sort((a, b) => a.id - b.id);
    const inProgress = exams.filter((e) => e.status === 'in_progress').sort((a, b) => b.id - a.id)[0] || null;

    let passCount = 0;
    let bestPct = 0;
    let pctSum = 0;
    completed.forEach((e) => {
      if (e.passed) passCount++;
      const pct = e.total_score > 0 ? (e.earned_score / e.total_score) * 100 : 0;
      if (pct > bestPct) bestPct = pct;
      pctSum += pct;
    });

    return {
      total_questions: items.length,
      practiced_questions: practicedQ,
      total_attempts: totalAttempts,
      accuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 1000) / 10 : 0,
      wrong_book_count: wrongBookCount,
      bookmark_count: bookmarkCount,
      by_type,
      categories,
      exam_stats: {
        count: completed.length,
        pass_count: passCount,
        best_pct: Math.round(bestPct * 10) / 10,
        avg_pct: completed.length ? Math.round((pctSum / completed.length) * 10) / 10 : 0,
      },
      recent_exams: completed.slice(-12),
      in_progress_exam: inProgress,
    };
  }

  async getExamPool(bankId = null, category = '') {
    let items = await this._enrichedQuestions(bankId);
    if (category && category !== 'all') items = items.filter((q) => q.category === category);
    const pool = {
      single: { total: 0, unseen: 0, wrong: 0, active_wrong: 0 },
      multiple: { total: 0, unseen: 0, wrong: 0, active_wrong: 0 },
      judge: { total: 0, unseen: 0, wrong: 0, active_wrong: 0 },
      short: { total: 0, unseen: 0, wrong: 0, active_wrong: 0 },
    };
    for (const q of items) {
      const p = pool[q.qtype];
      p.total++;
      if (q.stats.attempt_count === 0) p.unseen++;
      if (q.stats.in_wrong_book || q.stats.wrong_count > 0) p.wrong++;
      if (q.stats.in_wrong_book) p.active_wrong++;
    }
    return pool;
  }

  // ------------------------------------------------------------------
  // Mock Exam Engine
  // ------------------------------------------------------------------

  _gradeObjective(qtype, userAns, displayAns, scoreVal, partialMulti) {
    const norm = window.ST.Importer.normalizeAnswer(qtype, userAns);
    if (!norm) return [0, 0];
    if (norm === displayAns) return [1, Math.round(scoreVal * 100) / 100];
    if (qtype === 'multiple' && partialMulti) {
      const uSet = new Set(norm.split(''));
      const cSet = new Set(displayAns.split(''));
      if (uSet.size > 0 && [...uSet].every((ch) => cSet.has(ch))) {
        return [2, Math.round(scoreVal * 50) / 100];
      }
    }
    return [0, 0];
  }

  _computeExamBreakdown(items) {
    const breakdown = {};
    for (const t of ['single', 'multiple', 'judge', 'short']) {
      const group = items.filter((i) => i.qtype === t);
      if (group.length) {
        breakdown[t] = {
          count: group.length,
          answered: group.filter((i) => i.is_answered).length,
          correct: group.filter((i) => i.is_correct === 1).length,
          partial: group.filter((i) => i.is_correct === 2).length,
          pending_grade: group.filter((i) => i.needs_manual_grade).length,
          max_score: Math.round(group.reduce((a, i) => a + i.score_value, 0) * 100) / 100,
          earned_score: Math.round(group.reduce((a, i) => a + (i.earned_score || 0), 0) * 100) / 100,
        };
      }
    }
    return breakdown;
  }

  async createExam(config) {
    const bankId = config.bank_id ? Number(config.bank_id) : null;
    const category = (config.category && config.category !== 'all') ? String(config.category).trim() : '';

    const cleanConfig = {
      bank_id: bankId,
      category,
      counts: {
        single: Math.max(0, parseInt(config.counts?.single || 0, 10)),
        multiple: Math.max(0, parseInt(config.counts?.multiple || 0, 10)),
        judge: Math.max(0, parseInt(config.counts?.judge || 0, 10)),
        short: Math.max(0, parseInt(config.counts?.short || 0, 10)),
      },
      scores: {
        single: Math.max(0, Number(config.scores?.single ?? 1)),
        multiple: Math.max(0, Number(config.scores?.multiple ?? 2)),
        judge: Math.max(0, Number(config.scores?.judge ?? 1)),
        short: Math.max(0, Number(config.scores?.short ?? 5)),
      },
      duration_minutes: Math.max(0, parseInt(config.duration_minutes || 0, 10)),
      pass_score: Math.max(0, Number(config.pass_score || 0)),
      instant_feedback: Boolean(config.instant_feedback),
      shuffle_options: Boolean(config.shuffle_options),
      prioritize_wrong: Boolean(config.prioritize_wrong),
      prioritize_unseen: Boolean(config.prioritize_unseen),
      partial_multi_score: Boolean(config.partial_multi_score),
    };

    const totalWanted = Object.values(cleanConfig.counts).reduce((a, b) => a + b, 0);
    if (totalWanted === 0) throw new Error('请至少为一种题型设置大于 0 的题数');

    await this.updateSettings({ last_exam_config: cleanConfig });

    let allItems = await this._enrichedQuestions(bankId);
    if (category) allItems = allItems.filter((q) => q.category === category);

    let bankTitle = '全部题库';
    if (bankId) {
      const b = await this._get('banks', bankId);
      if (b) bankTitle = b.name;
    }

    const selected = [];
    const drawSummary = { wrong_drawn: 0, unseen_drawn: 0, mastered_drawn: 0, total: 0 };

    for (const qtype of ['single', 'multiple', 'judge', 'short']) {
      const want = cleanConfig.counts[qtype];
      if (want <= 0) continue;
      const pool = allItems.filter((q) => q.qtype === qtype);
      if (!pool.length) continue;

      const withRank = pool.map((q) => {
        const inWb = q.stats.in_wrong_book ? 1 : 0;
        const wc = q.stats.wrong_count || 0;
        const ac = q.stats.attempt_count || 0;
        const jitter = Math.random();
        let tier = 0;
        let sub = 0;
        if (cleanConfig.prioritize_wrong && cleanConfig.prioritize_unseen) {
          if (inWb) { tier = 0; sub = -wc; }
          else if (ac === 0) { tier = 1; sub = 0; }
          else if (wc > 0) { tier = 2; sub = -wc; }
          else { tier = 3; sub = ac; }
        } else if (cleanConfig.prioritize_wrong) {
          if (inWb) { tier = 0; sub = -wc; }
          else if (wc > 0) { tier = 1; sub = -wc; }
          else { tier = 2; sub = 0; }
        } else if (cleanConfig.prioritize_unseen) {
          if (ac === 0) { tier = 0; sub = 0; }
          else { tier = 1; sub = ac; }
        }
        return { q, tier, sub, jitter };
      });

      withRank.sort((a, b) => a.tier - b.tier || a.sub - b.sub || a.jitter - b.jitter);
      let chosen = withRank.slice(0, want).map((x) => x.q);

      chosen.forEach((q) => {
        if (q.stats.in_wrong_book || q.stats.wrong_count > 0) drawSummary.wrong_drawn++;
        else if (q.stats.attempt_count === 0) drawSummary.unseen_drawn++;
        else drawSummary.mastered_drawn++;
      });

      chosen = shuffleArray(chosen);
      chosen.forEach((q) => selected.push({ q, scoreVal: cleanConfig.scores[qtype] }));
    }

    if (!selected.length) throw new Error('当前筛选条件下没有可抽取的题目');

    drawSummary.total = selected.length;
    const totalScore = Math.round(selected.reduce((a, x) => a + x.scoreVal, 0) * 100) / 100;
    const passScore = Math.min(cleanConfig.pass_score, totalScore);

    const examItems = selected.map(({ q, scoreVal }, idx) => {
      let optionOrder = [];
      let displayOpts = q.options || [];
      let displayAnswer = q.answer;

      if (q.qtype === 'single' || q.qtype === 'multiple') {
        optionOrder = displayOpts.map((_, i) => i);
        if (cleanConfig.shuffle_options && optionOrder.length > 1) {
          optionOrder = shuffleArray(optionOrder);
        }
        displayOpts = optionOrder.map((i) => q.options[i]);
        const origCorrectIdx = new Set(
          q.answer.toUpperCase().split('').filter((c) => c >= 'A' && c <= 'H').map((c) => c.charCodeAt(0) - 65)
        );
        displayAnswer = optionOrder
          .map((origIdx, pos) => (origCorrectIdx.has(origIdx) ? String.fromCharCode(65 + pos) : ''))
          .join('');
      }

      return {
        id: idx + 1,
        item_order: idx + 1,
        question_id: q.id,
        code: q.code,
        qtype: q.qtype,
        content: q.content,
        options: displayOpts,
        option_order: optionOrder,
        display_answer: displayAnswer,
        explanation: q.explanation,
        scoring_criteria: q.scoring_criteria,
        category: q.category,
        difficulty: q.difficulty,
        score_value: scoreVal,
        user_answer: '',
        is_answered: false,
        is_locked: false,
        is_correct: null,
        earned_score: 0,
        needs_manual_grade: false,
        stats_recorded: false,
        flagged: false,
      };
    });

    const examObj = {
      title: String(config.title || '').trim() || `${bankTitle} 模拟考试`,
      bank_id: bankId,
      config: cleanConfig,
      draw_summary: drawSummary,
      total_score: totalScore,
      pass_score: passScore,
      duration_minutes: cleanConfig.duration_minutes,
      earned_score: 0,
      passed: false,
      status: 'in_progress',
      started_at: nowStr(),
      submitted_at: '',
      elapsed_seconds: 0,
      items: examItems,
    };

    const id = await this._add('exams', examObj);
    return this.getExam(id);
  }

  async getExam(examId) {
    const ex = await this._get('exams', Number(examId));
    if (!ex) return null;
    const statsList = await this._getAll('stats');
    const statsMap = new Map(statsList.map((s) => [s.question_id, s]));
    const instant = Boolean(ex.config?.instant_feedback);
    const isCompleted = ex.status === 'completed';

    const viewItems = ex.items.map((it) => {
      const st = statsMap.get(it.question_id);
      const revealed = isCompleted || (instant && it.is_locked);
      return {
        ...it,
        bookmarked: Boolean(st?.bookmarked),
        in_wrong_book: Boolean(st?.in_wrong_book),
        revealed,
      };
    });

    return {
      ...ex,
      items: viewItems,
      breakdown: this._computeExamBreakdown(viewItems),
    };
  }

  async answerExamItem(examId, itemId, userAnswer, elapsedSeconds = null) {
    const [ex, settings] = await Promise.all([
      this._get('exams', Number(examId)),
      this.getSettings(),
    ]);
    if (!ex) throw new Error('考试不存在');
    if (ex.status !== 'in_progress') throw new Error('考试已交卷');

    const item = ex.items.find((i) => i.id === Number(itemId));
    if (!item) throw new Error('试题不存在');
    const instant = Boolean(ex.config?.instant_feedback);
    if (instant && item.is_locked) throw new Error('本题已锁定');

    const norm = window.ST.Importer.normalizeAnswer(item.qtype, userAnswer, item.options);
    item.user_answer = norm;
    item.is_answered = Boolean(norm);

    if (instant && item.is_answered) {
      item.is_locked = true;
      if (item.qtype === 'short') {
        item.needs_manual_grade = true;
      } else {
        const [isCorr, earned] = this._gradeObjective(
          item.qtype, norm, item.display_answer, item.score_value, Boolean(ex.config?.partial_multi_score)
        );
        item.is_correct = isCorr;
        item.earned_score = earned;
        if (!item.stats_recorded) {
          item.stats_recorded = true;
          await this._recordAttempt(item.question_id, norm, isCorr === 1, Boolean(settings.wrong_auto_remove));
        }
      }
    }

    if (elapsedSeconds !== null) {
      ex.elapsed_seconds = Math.max(ex.elapsed_seconds || 0, Math.max(0, Math.floor(elapsedSeconds)));
    }
    await this._put('exams', ex);
    const refreshed = await this.getExam(ex.id);
    return refreshed.items.find((i) => i.id === Number(itemId));
  }

  async toggleExamFlag(examId, itemId) {
    const ex = await this._get('exams', Number(examId));
    if (!ex) throw new Error('考试不存在');
    const item = ex.items.find((i) => i.id === Number(itemId));
    if (!item) throw new Error('试题不存在');
    item.flagged = !item.flagged;
    await this._put('exams', ex);
    return { item_id: item.id, flagged: item.flagged };
  }

  async updateExamElapsed(examId, elapsedSeconds) {
    const ex = await this._get('exams', Number(examId));
    if (!ex || ex.status !== 'in_progress') return;
    ex.elapsed_seconds = Math.max(ex.elapsed_seconds || 0, Math.max(0, Math.floor(elapsedSeconds)));
    await this._put('exams', ex);
  }

  async gradeExamShort(examId, itemId, earnedScore) {
    const [ex, settings] = await Promise.all([
      this._get('exams', Number(examId)),
      this.getSettings(),
    ]);
    if (!ex) throw new Error('考试不存在');
    const item = ex.items.find((i) => i.id === Number(itemId));
    if (!item) throw new Error('试题不存在');

    const maxS = Number(item.score_value || 0);
    const clamped = Math.round(Math.max(0, Math.min(maxS, Number(earnedScore || 0))) * 100) / 100;
    item.earned_score = clamped;
    item.is_correct = (maxS > 0 && clamped >= maxS) ? 1 : clamped > 0 ? 2 : 0;
    item.needs_manual_grade = false;

    if (!item.stats_recorded) {
      item.stats_recorded = true;
      const passedItem = maxS > 0 ? clamped >= maxS * 0.6 : true;
      await this._recordAttempt(item.question_id, item.user_answer, passedItem, Boolean(settings.wrong_auto_remove));
    }

    ex.earned_score = Math.round(ex.items.reduce((a, i) => a + (i.earned_score || 0), 0) * 100) / 100;
    ex.passed = ex.earned_score >= ex.pass_score;
    await this._put('exams', ex);
    return this.getExam(ex.id);
  }

  async submitExam(examId, elapsedSeconds = 0) {
    const [ex, settings] = await Promise.all([
      this._get('exams', Number(examId)),
      this.getSettings(),
    ]);
    if (!ex) throw new Error('考试不存在');
    if (ex.status === 'completed') return this.getExam(ex.id);

    const partialMulti = Boolean(ex.config?.partial_multi_score);
    const autoRemove = Boolean(settings.wrong_auto_remove);

    for (const item of ex.items) {
      if (item.qtype === 'short') {
        if (item.is_locked && !item.needs_manual_grade && item.stats_recorded) {
          continue;
        } else if (!item.is_answered) {
          item.is_locked = true;
          item.is_correct = 0;
          item.earned_score = 0;
          item.needs_manual_grade = false;
          if (!item.stats_recorded) {
            item.stats_recorded = true;
            await this._recordAttempt(item.question_id, '', false, autoRemove);
          }
        } else {
          item.is_locked = true;
          item.needs_manual_grade = true;
        }
      } else {
        if (item.is_locked && item.stats_recorded) continue;
        const [isCorr, earned] = this._gradeObjective(
          item.qtype, item.user_answer, item.display_answer, item.score_value, partialMulti
        );
        item.is_locked = true;
        item.is_correct = isCorr;
        item.earned_score = earned;
        if (!item.stats_recorded) {
          item.stats_recorded = true;
          await this._recordAttempt(item.question_id, item.user_answer, isCorr === 1, autoRemove);
        }
      }
    }

    ex.earned_score = Math.round(ex.items.reduce((a, i) => a + (i.earned_score || 0), 0) * 100) / 100;
    ex.passed = ex.earned_score >= ex.pass_score;
    ex.status = 'completed';
    ex.submitted_at = nowStr();
    ex.elapsed_seconds = Math.max(ex.elapsed_seconds || 0, Math.max(0, Math.floor(elapsedSeconds)));
    await this._put('exams', ex);
    return this.getExam(ex.id);
  }

  async listExams() {
    const exams = await this._getAll('exams');
    return exams
      .sort((a, b) => b.id - a.id)
      .map((ex) => ({
        ...ex,
        question_count: ex.items.length,
        correct_count: ex.items.filter((i) => i.is_correct === 1).length,
        pending_grade_count: ex.items.filter((i) => i.needs_manual_grade).length,
      }));
  }

  async deleteExam(examId) {
    await this._delete('exams', Number(examId));
    return true;
  }

  // ------------------------------------------------------------------
  // Full Backup & Restore (JSON)
  // ------------------------------------------------------------------

  async exportFullBackup() {
    const [banks, questions, stats, progress, exams, settings] = await Promise.all([
      this._getAll('banks'),
      this._getAll('questions'),
      this._getAll('stats'),
      this._getAll('progress'),
      this._getAll('exams'),
      this._getAll('settings'),
    ]);
    return {
      format: 'shuatishq_backup_v1',
      exported_at: nowStr(),
      banks,
      questions,
      stats,
      progress,
      exams,
      settings,
    };
  }

  async importFullBackup(backup) {
    if (!backup || backup.format !== 'shuatishq_backup_v1') {
      throw new Error('备份文件格式不匹配（请选择本软件导出的备份 JSON）');
    }
    const db = await this.open();
    const stores = ['banks', 'questions', 'stats', 'progress', 'exams', 'settings'];
    const tx = db.transaction(stores, 'readwrite');
    stores.forEach((name) => {
      const st = tx.objectStore(name);
      st.clear();
      (backup[name] || []).forEach((item) => st.put(item));
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return {
      banks: (backup.banks || []).length,
      questions: (backup.questions || []).length,
      exams: (backup.exams || []).length,
    };
  }
}

window.ST.DB = new LocalQuizDB();
window.ST.escapeHtml = escapeHtml;
window.ST.formatAnswerLabel = formatAnswerLabel;
window.ST.formatDuration = formatDuration;
window.ST.formatNum = formatNum;
window.ST.qtypeBadgeHtml = qtypeBadgeHtml;
window.ST.shuffleArray = shuffleArray;
