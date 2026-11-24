/**
 * Search, Wrong Book, Bookmarks, Exam History, and Profile/Settings Views
 */
window.ST = window.ST || {};
window.ST.Views = window.ST.Views || {};

function highlightText(text, kw) {
  const esc = window.ST.escapeHtml(text || '');
  if (!kw || !kw.trim()) return esc;
  const safeKw = kw.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return esc.replace(new RegExp(`(${safeKw})`, 'gi'), '<mark class="hl">$1</mark>');
}

// =========================================================================
// 1. Search View — 题库秒搜（刷题神器经典搜题页）
// =========================================================================
window.ST.Views.search = {
  state: { keyword: '', qtype: 'all' },

  async render(container, app) {
    const { DB, escapeHtml, formatAnswerLabel, qtypeBadgeHtml } = window.ST;
    const kw = this.state.keyword;

    const res = kw.trim()
      ? await DB.listQuestions({ bankId: app.state.activeBankId, qtype: this.state.qtype, keyword: kw })
      : { total: 0, items: [] };

    const resultsHtml = kw.trim()
      ? (res.items.length
          ? res.items.slice(0, 80).map((q) => {
              const optsHtml = (q.qtype === 'single' || q.qtype === 'multiple')
                ? `<div style="margin:8px 0;font-size:13px;color:var(--text-2);line-height:1.65;">
                    ${q.options.map((o, i) => {
                      const l = String.fromCharCode(65 + i);
                      const isAns = q.answer.includes(l);
                      return `<div style="${isAns ? 'color:var(--green);font-weight:700;' : ''}">${l}. ${highlightText(o, kw)}</div>`;
                    }).join('')}
                  </div>`
                : '';
              return `
                <div class="card">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                      ${qtypeBadgeHtml(q.qtype)}
                      <span class="badge badge-neutral">${escapeHtml(q.category)}</span>
                    </div>
                    <button class="btn btn-sm btn-soft" data-sr-jump="${q.id}">去练习</button>
                  </div>
                  <div style="font-size:15px;font-weight:600;line-height:1.65;">${highlightText(q.content, kw)}</div>
                  ${optsHtml}
                  <div style="margin-top:8px;padding:8px 11px;border-radius:10px;background:var(--green-soft);font-size:13px;">
                    <strong style="color:var(--green);">正确答案：${escapeHtml(formatAnswerLabel(q.qtype, q.answer))}</strong>
                    ${q.explanation ? `<div style="color:var(--text-2);margin-top:4px;">解析：${highlightText(q.explanation, kw)}</div>` : ''}
                  </div>
                </div>
              `;
            }).join('')
          : `<div class="card empty-box"><div class="empty-ico">🔍</div><div class="empty-ttl">未找到包含「${escapeHtml(kw)}」的题目</div><p>试试更短的关键词，或在首页切换至「全部题库」搜索。</p></div>`)
      : `<div class="card empty-box">
          <div class="empty-ico">🔎</div>
          <div class="empty-ttl">题库极速搜题</div>
          <p style="margin:6px 0 14px;">输入题干关键词、选项文字、试题编号或章节名称，立即匹配标准答案。</p>
          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
            <button class="chip" data-hot-kw="馈线自动化">馈线自动化</button>
            <button class="chip" data-hot-kw="隔离">隔离</button>
            <button class="chip" data-hot-kw="遥信">遥信</button>
            <button class="chip" data-hot-kw="加密">加密</button>
            <button class="chip" data-hot-kw="光纤">光纤</button>
          </div>
        </div>`;

    container.innerHTML = `
      <div class="container">
        <div class="section-bar">
          <h1 class="section-title">题库搜题</h1>
          ${kw.trim() ? `<span style="font-size:12.5px;color:var(--text-3);">匹配 ${res.total} 题</span>` : ''}
        </div>

        <div class="search-box">
          <input type="search" id="sr-inp" placeholder="输入题目关键词、选项或编号..." value="${escapeHtml(kw)}" autocomplete="off" />
          ${kw ? `<button type="button" class="btn btn-sm btn-secondary" style="border-radius:99px;" id="sr-clear">清空</button>` : ''}
          <button type="button" class="btn btn-sm btn-primary" style="border-radius:99px;" id="sr-go">搜题</button>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
          ${[['all', '全部'], ['single', '单选'], ['multiple', '多选'], ['judge', '判断'], ['short', '简答']].map(([v, l]) =>
            `<button class="chip ${this.state.qtype === v ? 'active' : ''}" data-sr-t="${v}">${l}</button>`
          ).join('')}
        </div>

        <div>${resultsHtml}</div>
      </div>
    `;

    const inp = container.querySelector('#sr-inp');
    const triggerSearch = () => {
      this.state.keyword = inp.value;
      this.render(container, app);
    };
    container.querySelector('#sr-go')?.addEventListener('click', triggerSearch);
    inp?.addEventListener('keydown', (e) => { if (e.key === 'Enter') triggerSearch(); });
    container.querySelector('#sr-clear')?.addEventListener('click', () => {
      this.state.keyword = '';
      this.render(container, app);
    });
    container.querySelectorAll('[data-hot-kw]').forEach((b) => {
      b.addEventListener('click', () => { this.state.keyword = b.dataset.hotKw; this.render(container, app); });
    });
    container.querySelectorAll('[data-sr-t]').forEach((b) => {
      b.addEventListener('click', () => { this.state.qtype = b.dataset.srT; this.render(container, app); });
    });
    container.querySelectorAll('[data-sr-jump]').forEach((b) => {
      b.addEventListener('click', () => {
        app.navigate('practice', {
          mode: 'sequential',
          qtype: 'all',
          category: 'all',
          status: 'all',
          jumpQuestionId: Number(b.dataset.srJump),
          returnTo: 'search',
        });
      });
    });
  },
};

// =========================================================================
// 2. Wrong Book View — 我的错题
// =========================================================================
window.ST.Views.wrong = {
  immersive: true,
  state: { qtype: 'all' },

  async render(container, app) {
    const { DB, Importer, escapeHtml, formatAnswerLabel, qtypeBadgeHtml } = window.ST;
    const bankId = app.state.activeBankId;
    const res = await DB.listQuestions({ bankId, qtype: this.state.qtype, status: 'wrong' });
    const items = res.items || [];

    const rowsHtml = items.map((q) => `
      <div class="list-row" style="align-items:flex-start;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">
            ${qtypeBadgeHtml(q.qtype)}
            <span style="font-size:12px;color:var(--red);font-weight:700;">错 ${q.stats.wrong_count} 次</span>
            <span style="font-size:12px;color:var(--text-3);">${escapeHtml(q.category)}</span>
          </div>
          <div style="font-size:14.5px;font-weight:600;line-height:1.55;">${escapeHtml(q.content)}</div>
          <div style="font-size:12.5px;color:var(--green);font-weight:700;margin-top:4px;">答案：${escapeHtml(formatAnswerLabel(q.qtype, q.answer).slice(0, 60))}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn btn-sm btn-soft" data-wp="${q.id}">重做</button>
          <button class="btn btn-sm btn-secondary" data-wr="${q.id}">已掌握</button>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="study-page">
        <header class="study-header">
          <div class="study-header-inner">
            <button type="button" class="back-btn" id="wr-back">← 返回</button>
            <strong style="font-size:16px;">我的错题（${items.length}）</strong>
            ${items.length ? `<button type="button" class="back-btn" id="wr-clear" style="font-size:13px;color:var(--red);">清空</button>` : `<span style="width:48px;"></span>`}
          </div>
        </header>

        <div class="container">
          ${items.length ? `
            <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
              <button class="btn btn-primary btn-sm" id="wr-quiz-all">🎯 重刷全部错题</button>
              <button class="btn btn-success btn-sm" id="wr-study-all">💡 背诵错题答案</button>
              <button class="btn btn-secondary btn-sm" id="wr-exp">⬇ 导出错题CSV</button>
            </div>
          ` : ''}

          <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
            ${[['all', '全部'], ['single', '单选'], ['multiple', '多选'], ['judge', '判断'], ['short', '简答']].map(([v, l]) =>
              `<button class="chip ${this.state.qtype === v ? 'active' : ''}" data-wt="${v}">${l}</button>`
            ).join('')}
          </div>

          ${items.length
            ? `<div class="card">${rowsHtml}</div>`
            : `<div class="card empty-box"><div class="empty-ico">🎉</div><div class="empty-ttl">目前没有待攻克的错题</div><p>在刷题或模拟考试中答错的题会自动收纳在这里。</p><button class="btn btn-primary" id="wr-go">去顺序刷题</button></div>`}
        </div>
      </div>
    `;

    container.querySelector('#wr-back')?.addEventListener('click', () => app.navigate('home'));
    container.querySelector('#wr-go')?.addEventListener('click', () => app.navigate('practice'));
    container.querySelector('#wr-quiz-all')?.addEventListener('click', () => {
      app.navigate('practice', { status: 'wrong', qtype: this.state.qtype, answerMode: false, returnTo: 'wrong' });
    });
    container.querySelector('#wr-study-all')?.addEventListener('click', () => {
      app.navigate('practice', { status: 'wrong', qtype: this.state.qtype, answerMode: true, returnTo: 'wrong' });
    });
    container.querySelector('#wr-exp')?.addEventListener('click', () => {
      Importer.triggerDownloadBlob(Importer.exportQuestionsCsvBlob(items), '我的错题本.csv');
      app.toast('已导出错题 CSV', 'success');
    });
    container.querySelector('#wr-clear')?.addEventListener('click', async () => {
      const ok = await app.confirm('清空错题本', '确定将当前错题全部标记为已掌握吗？', '确认清空', true);
      if (!ok) return;
      await DB.clearWrongBook(bankId);
      app.toast('错题本已清空', 'success');
      this.render(container, app);
    });
    container.querySelectorAll('[data-wt]').forEach((b) => b.addEventListener('click', () => { this.state.qtype = b.dataset.wt; this.render(container, app); }));
    container.querySelectorAll('[data-wp]').forEach((b) => b.addEventListener('click', () => {
      app.navigate('practice', { status: 'wrong', qtype: this.state.qtype, jumpQuestionId: Number(b.dataset.wp), returnTo: 'wrong' });
    }));
    container.querySelectorAll('[data-wr]').forEach((b) => b.addEventListener('click', async () => {
      await DB.setWrongBook(Number(b.dataset.wr), false);
      app.toast('已移出错题本', 'success');
      this.render(container, app);
    }));
  },
};

// =========================================================================
// 3. Bookmarks View — 我的收藏
// =========================================================================
window.ST.Views.bookmarks = {
  immersive: true,

  async render(container, app) {
    const { DB, Importer, escapeHtml, formatAnswerLabel, qtypeBadgeHtml } = window.ST;
    const res = await DB.listQuestions({ bankId: app.state.activeBankId, status: 'bookmarked' });
    const items = res.items || [];

    const rowsHtml = items.map((q) => `
      <div class="list-row" style="align-items:flex-start;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            ${qtypeBadgeHtml(q.qtype)}
            <span style="font-size:12px;color:var(--text-3);">${escapeHtml(q.category)}</span>
          </div>
          <div style="font-size:14.5px;font-weight:600;line-height:1.55;">${escapeHtml(q.content)}</div>
          ${q.stats.note ? `<div style="font-size:12px;color:var(--brand);margin-top:3px;">📝 ${escapeHtml(q.stats.note)}</div>` : ''}
          <div style="font-size:12.5px;color:var(--green);font-weight:700;margin-top:4px;">答案：${escapeHtml(formatAnswerLabel(q.qtype, q.answer).slice(0, 60))}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn btn-sm btn-soft" data-bp="${q.id}">练习</button>
          <button class="btn btn-sm btn-secondary" data-br="${q.id}">取消</button>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="study-page">
        <header class="study-header">
          <div class="study-header-inner">
            <button type="button" class="back-btn" id="bm-back">← 返回</button>
            <strong style="font-size:16px;">我的收藏（${items.length}）</strong>
            <span style="width:48px;"></span>
          </div>
        </header>
        <div class="container">
          ${items.length ? `
            <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
              <button class="btn btn-primary btn-sm" id="bm-quiz">📝 刷收藏题</button>
              <button class="btn btn-success btn-sm" id="bm-study">💡 背诵收藏</button>
              <button class="btn btn-secondary btn-sm" id="bm-exp">⬇ 导出CSV</button>
            </div>
            <div class="card">${rowsHtml}</div>
          ` : `
            <div class="card empty-box"><div class="empty-ico">⭐</div><div class="empty-ttl">暂无收藏题目</div><p>刷题时点击左下角「收藏」即可把重点难题收进这里。</p></div>
          `}
        </div>
      </div>
    `;

    container.querySelector('#bm-back')?.addEventListener('click', () => app.navigate('home'));
    container.querySelector('#bm-quiz')?.addEventListener('click', () => app.navigate('practice', { status: 'bookmarked', answerMode: false, returnTo: 'bookmarks' }));
    container.querySelector('#bm-study')?.addEventListener('click', () => app.navigate('practice', { status: 'bookmarked', answerMode: true, returnTo: 'bookmarks' }));
    container.querySelector('#bm-exp')?.addEventListener('click', () => {
      Importer.triggerDownloadBlob(Importer.exportQuestionsCsvBlob(items), '我的收藏题目.csv');
      app.toast('已导出收藏 CSV', 'success');
    });
    container.querySelectorAll('[data-bp]').forEach((b) => b.addEventListener('click', () => {
      app.navigate('practice', { status: 'bookmarked', jumpQuestionId: Number(b.dataset.bp), returnTo: 'bookmarks' });
    }));
    container.querySelectorAll('[data-br]').forEach((b) => b.addEventListener('click', async () => {
      await DB.toggleBookmark(Number(b.dataset.br), false);
      app.toast('已取消收藏');
      this.render(container, app);
    }));
  },
};

// =========================================================================
// 4. Exam History View — 考试记录
// =========================================================================
window.ST.Views.history = {
  immersive: true,

  async render(container, app) {
    const { DB, escapeHtml, formatDuration, formatNum } = window.ST;
    const exams = await DB.listExams();

    const rowsHtml = exams.map((ex) => {
      const cfg = ex.config || {};
      const tags = [
        cfg.instant_feedback ? '即时答案' : '考后阅卷',
        cfg.shuffle_options ? '选项乱序' : '',
        cfg.prioritize_wrong ? '错题优先' : '',
        cfg.prioritize_unseen ? '未做优先' : '',
      ].filter(Boolean).join(' · ');

      const badge = ex.status === 'in_progress'
        ? `<span class="badge badge-warning">进行中</span>`
        : ex.pending_grade_count > 0
        ? `<span class="badge badge-warning">待评简答(${ex.pending_grade_count})</span>`
        : ex.passed
        ? `<span class="badge badge-success">✓ 及格</span>`
        : `<span class="badge badge-danger">✕ 未及格</span>`;

      return `
        <div class="list-row" style="align-items:flex-start;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <strong style="font-size:15px;">${escapeHtml(ex.title)}</strong>
              ${badge}
            </div>
            <div style="font-size:12px;color:var(--text-3);margin-top:4px;">
              ${escapeHtml(ex.started_at)} · ${tags}
            </div>
            <div class="mono" style="font-size:13px;margin-top:5px;">
              得分：<strong style="color:${ex.status === 'completed' ? (ex.passed ? 'var(--green)' : 'var(--red)') : 'var(--text-2)'};">
                ${ex.status === 'completed' ? formatNum(ex.earned_score) : '—'} / ${formatNum(ex.total_score)}
              </strong>
              <span style="color:var(--text-3);margin-left:10px;">及格 ${formatNum(ex.pass_score)} · 用时 ${formatDuration(ex.elapsed_seconds)}</span>
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button class="btn btn-sm ${ex.status === 'in_progress' ? 'btn-primary' : 'btn-soft'}" data-he-open="${ex.id}">
              ${ex.status === 'in_progress' ? '继续' : '解析'}
            </button>
            <button class="btn btn-sm btn-soft-danger" data-he-del="${ex.id}">删</button>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="study-page">
        <header class="study-header">
          <div class="study-header-inner">
            <button type="button" class="back-btn" id="eh-back">← 返回</button>
            <strong style="font-size:16px;">考试记录（${exams.length}）</strong>
            <button type="button" class="back-btn" id="eh-new" style="font-size:13.5px;color:var(--brand);">去模考</button>
          </div>
        </header>
        <div class="container">
          ${exams.length
            ? `<div class="card">${rowsHtml}</div>`
            : `<div class="card empty-box"><div class="empty-ico">📋</div><div class="empty-ttl">暂无模拟考试记录</div><p>去发起一场模拟考试检验复习成果吧！</p><button class="btn btn-primary" id="eh-first">立即模拟考试</button></div>`}
        </div>
      </div>
    `;

    container.querySelector('#eh-back')?.addEventListener('click', () => app.navigate('home'));
    container.querySelector('#eh-new')?.addEventListener('click', () => app.navigate('exam'));
    container.querySelector('#eh-first')?.addEventListener('click', () => app.navigate('exam'));
    container.querySelectorAll('[data-he-open]').forEach((b) => b.addEventListener('click', () => app.navigate('exam', { examId: Number(b.dataset.heOpen) })));
    container.querySelectorAll('[data-he-del]').forEach((b) => b.addEventListener('click', async () => {
      const ok = await app.confirm('删除记录', '确定要删除这条考试记录吗？', '删除', true);
      if (!ok) return;
      await DB.deleteExam(Number(b.dataset.heDel));
      app.toast('已删除', 'success');
      this.render(container, app);
    }));
  },
};

// =========================================================================
// 5. Profile / Settings / PWA Install & Backup View — 我的
// =========================================================================
window.ST.Views.me = {
  async render(container, app) {
    const { DB, Importer, escapeHtml } = window.ST;
    const dash = await DB.getDashboard(null);
    const s = app.state.settings;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    container.innerHTML = `
      <div class="container narrow">
        <div class="section-bar">
          <h1 class="section-title">我的与设置</h1>
          <span class="badge ${isStandalone ? 'badge-success' : 'badge-single'}">${isStandalone ? '✓ 已作为 PWA 应用运行' : 'PWA 离线网页版'}</span>
        </div>

        <!-- 总体学习成绩卡片 -->
        <div class="card" style="background:linear-gradient(135deg,#1677ff,#0ea5e9);color:#fff;border:none;">
          <div style="font-size:14px;font-weight:700;margin-bottom:12px;opacity:0.95;">📊 全库累计学习概览</div>
          <div class="hero-stats-row">
            <div><div class="hero-stat-num">${dash.practiced_questions}/${dash.total_questions}</div><div class="hero-stat-lbl">已刷题目</div></div>
            <div><div class="hero-stat-num">${dash.accuracy}%</div><div class="hero-stat-lbl">综合正确率</div></div>
            <div><div class="hero-stat-num">${dash.exam_stats.count}</div><div class="hero-stat-lbl">模拟考次数</div></div>
          </div>
        </div>

        <!-- PWA 安装到桌面/主屏幕 -->
        <div class="card">
          <div class="card-head" style="margin-bottom:8px;">
            <h2 class="card-title">📲 安装为手机 / 电脑 App（支持完全离线刷题）</h2>
          </div>
          <p style="margin:0 0 12px;font-size:13px;color:var(--text-2);line-height:1.65;">
            本软件为标准 <strong>PWA（渐进式网页应用）</strong>，安装到主屏幕或电脑桌面后，打开即全屏原生 App 体验，无浏览器地址栏，<strong>断网也能随时刷题与模拟考试</strong>。
          </p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${app.deferredInstallPrompt
              ? `<button class="btn btn-primary btn-sm" id="me-install-now">📲 一键安装到本设备</button>`
              : `<button class="btn btn-soft btn-sm" id="me-install-guide">📖 查看手机 / 电脑安装步骤</button>`}
          </div>
        </div>

        <!-- 界面与刷题偏好 -->
        <div class="card">
          <h2 class="card-title" style="margin-bottom:8px;">🎨 外观与刷题偏好</h2>
          <div class="setting-row">
            <div><div class="setting-title">界面主题</div><div class="setting-desc">经典蓝白 / 护眼米纸 / 夜间深色</div></div>
            <div style="display:flex;gap:6px;">
              <button class="chip ${s.theme === 'light' ? 'active' : ''}" data-mt="light">☀️ 蓝白</button>
              <button class="chip ${s.theme === 'eyecare' ? 'active' : ''}" data-mt="eyecare">🌿 护眼</button>
              <button class="chip ${s.theme === 'dark' ? 'active' : ''}" data-mt="dark">🌙 夜间</button>
            </div>
          </div>
          <div class="setting-row">
            <div><div class="setting-title">题干与选项字号</div></div>
            <div style="display:flex;gap:6px;">
              <button class="chip ${s.font_size === 'sm' ? 'active' : ''}" data-mf="sm">小</button>
              <button class="chip ${s.font_size === 'md' ? 'active' : ''}" data-mf="md">中</button>
              <button class="chip ${s.font_size === 'lg' ? 'active' : ''}" data-mf="lg">大</button>
            </div>
          </div>
          <label class="setting-row">
            <div><div class="setting-title">答对自动跳转下一题</div></div>
            <span class="switch"><input type="checkbox" id="me-autonext" ${s.practice_auto_next ? 'checked' : ''} /><span class="switch-track"></span></span>
          </label>
          <label class="setting-row">
            <div><div class="setting-title">错题答对后自动移出错题本</div></div>
            <span class="switch"><input type="checkbox" id="me-autorm" ${s.wrong_auto_remove ? 'checked' : ''} /><span class="switch-track"></span></span>
          </label>
        </div>

        <!-- 数据备份与换机迁移 -->
        <div class="card">
          <h2 class="card-title" style="margin-bottom:8px;">💾 数据备份与迁移（含题库、错题本、笔记与考试记录）</h2>
          <p style="margin:0 0 12px;font-size:12.5px;color:var(--text-3);line-height:1.6;">
            由于数据保存在当前浏览器的本地 IndexedDB 数据库中，换手机或清理浏览器数据前，建议导出完整 JSON 备份，随时一键还原。
          </p>
          <input type="file" id="me-restore-file" accept=".json" class="hidden" />
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" id="me-backup">📤 导出完整备份 (.json)</button>
            <button class="btn btn-secondary btn-sm" id="me-restore">📥 从备份恢复</button>
            <button class="btn btn-soft-danger btn-sm" id="me-reset-stats">重置全部刷题进度</button>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#me-install-now')?.addEventListener('click', () => app.promptInstallPWA());
    container.querySelector('#me-install-guide')?.addEventListener('click', () => {
      app.openModal({
        title: '📲 如何将「刷题神器」安装到手机 / 电脑',
        bodyHtml: `
          <div style="font-size:13.5px;line-height:1.8;color:var(--text-2);">
            <p style="margin-top:0;"><strong>📱 苹果 iPhone / iPad（Safari 浏览器）：</strong><br/>
            用 Safari 打开本网址 → 点击底部中间的 <strong>「分享 ↑」</strong> 按钮 → 下滑点击 <strong>「添加到主屏幕」</strong> → 点右上角「添加」即可。</p>
            <p><strong>📱 安卓手机（Chrome / Edge / 系统浏览器）：</strong><br/>
            点击浏览器右上角 <strong>「⋮ 菜单」</strong> → 选择 <strong>「安装应用」</strong> 或 <strong>「添加到主屏幕」</strong>。</p>
            <p style="margin-bottom:0;"><strong>💻 Windows / Mac 电脑（Edge / Chrome）：</strong><br/>
            点击地址栏右侧的 <strong>「安装应用图标」</strong>（或在菜单中选择「将此站点作为应用安装」），即可生成独立桌面快捷方式，断网可用。</p>
          </div>
        `,
        footerHtml: `<button class="btn btn-primary" data-m-close>明白了</button>`,
      });
    });

    container.querySelectorAll('[data-mt]').forEach((b) => b.addEventListener('click', async () => {
      await app.setTheme(b.dataset.mt);
      this.render(container, app);
    }));
    container.querySelectorAll('[data-mf]').forEach((b) => b.addEventListener('click', async () => {
      await app.setFontSize(b.dataset.mf);
      this.render(container, app);
    }));
    container.querySelector('#me-autonext')?.addEventListener('change', (e) => {
      s.practice_auto_next = e.target.checked;
      DB.updateSettings({ practice_auto_next: s.practice_auto_next });
    });
    container.querySelector('#me-autorm')?.addEventListener('change', (e) => {
      s.wrong_auto_remove = e.target.checked;
      DB.updateSettings({ wrong_auto_remove: s.wrong_auto_remove });
    });

    container.querySelector('#me-backup')?.addEventListener('click', async () => {
      const data = await DB.exportFullBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const dateTag = new Date().toISOString().slice(0, 10);
      Importer.triggerDownloadBlob(blob, `刷题神器完整备份_${dateTag}.json`);
      app.toast('完整备份已导出', 'success');
    });

    const restoreInp = container.querySelector('#me-restore-file');
    container.querySelector('#me-restore')?.addEventListener('click', () => restoreInp?.click());
    restoreInp?.addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const ok = await app.confirm('恢复完整备份', '恢复备份将覆盖当前浏览器内的题库、错题与考试记录，确定继续吗？', '确认恢复', true);
      if (!ok) { restoreInp.value = ''; return; }
      try {
        const parsed = JSON.parse(await f.text());
        const res = await DB.importFullBackup(parsed);
        app.state.settings = await DB.getSettings();
        app.state.banks = await DB.listBanks();
        app.state.activeBankId = app.state.settings.active_bank_id ?? (app.state.banks[0]?.id || null);
        app.applyTheme(app.state.settings.theme);
        app.applyFontSize(app.state.settings.font_size);
        app.toast(`恢复成功：${res.banks} 个题库、${res.questions} 道题`, 'success');
        this.render(container, app);
      } catch (err) {
        app.toast(err.message, 'error');
      }
      restoreInp.value = '';
    });

    container.querySelector('#me-reset-stats')?.addEventListener('click', async () => {
      const ok = await app.confirm('重置全部进度', '确定要清空所有题库的答题次数、正确率与错题状态吗？（题目、收藏与笔记会保留）', '确认重置', true);
      if (!ok) return;
      await DB.resetPracticeStats(null);
      app.toast('已重置全部刷题进度', 'success');
      this.render(container, app);
    });
  },
};
