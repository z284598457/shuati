/**
 * Mock Exam View — 刷题神器风格模拟考试（配置组卷 / 沉浸考场 / 成绩单与解析）
 */
window.ST = window.ST || {};
window.ST.Views = window.ST.Views || {};

window.ST.Views.exam = {
  immersive: true,
  state: {
    mode: 'config', // 'config' | 'taking' | 'result'
    config: null,
    pool: null,
    categories: [],
    exam: null,
    currentIndex: 0,
    multiDraft: {},
    shortDraft: {},
    shortSaveTimer: null,
    timerId: null,
    elapsedSeconds: 0,
    paused: false,
    syncTick: 0,
    reviewFilter: 'all',
  },

  cleanup() {
    if (this.state.timerId) { clearInterval(this.state.timerId); this.state.timerId = null; }
    if (this.state.shortSaveTimer) { clearTimeout(this.state.shortSaveTimer); this.state.shortSaveTimer = null; }
  },

  async render(container, app, params = {}) {
    this.cleanup();
    const { DB } = window.ST;

    if (params.examId) {
      const ex = await DB.getExam(params.examId);
      if (!ex) { app.toast('考试记录不存在', 'error'); app.navigate('home'); return; }
      this.state.exam = ex;
      this.state.currentIndex = 0;
      this.state.multiDraft = {};
      this.state.shortDraft = {};
      this.state.reviewFilter = 'all';
      if (ex.status === 'in_progress') {
        this.state.mode = 'taking';
        this.state.elapsedSeconds = ex.elapsed_seconds || 0;
        this.state.paused = false;
        this.startTimer(container, app);
        this.paintTaking(container, app);
      } else {
        this.state.mode = 'result';
        this.paintResult(container, app);
      }
      return;
    }

    this.state.mode = 'config';
    const saved = app.state.settings.last_exam_config || {};
    this.state.config = {
      bank_id: app.state.activeBankId ?? saved.bank_id ?? null,
      category: saved.category || '',
      title: '',
      counts: {
        single: saved.counts?.single ?? 20,
        multiple: saved.counts?.multiple ?? 10,
        judge: saved.counts?.judge ?? 10,
        short: saved.counts?.short ?? 0,
      },
      scores: {
        single: saved.scores?.single ?? 1,
        multiple: saved.scores?.multiple ?? 2,
        judge: saved.scores?.judge ?? 1,
        short: saved.scores?.short ?? 5,
      },
      duration_minutes: saved.duration_minutes ?? 45,
      pass_score: saved.pass_score ?? 30,
      instant_feedback: Boolean(saved.instant_feedback ?? false),
      shuffle_options: Boolean(saved.shuffle_options ?? true),
      prioritize_wrong: Boolean(saved.prioritize_wrong ?? true),
      prioritize_unseen: Boolean(saved.prioritize_unseen ?? true),
      partial_multi_score: Boolean(saved.partial_multi_score ?? false),
    };

    await this.loadPoolAndPaintConfig(container, app);
  },

  async loadPoolAndPaintConfig(container, app) {
    const { DB } = window.ST;
    const cfg = this.state.config;
    const [banks, pool, cats, exams] = await Promise.all([
      DB.listBanks(),
      DB.getExamPool(cfg.bank_id, cfg.category),
      DB.listCategories(cfg.bank_id),
      DB.listExams(),
    ]);
    app.state.banks = banks;
    this.state.pool = pool;
    this.state.categories = cats;

    for (const t of ['single', 'multiple', 'judge', 'short']) {
      if (cfg.counts[t] > pool[t].total) cfg.counts[t] = pool[t].total;
    }
    const maxScore = this.calcTotalScore();
    if (cfg.pass_score > maxScore) cfg.pass_score = Math.round(maxScore * 0.6 * 10) / 10;

    const inProgress = exams.find((e) => e.status === 'in_progress') || null;
    this.paintConfig(container, app, inProgress);
  },

  calcTotalCount() {
    const c = this.state.config.counts;
    return (c.single || 0) + (c.multiple || 0) + (c.judge || 0) + (c.short || 0);
  },

  calcTotalScore() {
    const { counts, scores } = this.state.config;
    return Math.round((
      (counts.single || 0) * (scores.single || 0) +
      (counts.multiple || 0) * (scores.multiple || 0) +
      (counts.judge || 0) * (scores.judge || 0) +
      (counts.short || 0) * (scores.short || 0)
    ) * 100) / 100;
  },

  priorityHint() {
    const { prioritize_wrong: w, prioritize_unseen: u } = this.state.config;
    if (w && u) return '错题本 → 未做新题 → 曾错题 → 其余已掌握题（各题型内再随机打乱顺序）';
    if (w) return '优先抽取错题本与历史错题（错次越多越优先），不足再随机补齐';
    if (u) return '优先抽取未做新题，不足再从练习次数少的题目中随机补齐';
    return '从符合条件的题池中完全随机等概率抽取';
  },

  // =========================================================================
  // 1. Exam Configurator
  // =========================================================================

  paintConfig(container, app, inProgress = null) {
    const { escapeHtml, formatNum, QTYPE_META } = window.ST;
    const cfg = this.state.config;
    const pool = this.state.pool;
    const totalCount = this.calcTotalCount();
    const totalScore = this.calcTotalScore();

    const bankOpts = [
      `<option value="" ${!cfg.bank_id ? 'selected' : ''}>全部题库</option>`,
      ...app.state.banks.map((b) => `<option value="${b.id}" ${cfg.bank_id === b.id ? 'selected' : ''}>${escapeHtml(b.name)} (${b.total_count}题)</option>`),
    ].join('');

    const catOpts = [
      `<option value="" ${!cfg.category ? 'selected' : ''}>全部章节 / 出处</option>`,
      ...this.state.categories.map((c) => `<option value="${escapeHtml(c.category)}" ${cfg.category === c.category ? 'selected' : ''}>${escapeHtml(c.category)} (${c.count})</option>`),
    ].join('');

    const rowsHtml = ['single', 'multiple', 'judge', 'short'].map((t) => {
      const p = pool[t] || { total: 0, unseen: 0, wrong: 0 };
      const cnt = cfg.counts[t] || 0;
      const sc = cfg.scores[t] || 0;
      const sub = Math.round(cnt * sc * 100) / 100;
      const m = QTYPE_META[t];
      return `
        <tr>
          <td>
            <span class="badge ${m.cls}">${m.label}</span>
            <div style="font-size:11px;color:var(--text-3);margin-top:3px;">
              共${p.total} · 未做${p.unseen} · 错${p.wrong}
            </div>
          </td>
          <td>
            <div style="display:flex;align-items:center;gap:4px;">
              <input type="number" class="num-input" style="width:62px;" data-cnt="${t}" min="0" max="${p.total}" value="${cnt}" ${p.total === 0 ? 'disabled' : ''} />
              ${p.total > 0 ? `<button type="button" class="chip" data-max="${t}" style="padding:3px 7px;font-size:11px;">全</button>` : ''}
            </div>
          </td>
          <td>
            <input type="number" class="num-input" style="width:62px;" data-sc="${t}" min="0" max="100" step="0.5" value="${sc}" />
          </td>
          <td class="mono" style="font-weight:800;color:var(--brand);white-space:nowrap;" data-sub="${t}">${formatNum(sub)}分</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="study-page">
        <header class="study-header">
          <div class="study-header-inner">
            <button type="button" class="back-btn" id="cfg-back">← 返回</button>
            <strong style="font-size:16px;">模拟考试组卷</strong>
            <button type="button" class="back-btn" id="cfg-hist" style="font-size:13.5px;color:var(--brand);">考试记录</button>
          </div>
        </header>

        <div class="container" style="padding-bottom:96px;">
          ${inProgress ? `
            <div class="card" style="background:var(--amber-soft);border-color:var(--amber-border);display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 16px;">
              <div>
                <div style="font-weight:700;font-size:13.5px;">⏳ 尚有未交卷考试：${escapeHtml(inProgress.title)}</div>
                <div style="font-size:12px;color:var(--text-2);margin-top:2px;">共 ${inProgress.question_count} 题 · 满分 ${formatNum(inProgress.total_score)} 分</div>
              </div>
              <button class="btn btn-primary btn-sm" id="cfg-resume" data-eid="${inProgress.id}">继续作答</button>
            </div>
          ` : ''}

          <div class="two-col">
            <div>
              <div class="card">
                <div class="card-head">
                  <h2 class="card-title">1. 题型题数与分值</h2>
                  <div style="display:flex;gap:6px;">
                    <button type="button" class="chip" id="pre-100">百题卷</button>
                    <button type="button" class="chip" id="pre-20">20题速测</button>
                  </div>
                </div>

                <div class="form-row-2" style="margin-bottom:12px;">
                  <div>
                    <label class="form-label">抽题题库</label>
                    <select id="cfg-bank" class="select">${bankOpts}</select>
                  </div>
                  <div>
                    <label class="form-label">限定章节</label>
                    <select id="cfg-cat" class="select">${catOpts}</select>
                  </div>
                </div>

                <div style="margin-bottom:12px;">
                  <label class="form-label">试卷名称（留空自动命名）</label>
                  <input type="text" id="cfg-title" class="input" placeholder="例如：配电自动化考前模拟卷" value="${escapeHtml(cfg.title || '')}" />
                </div>

                <div style="overflow-x:auto;">
                  <table class="cfg-table">
                    <thead><tr><th>题型 / 余量</th><th>题数</th><th>每题分值</th><th>小计</th></tr></thead>
                    <tbody>${rowsHtml}</tbody>
                  </table>
                </div>
              </div>

              <div class="card">
                <h2 class="card-title" style="margin-bottom:14px;">2. 考试时间与及格线</h2>
                <div class="form-row-2">
                  <div>
                    <label class="form-label">考试时间（分钟，0 为不限时）</label>
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                      <input type="number" id="cfg-dur" class="num-input" min="0" max="360" step="5" value="${cfg.duration_minutes}" />
                      <button type="button" class="chip" data-dur="30">30分</button>
                      <button type="button" class="chip" data-dur="60">60分</button>
                      <button type="button" class="chip" data-dur="90">90分</button>
                      <button type="button" class="chip" data-dur="0">不限</button>
                    </div>
                  </div>
                  <div>
                    <label class="form-label">及格分数线（分）</label>
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                      <input type="number" id="cfg-pass" class="num-input" min="0" max="${totalScore}" step="0.5" value="${cfg.pass_score}" />
                      <button type="button" class="chip" data-pct="0.6">60%</button>
                      <button type="button" class="chip" data-pct="0.7">70%</button>
                      <button type="button" class="chip" data-pct="0.8">80%</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="card">
              <h2 class="card-title" style="margin-bottom:8px;">3. 答题与智能抽题设置</h2>
              <label class="setting-row">
                <div>
                  <div class="setting-title">答题后立即显示答案</div>
                  <div class="setting-desc">开启则每答完一题立即公布对错解析并锁定；关闭则交卷后统一阅卷</div>
                </div>
                <span class="switch"><input type="checkbox" id="sw-instant" ${cfg.instant_feedback ? 'checked' : ''} /><span class="switch-track"></span></span>
              </label>
              <label class="setting-row">
                <div>
                  <div class="setting-title">选项乱序</div>
                  <div class="setting-desc">随机打乱单选/多选题的选项排列，防止死记字母位置</div>
                </div>
                <span class="switch"><input type="checkbox" id="sw-shuffle" ${cfg.shuffle_options ? 'checked' : ''} /><span class="switch-track"></span></span>
              </label>
              <label class="setting-row">
                <div>
                  <div class="setting-title">错题优先被抽到</div>
                  <div class="setting-desc">优先抽取错题本与历史做错过的题目</div>
                </div>
                <span class="switch"><input type="checkbox" id="sw-wrong" ${cfg.prioritize_wrong ? 'checked' : ''} /><span class="switch-track"></span></span>
              </label>
              <label class="setting-row">
                <div>
                  <div class="setting-title">先抽到未做的题</div>
                  <div class="setting-desc">优先抽取尚未练习过的新题，提升全库覆盖率</div>
                </div>
                <span class="switch"><input type="checkbox" id="sw-unseen" ${cfg.prioritize_unseen ? 'checked' : ''} /><span class="switch-track"></span></span>
              </label>
              <label class="setting-row">
                <div>
                  <div class="setting-title">多选题漏选得半分</div>
                  <div class="setting-desc">无错选且仅漏选时得该题一半分值（关闭为严格全对得分）</div>
                </div>
                <span class="switch"><input type="checkbox" id="sw-partial" ${cfg.partial_multi_score ? 'checked' : ''} /><span class="switch-track"></span></span>
              </label>
              <div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:var(--bg-subtle);font-size:12px;color:var(--text-2);line-height:1.6;">
                <strong>抽题顺序：</strong><span id="cfg-prio-hint">${this.priorityHint()}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Sticky Bottom Start Bar -->
        <footer class="study-footer">
          <div class="study-footer-inner">
            <div style="font-size:13px;line-height:1.35;">
              <div>共 <strong class="mono" id="sum-cnt">${totalCount}</strong> 题 · 满分 <strong class="mono" style="color:var(--brand);" id="sum-sc">${formatNum(totalScore)}</strong> 分</div>
              <div style="font-size:11.5px;color:var(--text-3);">及格 <span class="mono" id="sum-pass">${formatNum(cfg.pass_score)}</span> 分 · <span id="sum-dur">${cfg.duration_minutes > 0 ? `${cfg.duration_minutes}分钟` : '不限时'}</span></div>
            </div>
            <button type="button" class="btn btn-primary btn-lg" id="btn-go-exam" ${totalCount === 0 ? 'disabled' : ''}>
              🚀 开始考试
            </button>
          </div>
        </footer>
      </div>
    `;

    this.bindConfigEvents(container, app);
  },

  refreshSummary(container) {
    const { formatNum } = window.ST;
    const cfg = this.state.config;
    for (const t of ['single', 'multiple', 'judge', 'short']) {
      const sub = Math.round((cfg.counts[t] || 0) * (cfg.scores[t] || 0) * 100) / 100;
      const el = container.querySelector(`[data-sub="${t}"]`);
      if (el) el.textContent = `${formatNum(sub)}分`;
    }
    const cnt = this.calcTotalCount();
    const sc = this.calcTotalScore();
    container.querySelector('#sum-cnt').textContent = cnt;
    container.querySelector('#sum-sc').textContent = formatNum(sc);
    container.querySelector('#sum-pass').textContent = formatNum(cfg.pass_score);
    container.querySelector('#sum-dur').textContent = cfg.duration_minutes > 0 ? `${cfg.duration_minutes}分钟` : '不限时';
    container.querySelector('#cfg-prio-hint').textContent = this.priorityHint();
    container.querySelector('#btn-go-exam').disabled = cnt === 0;
  },

  bindConfigEvents(container, app) {
    const { DB } = window.ST;
    const cfg = this.state.config;
    const pool = this.state.pool;

    container.querySelector('#cfg-back')?.addEventListener('click', () => app.navigate('home'));
    container.querySelector('#cfg-hist')?.addEventListener('click', () => app.navigate('history'));
    container.querySelector('#cfg-resume')?.addEventListener('click', (e) => {
      app.navigate('exam', { examId: Number(e.currentTarget.dataset.eid) });
    });

    container.querySelector('#cfg-bank')?.addEventListener('change', (e) => {
      cfg.bank_id = e.target.value ? Number(e.target.value) : null;
      cfg.category = '';
      this.loadPoolAndPaintConfig(container, app);
    });
    container.querySelector('#cfg-cat')?.addEventListener('change', (e) => {
      cfg.category = e.target.value;
      this.loadPoolAndPaintConfig(container, app);
    });
    container.querySelector('#cfg-title')?.addEventListener('input', (e) => { cfg.title = e.target.value; });

    const syncPass60 = () => {
      const s = this.calcTotalScore();
      cfg.pass_score = Math.round(s * 0.6 * 10) / 10;
      const inp = container.querySelector('#cfg-pass');
      if (inp) { inp.max = s; inp.value = cfg.pass_score; }
    };

    container.querySelectorAll('[data-cnt]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const t = inp.dataset.cnt;
        cfg.counts[t] = Math.max(0, Math.min(pool[t].total, parseInt(inp.value || '0', 10) || 0));
        syncPass60();
        this.refreshSummary(container);
      });
    });
    container.querySelectorAll('[data-max]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.max;
        cfg.counts[t] = pool[t].total;
        const inp = container.querySelector(`[data-cnt="${t}"]`);
        if (inp) inp.value = cfg.counts[t];
        syncPass60();
        this.refreshSummary(container);
      });
    });
    container.querySelectorAll('[data-sc]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const t = inp.dataset.sc;
        cfg.scores[t] = Math.max(0, parseFloat(inp.value || '0') || 0);
        syncPass60();
        this.refreshSummary(container);
      });
    });

    const durInp = container.querySelector('#cfg-dur');
    durInp?.addEventListener('input', () => {
      cfg.duration_minutes = Math.max(0, parseInt(durInp.value || '0', 10) || 0);
      this.refreshSummary(container);
    });
    container.querySelectorAll('[data-dur]').forEach((b) => {
      b.addEventListener('click', () => {
        cfg.duration_minutes = Number(b.dataset.dur);
        if (durInp) durInp.value = cfg.duration_minutes;
        this.refreshSummary(container);
      });
    });

    const passInp = container.querySelector('#cfg-pass');
    passInp?.addEventListener('input', () => {
      cfg.pass_score = Math.max(0, parseFloat(passInp.value || '0') || 0);
      this.refreshSummary(container);
    });
    container.querySelectorAll('[data-pct]').forEach((b) => {
      b.addEventListener('click', () => {
        cfg.pass_score = Math.round(this.calcTotalScore() * Number(b.dataset.pct) * 10) / 10;
        if (passInp) passInp.value = cfg.pass_score;
        this.refreshSummary(container);
      });
    });

    container.querySelector('#pre-100')?.addEventListener('click', () => {
      cfg.counts = {
        single: Math.min(40, pool.single.total),
        multiple: Math.min(30, pool.multiple.total),
        judge: Math.min(30, pool.judge.total),
        short: Math.min(5, pool.short.total),
      };
      cfg.scores = { single: 1, multiple: 1, judge: 1, short: 5 };
      cfg.duration_minutes = 60;
      cfg.pass_score = Math.round(this.calcTotalScore() * 0.6 * 10) / 10;
      this.paintConfig(container, app);
    });
    container.querySelector('#pre-20')?.addEventListener('click', () => {
      cfg.counts = {
        single: Math.min(10, pool.single.total),
        multiple: Math.min(5, pool.multiple.total),
        judge: Math.min(5, pool.judge.total),
        short: 0,
      };
      cfg.scores = { single: 4, multiple: 6, judge: 6, short: 5 };
      cfg.duration_minutes = 20;
      cfg.pass_score = Math.round(this.calcTotalScore() * 0.6 * 10) / 10;
      this.paintConfig(container, app);
    });

    container.querySelector('#sw-instant')?.addEventListener('change', (e) => { cfg.instant_feedback = e.target.checked; });
    container.querySelector('#sw-shuffle')?.addEventListener('change', (e) => { cfg.shuffle_options = e.target.checked; });
    container.querySelector('#sw-wrong')?.addEventListener('change', (e) => { cfg.prioritize_wrong = e.target.checked; this.refreshSummary(container); });
    container.querySelector('#sw-unseen')?.addEventListener('change', (e) => { cfg.prioritize_unseen = e.target.checked; this.refreshSummary(container); });
    container.querySelector('#sw-partial')?.addEventListener('change', (e) => { cfg.partial_multi_score = e.target.checked; });

    container.querySelector('#btn-go-exam')?.addEventListener('click', async () => {
      try {
        const exam = await DB.createExam(cfg);
        app.state.settings.last_exam_config = exam.config;
        this.state.exam = exam;
        this.state.mode = 'taking';
        this.state.currentIndex = 0;
        this.state.multiDraft = {};
        this.state.shortDraft = {};
        this.state.elapsedSeconds = 0;
        this.state.paused = false;
        this.startTimer(container, app);
        this.paintTaking(container, app);
        app.toast(`试卷已生成（共 ${exam.items.length} 题）`, 'success');
      } catch (err) {
        app.toast(err.message, 'error');
      }
    });
  },

  // =========================================================================
  // 2. Live Exam Runner
  // =========================================================================

  startTimer(container, app) {
    this.cleanup();
    const { DB, formatDuration } = window.ST;
    this.state.syncTick = 0;

    this.state.timerId = setInterval(async () => {
      if (this.state.mode !== 'taking' || this.state.paused || !this.state.exam) return;
      this.state.elapsedSeconds += 1;
      this.state.syncTick += 1;

      const limitSec = (this.state.exam.duration_minutes || 0) * 60;
      const el = container.querySelector('#exam-clock');
      if (el) {
        if (limitSec > 0) {
          const rem = Math.max(0, limitSec - this.state.elapsedSeconds);
          el.textContent = `⏱ ${formatDuration(rem)}`;
          el.className = 'exam-timer-pill' + (rem <= 180 ? ' danger' : rem <= 600 ? ' warn' : '');
          if (rem <= 0) {
            this.cleanup();
            app.toast('考试时间到，自动交卷！', 'warning');
            await this.doSubmitExam(container, app);
            return;
          }
        } else {
          el.textContent = `⏱ ${formatDuration(this.state.elapsedSeconds)}`;
        }
      }
      if (this.state.syncTick % 10 === 0) {
        DB.updateExamElapsed(this.state.exam.id, this.state.elapsedSeconds).catch(() => {});
      }
    }, 1000);
  },

  paintTaking(container, app) {
    const { escapeHtml, formatAnswerLabel, formatDuration, formatNum, qtypeBadgeHtml } = window.ST;
    const exam = this.state.exam;
    const items = exam.items;
    const item = items[this.state.currentIndex];
    const cfg = exam.config || {};
    const instant = Boolean(cfg.instant_feedback);
    const answeredCount = items.filter((i) => i.is_answered).length;
    const limitSec = (exam.duration_minutes || 0) * 60;
    const remSec = limitSec > 0 ? Math.max(0, limitSec - this.state.elapsedSeconds) : 0;
    const timerCls = limitSec > 0 ? (remSec <= 180 ? ' danger' : remSec <= 600 ? ' warn' : '') : '';
    const timerTxt = limitSec > 0 ? `⏱ ${formatDuration(remSec)}` : `⏱ ${formatDuration(this.state.elapsedSeconds)}`;

    const draw = exam.draw_summary || {};
    const infoBits = [
      `本题 ${formatNum(item.score_value)} 分`,
      cfg.shuffle_options ? '选项乱序' : '',
      draw.wrong_drawn > 0 ? `含错题 ${draw.wrong_drawn}` : '',
      draw.unseen_drawn > 0 ? `含未做 ${draw.unseen_drawn}` : '',
    ].filter(Boolean).join(' · ');

    let bodyHtml = '';
    const revealed = Boolean(item.revealed);
    const cSet = new Set(item.display_answer && item.qtype !== 'short' ? item.display_answer.split('') : []);

    if (item.qtype === 'short') {
      const draft = this.state.shortDraft[item.id] !== undefined ? this.state.shortDraft[item.id] : (item.user_answer || '');
      bodyHtml = `
        <div style="margin-bottom:14px;">
          <textarea id="ex-short-inp" class="textarea" rows="5" placeholder="输入简答题作答要点..." ${item.is_locked ? 'readonly' : ''}>${escapeHtml(draft)}</textarea>
          ${instant && !item.is_locked ? `<button type="button" class="btn btn-primary btn-block" style="margin-top:10px;" id="btn-ex-short-lock">确认提交本题并查看答案</button>` : ''}
        </div>
      `;
    } else {
      const isJudge = item.qtype === 'judge';
      const isMulti = item.qtype === 'multiple';
      const activeAns = (instant && isMulti && !item.is_locked && this.state.multiDraft[item.id] !== undefined)
        ? this.state.multiDraft[item.id]
        : (item.user_answer || '');
      const uSet = new Set(activeAns.split('').filter(Boolean));

      const optsHtml = item.options.map((optText, idx) => {
        const letter = String.fromCharCode(65 + idx);
        const isSel = uSet.has(letter);
        const isCorr = cSet.has(letter);
        let cls = 'opt-btn' + (isMulti ? ' multi' : '');
        let tag = '';
        if (revealed) {
          cls += ' locked';
          if (isSel && isCorr) { cls += ' correct'; tag = `<span class="opt-tag ok">✓ 正确</span>`; }
          else if (isSel && !isCorr) { cls += ' wrong'; tag = `<span class="opt-tag err">✕ 误选</span>`; }
          else if (!isSel && isCorr) { cls += isMulti ? ' missed' : ' correct'; tag = `<span class="opt-tag ok">${isMulti ? '漏选' : '✓ 答案'}</span>`; }
        } else if (isSel) {
          cls += ' selected';
        }
        return `
          <button type="button" class="${cls}" data-ex-opt="${letter}" ${item.is_locked ? 'disabled' : ''}>
            <span class="opt-letter">${isJudge ? (letter === 'A' ? '✓' : '✕') : letter}</span>
            <span class="opt-label">${escapeHtml(optText)}</span>
            ${tag}
          </button>
        `;
      }).join('');

      bodyHtml = `
        <div class="opt-list">${optsHtml}</div>
        ${instant && isMulti && !item.is_locked ? `
          <button type="button" class="btn btn-primary btn-block" id="btn-ex-multi-lock" ${uSet.size === 0 ? 'disabled' : ''}>
            确认提交本题${uSet.size > 0 ? `（已选 ${[...uSet].sort().join('')}）` : ''}
          </button>
        ` : ''}
      `;
    }

    let feedbackHtml = '';
    if (revealed) {
      const isShort = item.qtype === 'short';
      const boxCls = isShort
        ? (item.needs_manual_grade ? 'is-ok' : item.is_correct === 1 ? 'is-ok' : item.is_correct === 2 ? 'is-partial' : 'is-err')
        : (item.is_correct === 1 ? 'is-ok' : item.is_correct === 2 ? 'is-partial' : 'is-err');

      const verdict = isShort
        ? (item.needs_manual_grade ? '📋 请对照参考答案自评打分' : `✓ 已自评：${formatNum(item.earned_score)} / ${formatNum(item.score_value)} 分`)
        : (item.is_correct === 1 ? `✓ 正确 (+${formatNum(item.earned_score)}分)` : item.is_correct === 2 ? `◐ 半对 (+${formatNum(item.earned_score)}分)` : '✕ 错误 (0分)');

      const halfScore = Math.round(item.score_value * 5) / 10;
      const shortGradeBar = isShort ? `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px dashed var(--border-strong);">
          <button type="button" class="btn btn-sm btn-soft-danger" data-ig="0">0分</button>
          <button type="button" class="btn btn-sm btn-secondary" data-ig="${halfScore}">${formatNum(halfScore)}分</button>
          <button type="button" class="btn btn-sm btn-success" data-ig="${item.score_value}">满分 ${formatNum(item.score_value)}分</button>
          <input type="number" id="ig-custom" class="num-input" style="width:66px;" min="0" max="${item.score_value}" step="0.5" value="${item.needs_manual_grade ? item.score_value : item.earned_score}" />
          <button type="button" class="btn btn-sm btn-primary" id="btn-ig-save">确定</button>
        </div>
      ` : '';

      feedbackHtml = `
        <div class="explain-box ${boxCls}">
          <div class="explain-head">
            <strong style="font-size:14.5px;">${verdict}</strong>
            ${!isShort ? `<span class="badge badge-success">正确答案：${escapeHtml(formatAnswerLabel(item.qtype, item.display_answer))}</span>` : ''}
          </div>
          ${isShort ? `<div class="explain-row"><span class="explain-key">参考答案：</span>${escapeHtml(item.display_answer)}</div>` : ''}
          ${item.scoring_criteria ? `<div class="explain-row"><span class="explain-key">评分标准：</span>${escapeHtml(item.scoring_criteria)}</div>` : ''}
          ${item.explanation ? `<div class="explain-row"><span class="explain-key">答案解析：</span>${escapeHtml(item.explanation)}</div>` : ''}
          ${shortGradeBar}
        </div>
      `;
    }

    container.innerHTML = `
      <div class="study-page">
        <header class="study-header">
          <div class="study-header-inner">
            <button type="button" class="back-btn" id="ex-leave">← 暂离</button>
            <button type="button" id="exam-clock" class="exam-timer-pill${timerCls}" style="border:none;" title="点击暂停或继续计时">
              ${this.state.paused ? '⏸ 已暂停' : timerTxt}
            </button>
            <button type="button" class="btn btn-primary btn-sm" id="ex-submit">交卷</button>
          </div>
        </header>
        <div class="study-subbar">
          <div class="study-subbar-inner">
            <span><strong>第 ${item.item_order}/${items.length} 题</strong> · ${escapeHtml(infoBits)}</span>
            <span class="mono" style="color:var(--text-3);">已答 ${answeredCount}/${items.length}</span>
          </div>
        </div>

        <div class="study-body" id="exam-swipe-area">
          <div class="q-paper-card">
            <div class="q-stem-line">${qtypeBadgeHtml(item.qtype)}<span class="q-stem-text">${escapeHtml(item.content)}</span></div>
            ${bodyHtml}
            ${feedbackHtml}

            <div class="q-step-row">
              <button type="button" class="btn btn-secondary" id="ex-prev" ${this.state.currentIndex === 0 ? 'disabled' : ''}>← 上一题</button>
              <button type="button" class="btn btn-soft btn-sm" id="ex-next-blank">下一未答</button>
              ${this.state.currentIndex < items.length - 1
                ? `<button type="button" class="btn btn-primary" id="ex-next">下一题 →</button>`
                : `<button type="button" class="btn btn-success" id="ex-finish-btn">交卷 ✓</button>`}
            </div>
          </div>
        </div>

        <footer class="study-footer">
          <div class="study-footer-inner">
            <div style="display:flex;gap:4px;">
              <button type="button" class="foot-tool-btn ${item.flagged ? 'flagged' : ''}" id="ex-flag">
                ${item.flagged ? '🚩 已存疑' : '⚑ 存疑'}
              </button>
              <button type="button" class="foot-tool-btn ${item.bookmarked ? 'starred' : ''}" id="ex-star">
                ${item.bookmarked ? '★ 已收藏' : '☆ 收藏'}
              </button>
            </div>
            <button type="button" class="sheet-trigger-btn" id="ex-sheet-btn">
              <span>▦ 答题卡</span>
              <span>${answeredCount}/${items.length}</span>
            </button>
          </div>
        </footer>
      </div>
    `;

    this.bindTakingEvents(container, app, item);
  },

  bindTakingEvents(container, app, item) {
    const { DB } = window.ST;
    const exam = this.state.exam;
    const instant = Boolean(exam.config?.instant_feedback);

    const flushShort = async () => {
      if (item.qtype === 'short' && !instant && !item.is_locked && this.state.shortDraft[item.id] !== undefined) {
        if (this.state.shortSaveTimer) { clearTimeout(this.state.shortSaveTimer); this.state.shortSaveTimer = null; }
        const upd = await DB.answerExamItem(exam.id, item.id, this.state.shortDraft[item.id], this.state.elapsedSeconds);
        exam.items[this.state.currentIndex] = upd;
      }
    };

    const saveAns = async (ans) => {
      const upd = await DB.answerExamItem(exam.id, item.id, ans, this.state.elapsedSeconds);
      exam.items[this.state.currentIndex] = upd;
      this.paintTaking(container, app);
    };

    container.querySelector('#ex-leave')?.addEventListener('click', async () => {
      await flushShort();
      await DB.updateExamElapsed(exam.id, this.state.elapsedSeconds);
      this.cleanup();
      app.toast('考试进度已自动保存，随时可继续作答');
      app.navigate('home');
    });

    container.querySelector('#exam-clock')?.addEventListener('click', () => {
      this.state.paused = !this.state.paused;
      if (this.state.paused) DB.updateExamElapsed(exam.id, this.state.elapsedSeconds).catch(() => {});
      app.toast(this.state.paused ? '已暂停计时' : '已恢复计时');
      this.paintTaking(container, app);
    });

    container.querySelectorAll('[data-ex-opt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (Date.now() < (this.state.suppressClickUntil || 0)) return;
        if (item.is_locked) return;
        const letter = btn.dataset.exOpt;
        if (item.qtype === 'multiple') {
          const cur = (instant && this.state.multiDraft[item.id] !== undefined) ? this.state.multiDraft[item.id] : (item.user_answer || '');
          const set = new Set(cur.split('').filter(Boolean));
          if (set.has(letter)) set.delete(letter);
          else set.add(letter);
          const next = [...set].sort().join('');
          if (instant) {
            this.state.multiDraft[item.id] = next;
            this.paintTaking(container, app);
          } else {
            saveAns(next);
          }
        } else {
          saveAns(letter);
        }
      });
    });

    container.querySelector('#btn-ex-multi-lock')?.addEventListener('click', () => {
      if (Date.now() < (this.state.suppressClickUntil || 0)) return;
      const d = this.state.multiDraft[item.id] || '';
      if (d) saveAns(d);
    });

    const shortEl = container.querySelector('#ex-short-inp');
    if (shortEl && !item.is_locked) {
      shortEl.addEventListener('input', (e) => {
        this.state.shortDraft[item.id] = e.target.value;
        if (!instant) {
          if (this.state.shortSaveTimer) clearTimeout(this.state.shortSaveTimer);
          this.state.shortSaveTimer = setTimeout(async () => {
            const upd = await DB.answerExamItem(exam.id, item.id, e.target.value, this.state.elapsedSeconds);
            const idx = exam.items.findIndex((x) => x.id === item.id);
            if (idx >= 0) exam.items[idx] = upd;
          }, 450);
        }
      });
    }
    container.querySelector('#btn-ex-short-lock')?.addEventListener('click', () => {
      if (Date.now() < (this.state.suppressClickUntil || 0)) return;
      const val = (this.state.shortDraft[item.id] ?? item.user_answer ?? '').trim();
      if (!val) { app.toast('请先输入作答内容', 'warning'); return; }
      saveAns(val);
    });

    const applyIG = async (sc) => {
      this.state.exam = await DB.gradeExamShort(exam.id, item.id, sc);
      app.toast(`本题已评定 ${sc} 分`, 'success');
      this.paintTaking(container, app);
    };
    container.querySelectorAll('[data-ig]').forEach((b) => b.addEventListener('click', () => applyIG(Number(b.dataset.ig))));
    container.querySelector('#btn-ig-save')?.addEventListener('click', () => {
      applyIG(Number(container.querySelector('#ig-custom').value || 0));
    });

    container.querySelector('#ex-flag')?.addEventListener('click', async () => {
      const res = await DB.toggleExamFlag(exam.id, item.id);
      item.flagged = res.flagged;
      this.paintTaking(container, app);
    });
    container.querySelector('#ex-star')?.addEventListener('click', async () => {
      const res = await DB.toggleBookmark(item.question_id);
      item.bookmarked = res.bookmarked;
      this.paintTaking(container, app);
    });

    const goIdx = async (idx) => {
      await flushShort();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      this.state.currentIndex = Math.max(0, Math.min(idx, exam.items.length - 1));
      this.paintTaking(container, app);
      window.scrollTo({ top: 0, behavior: 'instant' });
    };

    container.querySelector('#ex-prev')?.addEventListener('click', () => goIdx(this.state.currentIndex - 1));
    container.querySelector('#ex-next')?.addEventListener('click', () => goIdx(this.state.currentIndex + 1));
    container.querySelector('#ex-next-blank')?.addEventListener('click', () => {
      const after = exam.items.findIndex((x, i) => i > this.state.currentIndex && !x.is_answered);
      const target = after >= 0 ? after : exam.items.findIndex((x) => !x.is_answered);
      if (target >= 0) goIdx(target);
      else app.toast('全部题目均已作答！', 'success');
    });

    container.querySelector('#ex-sheet-btn')?.addEventListener('click', () => {
      this.openExamSheetDrawer(container, app, goIdx);
    });

    const promptSubmit = async () => {
      await flushShort();
      const blank = exam.items.filter((i) => !i.is_answered).length;
      const flagged = exam.items.filter((i) => i.flagged).length;
      let msg = '确定现在交卷并生成成绩单吗？';
      if (blank || flagged) {
        const p = [];
        if (blank) p.push(`还有 ${blank} 题未作答`);
        if (flagged) p.push(`有 ${flagged} 题标记存疑`);
        msg = `提示：${p.join('，')}。确认交卷吗？`;
      }
      const ok = await app.confirm('确认交卷', msg, '确认交卷');
      if (ok) await this.doSubmitExam(container, app);
    };
    container.querySelector('#ex-submit')?.addEventListener('click', promptSubmit);
    container.querySelector('#ex-finish-btn')?.addEventListener('click', promptSubmit);

    // Touch swipe left / right (eliminates ghost clicks & sticky focus!)
    const swipe = container.querySelector('#exam-swipe-area');
    if (swipe) {
      let sx = 0, sy = 0, active = false, moved = false;
      swipe.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) { active = false; return; }
        if (e.target.closest('input, textarea')) { active = false; return; }
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        active = true;
        moved = false;
      }, { passive: true });
      swipe.addEventListener('touchmove', (e) => {
        if (!active || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - sx;
        const dy = e.touches[0].clientY - sy;
        if (Math.hypot(dx, dy) > 10) {
          moved = true;
          this.state.suppressClickUntil = Date.now() + 600;
          window.ST.suppressClicksFor(600);
        }
      }, { passive: true });
      swipe.addEventListener('touchcancel', () => { active = false; }, { passive: true });
      swipe.addEventListener('touchend', (e) => {
        if (!active || e.changedTouches.length !== 1) { active = false; return; }
        active = false;
        const dx = e.changedTouches[0].clientX - sx;
        const dy = e.changedTouches[0].clientY - sy;
        if (moved || Math.abs(dx) > 10) {
          this.state.suppressClickUntil = Date.now() + 650;
          window.ST.suppressClicksFor(650);
        }
        if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          if (e.cancelable) e.preventDefault();
          this.state.suppressClickUntil = Date.now() + 700;
          window.ST.suppressClicksFor(700);
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          const nextIdx = dx < 0
            ? (this.state.currentIndex < exam.items.length - 1 ? this.state.currentIndex + 1 : -1)
            : (this.state.currentIndex > 0 ? this.state.currentIndex - 1 : -1);
          if (nextIdx >= 0) {
            requestAnimationFrame(() => goIdx(nextIdx));
          }
        }
      }, { passive: false });
    }
  },

  openExamSheetDrawer(container, app, goIdx) {
    const { QTYPE_META } = window.ST;
    const exam = this.state.exam;
    const instant = Boolean(exam.config?.instant_feedback);
    const cn = ['一', '二', '三', '四'];
    let g = 0;

    const groupsHtml = ['single', 'multiple', 'judge', 'short'].map((t) => {
      const list = exam.items.map((it, idx) => ({ it, idx })).filter((x) => x.it.qtype === t);
      if (!list.length) return '';
      const firstNum = list[0].idx + 1;
      const lastNum = list[list.length - 1].idx + 1;
      const rangeText = firstNum === lastNum ? `第 ${firstNum} 题` : `${firstNum} – ${lastNum} 题`;
      const dots = list.map(({ it, idx }) => {
        let cls = 'sheet-dot';
        if (idx === this.state.currentIndex) cls += ' current';
        if (it.revealed && !it.needs_manual_grade) {
          cls += it.is_correct === 1 ? ' correct' : it.is_correct === 2 ? ' partial' : ' wrong';
        } else if (it.is_answered) {
          cls += ' answered';
        }
        if (it.flagged) cls += ' flagged';
        return `<button type="button" class="${cls}" data-es-idx="${idx}">${idx + 1}</button>`;
      }).join('');
      return `
        <div style="display:flex;align-items:center;gap:8px;margin:14px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--border);">
          ${window.ST.qtypeBadgeHtml(t)}
          <strong class="mono" style="font-size:13px;">${rangeText}</strong>
          <span style="font-size:12px;color:var(--text-3);">共 ${list.length} 题</span>
        </div>
        <div class="sheet-circles">${dots}</div>
      `;
    }).join('');

    app.openDrawer({
      title: '考场答题卡',
      bodyHtml: `
        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--text-2);margin-bottom:8px;">
          <span><strong style="color:var(--brand)">●</strong> 已答</span>
          ${instant ? `<span><strong style="color:var(--green)">●</strong> 对</span><span><strong style="color:var(--red)">●</strong> 错</span>` : ''}
          <span><strong style="color:var(--amber)">•</strong> 存疑</span>
        </div>
        ${groupsHtml}
      `,
      onMount: (root) => {
        root.querySelectorAll('[data-es-idx]').forEach((b) => {
          b.addEventListener('click', () => {
            app.closeDrawer();
            goIdx(Number(b.dataset.esIdx));
          });
        });
      },
    });
  },

  async doSubmitExam(container, app) {
    this.cleanup();
    const { DB } = window.ST;
    this.state.exam = await DB.submitExam(this.state.exam.id, this.state.elapsedSeconds);
    this.state.mode = 'result';
    this.state.reviewFilter = 'all';
    this.paintResult(container, app);
    app.toast('交卷成功！成绩单已生成', 'success');
  },

  // =========================================================================
  // 3. Result Report & Paper Review
  // =========================================================================

  paintResult(container, app) {
    const { escapeHtml, formatAnswerLabel, formatDuration, formatNum, qtypeBadgeHtml, QTYPE_META } = window.ST;
    const exam = this.state.exam;
    const items = exam.items;
    const pending = items.filter((i) => i.needs_manual_grade);
    const wrong = items.filter((i) => !i.needs_manual_grade && i.is_correct !== 1);
    const blank = items.filter((i) => !i.is_answered);
    const okCount = items.filter((i) => i.is_correct === 1).length;
    const pct = exam.total_score > 0 ? Math.round((exam.earned_score / exam.total_score) * 100) : 0;

    let shown = items;
    if (this.state.reviewFilter === 'wrong') shown = wrong;
    else if (this.state.reviewFilter === 'unanswered') shown = blank;
    else if (this.state.reviewFilter === 'pending') shown = pending;

    const breakdownHtml = Object.entries(exam.breakdown || {}).map(([t, info]) => {
      const m = QTYPE_META[t];
      return `
        <tr>
          <td><span class="badge ${m.cls}">${m.label}</span></td>
          <td class="mono">${info.count}</td>
          <td class="mono" style="color:var(--green);font-weight:700;">${info.correct}</td>
          <td class="mono" style="font-weight:800;">${formatNum(info.earned_score)} / ${formatNum(info.max_score)}</td>
        </tr>
      `;
    }).join('');

    const cardsHtml = shown.length
      ? shown.map((it) => {
          const isShort = it.qtype === 'short';
          const badge = it.needs_manual_grade
            ? `<span class="badge badge-warning">待打分</span>`
            : it.is_correct === 1
            ? `<span class="badge badge-success">✓ +${formatNum(it.earned_score)}分</span>`
            : it.is_correct === 2
            ? `<span class="badge badge-warning">◐ +${formatNum(it.earned_score)}分</span>`
            : `<span class="badge badge-danger">✕ 0/${formatNum(it.score_value)}分</span>`;

          let detail = '';
          if (isShort) {
            const half = Math.round(it.score_value * 5) / 10;
            detail = `
              <div style="background:var(--bg-subtle);padding:10px 12px;border-radius:10px;margin-bottom:10px;font-size:13.5px;">
                <strong style="color:var(--text-3);font-size:12px;">你的作答：</strong>
                <div style="white-space:pre-wrap;margin-top:4px;line-height:1.65;">${escapeHtml(it.user_answer || '（未作答）')}</div>
              </div>
              <div class="explain-box is-ok" style="margin-top:0;">
                <div class="explain-row" style="margin-top:0;"><span class="explain-key">参考答案：</span>${escapeHtml(it.display_answer)}</div>
                ${it.scoring_criteria ? `<div class="explain-row"><span class="explain-key">评分标准：</span>${escapeHtml(it.scoring_criteria)}</div>` : ''}
                ${it.explanation ? `<div class="explain-row"><span class="explain-key">解析：</span>${escapeHtml(it.explanation)}</div>` : ''}
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px dashed var(--border-strong);">
                  <span style="font-size:12.5px;font-weight:700;">自评：</span>
                  <button type="button" class="btn btn-sm btn-soft-danger" data-rg="${it.id}" data-sc="0">0分</button>
                  <button type="button" class="btn btn-sm btn-secondary" data-rg="${it.id}" data-sc="${half}">${formatNum(half)}分</button>
                  <button type="button" class="btn btn-sm btn-success" data-rg="${it.id}" data-sc="${it.score_value}">满分</button>
                  <input type="number" class="num-input" style="width:64px;" id="rg-inp-${it.id}" min="0" max="${it.score_value}" step="0.5" value="${it.needs_manual_grade ? it.score_value : it.earned_score}" />
                  <button type="button" class="btn btn-sm btn-primary" data-rg-save="${it.id}">保存</button>
                </div>
              </div>
            `;
          } else {
            const cSet = new Set((it.display_answer || '').split(''));
            const uSet = new Set((it.user_answer || '').split(''));
            const opts = it.options.map((txt, idx) => {
              const letter = String.fromCharCode(65 + idx);
              const s = uSet.has(letter), c = cSet.has(letter);
              let cls = 'opt-btn locked';
              let tag = '';
              if (s && c) { cls += ' correct'; tag = `<span class="opt-tag ok">✓</span>`; }
              else if (s && !c) { cls += ' wrong'; tag = `<span class="opt-tag err">你选</span>`; }
              else if (!s && c) { cls += ' missed'; tag = `<span class="opt-tag ok">答案</span>`; }
              return `
                <div class="${cls}" style="padding:9px 12px;font-size:14px;">
                  <span class="opt-letter" style="width:24px;height:24px;font-size:12px;">${it.qtype === 'judge' ? (letter === 'A' ? '✓' : '✕') : letter}</span>
                  <span class="opt-label">${escapeHtml(txt)}</span>${tag}
                </div>
              `;
            }).join('');
            detail = `
              <div class="opt-list" style="margin-bottom:10px;gap:8px;">${opts}</div>
              <div style="font-size:13px;color:var(--text-2);display:flex;gap:14px;flex-wrap:wrap;">
                <span>你选：<strong style="color:${it.is_correct === 1 ? 'var(--green)' : 'var(--red)'}">${escapeHtml(formatAnswerLabel(it.qtype, it.user_answer))}</strong></span>
                <span>答案：<strong style="color:var(--green)">${escapeHtml(formatAnswerLabel(it.qtype, it.display_answer))}</strong></span>
                ${it.explanation ? `<span>解析：${escapeHtml(it.explanation)}</span>` : ''}
              </div>
            `;
          }

          return `
            <div class="card">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                  <strong class="mono">#${it.item_order}</strong>
                  ${qtypeBadgeHtml(it.qtype)}
                  ${badge}
                </div>
                <button type="button" class="foot-tool-btn ${it.bookmarked ? 'starred' : ''}" style="padding:3px 8px;font-size:12.5px;" data-r-star="${it.question_id}">
                  ${it.bookmarked ? '★ 已收藏' : '☆ 收藏'}
                </button>
              </div>
              <div style="font-size:15.5px;font-weight:600;line-height:1.65;margin-bottom:12px;">${escapeHtml(it.content)}</div>
              ${detail}
            </div>
          `;
        }).join('')
      : `<div class="card empty-box"><div class="empty-ico">🎉</div><div class="empty-ttl">此筛选下没有题目</div></div>`;

    container.innerHTML = `
      <div class="study-page">
        <header class="study-header">
          <div class="study-header-inner">
            <button type="button" class="back-btn" id="res-home">← 首页</button>
            <strong style="font-size:16px;">考试成绩单</strong>
            <button type="button" class="back-btn" id="res-retake" style="font-size:13.5px;color:var(--brand);">再考一次</button>
          </div>
        </header>

        <div class="container">
          ${pending.length > 0 ? `
            <div class="card" style="background:var(--amber-soft);border-color:var(--amber-border);display:flex;align-items:center;justify-content:space-between;gap:10px;">
              <div style="font-size:13.5px;"><strong>📝 有 ${pending.length} 道简答题待自评打分</strong>，打分后自动更新总分。</div>
              <button class="btn btn-primary btn-sm" id="res-go-pending">去打分</button>
            </div>
          ` : ''}

          <div class="card">
            <div class="score-hero">
              <div class="score-ring ${exam.passed ? '' : 'fail'}">
                <div class="score-ring-val" style="color:${exam.passed ? 'var(--green)' : 'var(--red)'}">${formatNum(exam.earned_score)}</div>
                <div class="score-ring-sub">满分 ${formatNum(exam.total_score)}</div>
              </div>
              <div style="flex:1;min-width:200px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                  <span class="badge ${exam.passed ? 'badge-success' : 'badge-danger'}" style="font-size:13px;padding:4px 11px;">
                    ${exam.passed ? '🎉 考试及格' : '📌 暂未及格'}
                  </span>
                  <span class="mono" style="font-weight:700;color:var(--text-2);">得分率 ${pct}%</span>
                </div>
                <div style="font-size:13px;color:var(--text-2);line-height:1.8;">
                  <div>${escapeHtml(exam.title)}</div>
                  <div>及格线 <strong>${formatNum(exam.pass_score)}</strong> 分 · 用时 <strong>${formatDuration(exam.elapsed_seconds)}</strong></div>
                  <div>答对 <strong>${okCount}/${items.length}</strong> 题 · 错题 <strong>${wrong.length}</strong> 道（已自动入错题本）</div>
                </div>
              </div>
            </div>

            <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);overflow-x:auto;">
              <table class="cfg-table">
                <thead><tr><th>题型</th><th>题数</th><th>答对</th><th>得分 / 满分</th></tr></thead>
                <tbody>${breakdownHtml}</tbody>
              </table>
            </div>

            <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;" class="no-print">
              <button class="btn btn-secondary btn-sm" id="res-print">🖨 打印试卷</button>
              <button class="btn btn-secondary btn-sm" id="res-reconfig">重新组卷</button>
              <button class="btn btn-primary btn-sm" id="res-retake-2">🔁 同配置再考</button>
            </div>
          </div>

          <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;" class="no-print">
            <button class="chip ${this.state.reviewFilter === 'all' ? 'active' : ''}" data-rf="all">全部 (${items.length})</button>
            <button class="chip ${this.state.reviewFilter === 'wrong' ? 'active' : ''}" data-rf="wrong">仅错题 (${wrong.length})</button>
            <button class="chip ${this.state.reviewFilter === 'unanswered' ? 'active' : ''}" data-rf="unanswered">未答 (${blank.length})</button>
            ${pending.length > 0 ? `<button class="chip ${this.state.reviewFilter === 'pending' ? 'active' : ''}" data-rf="pending">待评简答 (${pending.length})</button>` : ''}
          </div>

          <div>${cardsHtml}</div>
        </div>
      </div>
    `;

    const { DB } = window.ST;
    container.querySelector('#res-home')?.addEventListener('click', () => app.navigate('home'));
    container.querySelector('#res-reconfig')?.addEventListener('click', () => app.navigate('exam'));
    container.querySelector('#res-print')?.addEventListener('click', () => window.print());
    const retake = async () => {
      const neo = await DB.createExam(exam.config);
      app.navigate('exam', { examId: neo.id });
    };
    container.querySelector('#res-retake')?.addEventListener('click', retake);
    container.querySelector('#res-retake-2')?.addEventListener('click', retake);
    container.querySelector('#res-go-pending')?.addEventListener('click', () => {
      this.state.reviewFilter = 'pending';
      this.paintResult(container, app);
    });
    container.querySelectorAll('[data-rf]').forEach((b) => {
      b.addEventListener('click', () => { this.state.reviewFilter = b.dataset.rf; this.paintResult(container, app); });
    });

    const saveGrade = async (itemId, sc) => {
      this.state.exam = await DB.gradeExamShort(exam.id, itemId, sc);
      app.toast(`简答题已评 ${sc} 分，总分已更新`, 'success');
      this.paintResult(container, app);
    };
    container.querySelectorAll('[data-rg]').forEach((b) => b.addEventListener('click', () => saveGrade(Number(b.dataset.rg), Number(b.dataset.sc))));
    container.querySelectorAll('[data-rg-save]').forEach((b) => b.addEventListener('click', () => {
      const id = Number(b.dataset.rgSave);
      saveGrade(id, Number(container.querySelector(`#rg-inp-${id}`)?.value || 0));
    }));

    container.querySelectorAll('[data-r-star]').forEach((b) => {
      b.addEventListener('click', async () => {
        const qid = Number(b.dataset.rStar);
        const res = await DB.toggleBookmark(qid);
        exam.items.forEach((it) => { if (it.question_id === qid) it.bookmarked = res.bookmarked; });
        this.paintResult(container, app);
      });
    });
  },

  handleKeydown(e, container) {
    if (this.state.mode !== 'taking') return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); container.querySelector('#ex-prev')?.click(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); container.querySelector('#ex-next')?.click(); }
    else {
      const map = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'E', '6': 'F', a: 'A', b: 'B', c: 'C', d: 'D', e: 'E', f: 'F' };
      const l = map[e.key.toLowerCase()];
      if (l) {
        const btn = container.querySelector(`[data-ex-opt="${l}"]:not([disabled])`);
        if (btn) { e.preventDefault(); btn.click(); }
      }
    }
  },
};
