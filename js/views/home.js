/**
 * Home View — 经典「刷题神器」风格首页（蓝白顶栏 + 双大圆球 + 2×4 功能宫格）
 */
window.ST = window.ST || {};
window.ST.Views = window.ST.Views || {};

window.ST.Views.home = {
  async render(container, app) {
    const { DB, escapeHtml, formatNum, QTYPE_META } = window.ST;
    const bankId = app.state.activeBankId;
    const [banks, dash] = await Promise.all([
      DB.listBanks(),
      DB.getDashboard(bankId),
    ]);
    app.state.banks = banks;

    const activeBank = banks.find((b) => b.id === bankId);
    const bankLabel = activeBank ? activeBank.name : '全部题库';
    const pct = dash.total_questions > 0
      ? Math.round((dash.practiced_questions / dash.total_questions) * 100)
      : 0;

    const resumeHtml = dash.in_progress_exam ? `
      <div class="card" style="background:var(--amber-soft);border-color:var(--amber-border);display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 16px;">
        <div>
          <div style="font-weight:700;font-size:13.5px;">⏳ 未完成考试：${escapeHtml(dash.in_progress_exam.title)}</div>
          <div style="font-size:12px;color:var(--text-2);margin-top:2px;">满分 ${formatNum(dash.in_progress_exam.total_score)} 分 · 点击随时继续</div>
        </div>
        <button class="btn btn-primary btn-sm" id="home-resume-exam" data-eid="${dash.in_progress_exam.id}">继续考</button>
      </div>
    ` : '';

    const typeChipsHtml = ['single', 'multiple', 'judge', 'short'].map((t) => {
      const info = dash.by_type[t] || { total: 0, practiced: 0, wrong_count: 0 };
      const m = QTYPE_META[t];
      return `
        <button type="button" class="list-row clickable" style="width:100%;border:none;background:transparent;text-align:left;" data-quick-type="${t}">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="badge ${m.cls}">${m.label}</span>
            <span style="font-weight:600;">${info.total} 题</span>
            ${info.wrong_count > 0 ? `<span style="font-size:12px;color:var(--red);">错 ${info.wrong_count}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;color:var(--text-3);font-size:12.5px;">
            <span class="mono">已练 ${info.practiced}/${info.total}</span>
            <span>›</span>
          </div>
        </button>
      `;
    }).join('');

    container.innerHTML = `
      <section class="home-hero">
        <div class="hero-top-row">
          <button type="button" class="hero-bank-btn" id="btn-pick-bank" title="点击切换当前刷题题库">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            <span class="hero-bank-name">${escapeHtml(bankLabel)}</span>
            <span style="font-size:12px;opacity:0.9;">▾</span>
          </button>
          <div style="display:flex;align-items:center;gap:8px;">
            ${app.deferredInstallPrompt ? `<button type="button" id="home-install-btn" class="hero-bank-btn" style="padding:6px 12px;font-size:12.5px;">📲 安装</button>` : ''}
            <button type="button" id="home-theme-btn" class="hero-circle-btn" title="切换主题" aria-label="切换主题">${app.themeIcon()}</button>
          </div>
        </div>

        <div class="hero-stats-row">
          <div>
            <div class="hero-stat-num">${dash.practiced_questions}<span style="font-size:13px;opacity:0.8;">/${dash.total_questions}</span></div>
            <div class="hero-stat-lbl">已刷题目</div>
          </div>
          <div>
            <div class="hero-stat-num">${dash.accuracy}<span style="font-size:13px;">%</span></div>
            <div class="hero-stat-lbl">答题正确率</div>
          </div>
          <div>
            <div class="hero-stat-num">${dash.wrong_book_count}</div>
            <div class="hero-stat-lbl">待攻克错题</div>
          </div>
        </div>

        <div class="hero-progress-wrap">
          <div style="display:flex;justify-content:space-between;font-size:11.5px;opacity:0.9;margin-bottom:5px;">
            <span>总刷题进度</span>
            <span class="mono">${pct}%</span>
          </div>
          <div class="hero-progress-track">
            <div class="hero-progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
      </section>

      <div class="container">
        <!-- 经典双大圆球核心区 -->
        <div class="twin-circles-card">
          <div class="twin-circles-row">
            <button type="button" class="big-circle-btn circle-blue" id="btn-big-seq">
              <span class="circle-emoji">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h7a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-7a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h8z"/></svg>
              </span>
              <span class="circle-title">顺序练习</span>
              <span class="circle-sub">${dash.practiced_questions}/${dash.total_questions}</span>
            </button>
            <button type="button" class="big-circle-btn circle-orange" id="btn-big-exam">
              <span class="circle-emoji">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9 2h6M12 2v3"/></svg>
              </span>
              <span class="circle-title">模拟考试</span>
              <span class="circle-sub">${dash.exam_stats.count > 0 ? `已考 ${dash.exam_stats.count} 次` : '全真组卷'}</span>
            </button>
          </div>

          <div class="twin-quick-strip">
            <button type="button" class="pill-shortcut" id="btn-quick-study">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>
              <span>背题模式（直接看答案）</span>
            </button>
            <button type="button" class="pill-shortcut" id="btn-quick-unseen">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              <span>只刷未做题</span>
            </button>
          </div>
        </div>

        ${resumeHtml}

        <!-- 刷题神器经典 2x4 功能九宫格 -->
        <div class="feature-grid-card">
          <div class="feature-grid">
            <button type="button" class="grid-item" data-act="random">
              <div class="grid-icon" style="background:#e0f2fe;color:#0284c7;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
              </div>
              <span class="grid-label">随机练习</span>
            </button>
            <button type="button" class="grid-item" data-act="by-type">
              <div class="grid-icon" style="background:#ede9fe;color:#7c3aed;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>
              </div>
              <span class="grid-label">题型练习</span>
            </button>
            <button type="button" class="grid-item" data-act="by-chapter">
              <div class="grid-icon" style="background:#ccfbf1;color:#0d9488;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              </div>
              <span class="grid-label">章节练习</span>
            </button>
            <button type="button" class="grid-item" data-act="wrong">
              <div class="grid-icon" style="background:#fee2e2;color:#dc2626;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                ${dash.wrong_book_count > 0 ? `<span class="grid-badge red">${dash.wrong_book_count > 99 ? '99+' : dash.wrong_book_count}</span>` : ''}
              </div>
              <span class="grid-label">我的错题</span>
            </button>

            <button type="button" class="grid-item" data-act="bookmarks">
              <div class="grid-icon" style="background:#fef3c7;color:#d97706;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                ${dash.bookmark_count > 0 ? `<span class="grid-badge amber">${dash.bookmark_count > 99 ? '99+' : dash.bookmark_count}</span>` : ''}
              </div>
              <span class="grid-label">我的收藏</span>
            </button>
            <button type="button" class="grid-item" data-act="search">
              <div class="grid-icon" style="background:#dbeafe;color:#2563eb;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <span class="grid-label">题库搜题</span>
            </button>
            <button type="button" class="grid-item" data-act="history">
              <div class="grid-icon" style="background:#dcfce7;color:#16a34a;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
              </div>
              <span class="grid-label">考试记录</span>
            </button>
            <button type="button" class="grid-item" data-act="import">
              <div class="grid-icon" style="background:#ffedd5;color:#ea580c;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>
              <span class="grid-label">导入题库</span>
            </button>
          </div>
        </div>

        <!-- 题型专项快捷入口 -->
        <div class="card">
          <div class="card-head">
            <h2 class="card-title">题型分布与专项刷题</h2>
            <span style="font-size:12px;color:var(--text-3);">点击题型直接开刷</span>
          </div>
          <div>${typeChipsHtml}</div>
        </div>
      </div>
    `;

    // Events
    container.querySelector('#btn-pick-bank')?.addEventListener('click', () => this.openBankPicker(app, banks));
    container.querySelector('#home-theme-btn')?.addEventListener('click', () => app.cycleTheme());
    container.querySelector('#home-install-btn')?.addEventListener('click', () => app.promptInstallPWA());
    container.querySelector('#home-resume-exam')?.addEventListener('click', (e) => {
      app.navigate('exam', { examId: Number(e.currentTarget.dataset.eid) });
    });

    container.querySelector('#btn-big-seq')?.addEventListener('click', () => {
      app.navigate('practice', { mode: 'sequential', qtype: 'all', category: 'all', status: 'all', answerMode: false });
    });
    container.querySelector('#btn-big-exam')?.addEventListener('click', () => {
      app.navigate('exam');
    });
    container.querySelector('#btn-quick-study')?.addEventListener('click', () => {
      app.navigate('practice', { mode: 'sequential', qtype: 'all', category: 'all', status: 'all', answerMode: true });
    });
    container.querySelector('#btn-quick-unseen')?.addEventListener('click', () => {
      app.navigate('practice', { mode: 'sequential', qtype: 'all', category: 'all', status: 'unseen', answerMode: false });
    });

    container.querySelectorAll('[data-quick-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.quickType;
        const info = dash.by_type[t];
        if (!info || info.total === 0) {
          app.toast(`当前题库暂无${QTYPE_META[t].label}，可在「题库」中导入或新增`, 'warning');
          return;
        }
        app.navigate('practice', { mode: 'sequential', qtype: t, category: 'all', status: 'all' });
      });
    });

    container.querySelectorAll('.grid-item[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'random') {
          app.navigate('practice', { mode: 'random', qtype: 'all', category: 'all', status: 'all', answerMode: false });
        } else if (act === 'by-type') {
          this.openTypePicker(app, dash.by_type);
        } else if (act === 'by-chapter') {
          this.openChapterPicker(app, dash.categories);
        } else if (act === 'wrong') {
          app.navigate('wrong');
        } else if (act === 'bookmarks') {
          app.navigate('bookmarks');
        } else if (act === 'search') {
          app.navigate('search');
        } else if (act === 'history') {
          app.navigate('history');
        } else if (act === 'import') {
          app.navigate('banks');
        }
      });
    });
  },

  openBankPicker(app, banks) {
    const { escapeHtml } = window.ST;
    const totalAll = banks.reduce((a, b) => a + b.total_count, 0);
    const activeId = app.state.activeBankId;

    const listHtml = [
      `
        <div class="list-row clickable" data-pick-bid="all">
          <div>
            <div style="font-weight:700;">📚 全部题库（合并练习）</div>
            <div style="font-size:12px;color:var(--text-3);">共 ${banks.length} 个题库 · ${totalAll} 题</div>
          </div>
          ${activeId === null ? `<span class="badge badge-single">当前</span>` : ''}
        </div>
      `,
      ...banks.map((b) => `
        <div class="list-row clickable" data-pick-bid="${b.id}">
          <div>
            <div style="font-weight:700;">📘 ${escapeHtml(b.name)}</div>
            <div style="font-size:12px;color:var(--text-3);">
              ${b.total_count} 题（单选 ${b.counts.single} · 多选 ${b.counts.multiple} · 判断 ${b.counts.judge} · 简答 ${b.counts.short}）
            </div>
          </div>
          ${activeId === b.id ? `<span class="badge badge-single">当前</span>` : ''}
        </div>
      `),
    ].join('');

    app.openDrawer({
      title: '切换当前刷题题库',
      bodyHtml: `
        <div>${listHtml}</div>
        <div style="margin-top:14px;">
          <button class="btn btn-soft btn-block" id="drawer-go-import">➕ 导入新题库 / 管理题库</button>
        </div>
      `,
      onMount: (root) => {
        root.querySelectorAll('[data-pick-bid]').forEach((el) => {
          el.addEventListener('click', async () => {
            const val = el.dataset.pickBid;
            await app.setActiveBank(val === 'all' ? null : Number(val));
            app.closeDrawer();
            app.toast('已切换题库', 'success');
            app.renderCurrentView();
          });
        });
        root.querySelector('#drawer-go-import')?.addEventListener('click', () => {
          app.closeDrawer();
          app.navigate('banks');
        });
      },
    });
  },

  openTypePicker(app, byType) {
    const { QTYPE_META } = window.ST;
    const html = ['single', 'multiple', 'judge', 'short'].map((t) => {
      const info = byType[t] || { total: 0, practiced: 0, wrong_count: 0 };
      const m = QTYPE_META[t];
      return `
        <div class="list-row clickable" data-pick-type="${t}">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="badge ${m.cls}" style="font-size:13px;padding:4px 11px;">${m.label}</span>
            <span style="font-weight:700;">共 ${info.total} 题</span>
          </div>
          <span class="mono" style="font-size:12.5px;color:var(--text-3);">已做 ${info.practiced} · 错 ${info.wrong_count} ›</span>
        </div>
      `;
    }).join('');

    app.openDrawer({
      title: '按题型专项练习',
      bodyHtml: html,
      onMount: (root) => {
        root.querySelectorAll('[data-pick-type]').forEach((el) => {
          el.addEventListener('click', () => {
            const t = el.dataset.pickType;
            if (!byType[t]?.total) {
              app.toast('该题型暂无题目', 'warning');
              return;
            }
            app.closeDrawer();
            app.navigate('practice', { mode: 'sequential', qtype: t, category: 'all', status: 'all' });
          });
        });
      },
    });
  },

  openChapterPicker(app, categories) {
    const { escapeHtml } = window.ST;
    const html = categories.length
      ? categories.map((c) => {
          const p = c.count > 0 ? Math.round((c.practiced / c.count) * 100) : 0;
          return `
            <div class="list-row clickable" data-pick-cat="${escapeHtml(c.category)}">
              <div style="flex:1;min-width:0;">
                <div style="font-weight:700;">📂 ${escapeHtml(c.category)}</div>
                <div style="font-size:12px;color:var(--text-3);margin-top:2px;">
                  共 ${c.count} 题 · 已练 ${c.practiced} 题 (${p}%)${c.wrong_count ? ` · 错题 ${c.wrong_count}` : ''}
                </div>
              </div>
              <span style="color:var(--brand);font-weight:700;font-size:13px;">刷题 ›</span>
            </div>
          `;
        }).join('')
      : `<div class="empty-box"><div class="empty-ico">📂</div><div class="empty-ttl">暂无章节分类</div></div>`;

    app.openDrawer({
      title: '按章节 / 知识点练习',
      bodyHtml: html,
      onMount: (root) => {
        root.querySelectorAll('[data-pick-cat]').forEach((el) => {
          el.addEventListener('click', () => {
            app.closeDrawer();
            app.navigate('practice', { mode: 'sequential', qtype: 'all', category: el.dataset.pickCat, status: 'all' });
          });
        });
      },
    });
  },
};
