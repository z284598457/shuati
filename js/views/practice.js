/**
 * Practice View — 复刻「刷题神器」沉浸式刷题页
 * 顶部「答题 | 背题」胶囊切换 + 手机左右滑动切题 + 底部「收藏 / 对错统计 / 圆形答题卡抽屉」
 */
window.ST = window.ST || {};
window.ST.Views = window.ST.Views || {};

window.ST.Views.practice = {
  immersive: true,
  state: {
    mode: 'sequential', // 'sequential' | 'random'
    qtype: 'all',
    category: 'all',
    status: 'all',
    answerMode: false, // false = 答题模式(无答案), true = 背题模式(有答案)
    questions: [],
    currentIndex: 0,
    sessionMap: {},
    autoNextTimer: null,
    returnTo: 'home',
  },

  cleanup() {
    if (this.state.autoNextTimer) {
      clearTimeout(this.state.autoNextTimer);
      this.state.autoNextTimer = null;
    }
  },

  scopeKey(bankId) {
    return `bank:${bankId || 'all'}|type:${this.state.qtype}|cat:${this.state.category}|status:${this.state.status}`;
  },

  async render(container, app, params = {}) {
    this.cleanup();
    const { DB, shuffleArray } = window.ST;

    this.state.mode = params.mode || 'sequential';
    this.state.qtype = params.qtype ?? 'all';
    this.state.category = params.category ?? 'all';
    this.state.status = params.status ?? 'all';
    this.state.returnTo = params.returnTo || 'home';

    if (params.answerMode !== undefined) {
      this.state.answerMode = Boolean(params.answerMode);
      DB.updateSettings({ practice_answer_mode: this.state.answerMode }).catch(() => {});
      app.state.settings.practice_answer_mode = this.state.answerMode;
    } else {
      this.state.answerMode = Boolean(app.state.settings.practice_answer_mode);
    }

    const res = await DB.listQuestions({
      bankId: app.state.activeBankId,
      qtype: this.state.qtype,
      category: this.state.category,
      status: this.state.status,
    });

    let list = res.items || [];
    if (this.state.mode === 'random') {
      list = shuffleArray(list);
    }

    this.state.questions = list;
    this.state.sessionMap = {};

    if (params.jumpQuestionId) {
      const idx = list.findIndex((q) => q.id === Number(params.jumpQuestionId));
      this.state.currentIndex = idx >= 0 ? idx : 0;
    } else if (this.state.mode === 'sequential' && list.length > 0) {
      const savedIdx = await DB.getPracticeProgress(this.scopeKey(app.state.activeBankId));
      this.state.currentIndex = Math.min(savedIdx, list.length - 1);
    } else {
      this.state.currentIndex = 0;
    }

    this.paint(container, app);
  },

  modeTagLabel() {
    const st = this.state;
    const parts = [];
    if (st.mode === 'random') parts.push('随机练习');
    else if (st.status === 'wrong') parts.push('错题专项');
    else if (st.status === 'bookmarked') parts.push('收藏练习');
    else if (st.status === 'unseen') parts.push('未做新题');
    else parts.push('顺序练习');
    if (st.qtype !== 'all') parts.push(window.ST.QTYPE_META[st.qtype]?.label || st.qtype);
    if (st.category !== 'all') parts.push(st.category);
    return parts.join(' · ');
  },

  paint(container, app) {
    const { escapeHtml, formatAnswerLabel, qtypeBadgeHtml } = window.ST;
    const st = this.state;
    const total = st.questions.length;
    const q = total > 0 ? st.questions[st.currentIndex] : null;
    const sess = q
      ? (st.sessionMap[q.id] || { selected: [], submitted: false, isCorrect: null, shortDraft: '', shortRevealed: false })
      : null;

    const okCount = Object.values(st.sessionMap).filter((s) => s.submitted && s.isCorrect === true).length;
    const errCount = Object.values(st.sessionMap).filter((s) => s.submitted && s.isCorrect === false).length;

    const headerHtml = `
      <header class="study-header">
        <div class="study-header-inner">
          <button type="button" class="back-btn" id="prac-back">← 返回</button>
          <div class="mode-capsule" role="group" aria-label="切换答题与背题模式">
            <button type="button" class="mode-cap-btn ${!st.answerMode ? 'active' : ''}" id="cap-quiz">答题模式</button>
            <button type="button" class="mode-cap-btn ${st.answerMode ? 'active-study' : ''}" id="cap-study">背题模式</button>
          </div>
          <button type="button" class="back-btn" id="prac-settings-btn" style="font-size:14px;">⚙ 设置</button>
        </div>
      </header>
      <div class="study-subbar">
        <div class="study-subbar-inner">
          <span><strong>${escapeHtml(this.modeTagLabel())}</strong></span>
          <span class="mono" style="color:var(--text-3);">${total > 0 ? `第 ${st.currentIndex + 1} / ${total} 题` : '0 题'}${q?.category ? ` · ${escapeHtml(q.category)}` : ''}</span>
        </div>
      </div>
    `;

    if (!q) {
      container.innerHTML = `
        <div class="study-page">
          ${headerHtml}
          <div class="study-body">
            <div class="card empty-box">
              <div class="empty-ico">📭</div>
              <div class="empty-ttl">当前范围暂无可练习题目</div>
              <p style="margin:6px 0 18px;">可能已经全部刷完或暂无该分类题目。</p>
              <button class="btn btn-primary" id="prac-empty-back">返回首页</button>
            </div>
          </div>
        </div>
      `;
      container.querySelector('#prac-back')?.addEventListener('click', () => app.navigate(st.returnTo));
      container.querySelector('#prac-empty-back')?.addEventListener('click', () => app.navigate('home'));
      this.bindModeButtons(container, app);
      return;
    }

    const reveal = st.answerMode || sess.submitted || sess.shortRevealed;
    const correctSet = new Set(q.qtype === 'short' ? [] : q.answer.split(''));
    const selectedSet = new Set(sess.selected || []);

    let bodyHtml = '';
    if (q.qtype === 'short') {
      bodyHtml = `
        <div style="margin-bottom:14px;">
          <textarea id="prac-short-area" class="textarea" rows="5" placeholder="在此输入你的作答要点（也可直接点击查看参考答案）..." ${sess.submitted ? 'readonly' : ''}>${escapeHtml(sess.shortDraft || '')}</textarea>
          ${!reveal ? `<button type="button" class="btn btn-primary btn-block" style="margin-top:10px;" id="btn-short-show">查看参考答案并自评</button>` : ''}
        </div>
      `;
    } else {
      const isJudge = q.qtype === 'judge';
      const isMulti = q.qtype === 'multiple';
      const optsHtml = q.options.map((optText, idx) => {
        const letter = String.fromCharCode(65 + idx);
        const isSel = selectedSet.has(letter);
        const isCorr = correctSet.has(letter);
        let cls = 'opt-btn' + (isMulti ? ' multi' : '');
        let tag = '';
        if (reveal) {
          cls += ' locked';
          if (st.answerMode && !sess.submitted) {
            if (isCorr) { cls += ' correct'; tag = `<span class="opt-tag ok">✓ 答案</span>`; }
          } else {
            if (isSel && isCorr) { cls += ' correct'; tag = `<span class="opt-tag ok">✓ 正确</span>`; }
            else if (isSel && !isCorr) { cls += ' wrong'; tag = `<span class="opt-tag err">✕ 误选</span>`; }
            else if (!isSel && isCorr) { cls += isMulti ? ' missed' : ' correct'; tag = `<span class="opt-tag ok">${isMulti ? '漏选' : '✓ 答案'}</span>`; }
          }
        } else if (isSel) {
          cls += ' selected';
        }
        const keyTxt = isJudge ? (letter === 'A' ? '✓' : '✕') : letter;
        return `
          <button type="button" class="${cls}" data-opt="${letter}" ${reveal ? 'disabled' : ''}>
            <span class="opt-letter">${keyTxt}</span>
            <span class="opt-label">${escapeHtml(optText)}</span>
            ${tag}
          </button>
        `;
      }).join('');

      bodyHtml = `
        <div class="opt-list">${optsHtml}</div>
        ${isMulti && !reveal ? `
          <button type="button" class="btn btn-primary btn-block" id="btn-multi-ok" ${selectedSet.size === 0 ? 'disabled' : ''}>
            确认提交${selectedSet.size > 0 ? `（已选 ${[...selectedSet].sort().join('')}）` : ''}
          </button>
        ` : ''}
      `;
    }

    let explainHtml = '';
    if (reveal) {
      let boxCls = 'explain-box ';
      let titleHtml = '';
      if (sess.submitted) {
        boxCls += sess.isCorrect ? 'is-ok' : 'is-err';
        titleHtml = sess.isCorrect
          ? `<strong style="color:var(--green);font-size:15px;">✓ 回答正确</strong>`
          : `<strong style="color:var(--red);font-size:15px;">✕ 回答错误${q.qtype !== 'short' ? `（你选：${escapeHtml(formatAnswerLabel(q.qtype, [...selectedSet].sort().join('')))}）` : ''}</strong>`;
      } else if (q.qtype === 'short' && sess.shortRevealed) {
        boxCls += 'is-ok';
        titleHtml = `<strong style="color:var(--brand);font-size:15px;">📋 对照参考答案自评</strong>`;
      } else {
        boxCls += 'is-ok';
        titleHtml = `<strong style="color:var(--green);font-size:15px;">💡 背题模式 · 参考答案</strong>`;
      }

      const shortSelfBtns = (q.qtype === 'short' && !st.answerMode && !sess.submitted) ? `
        <div style="display:flex;gap:10px;margin-top:12px;padding-top:12px;border-top:1px dashed var(--border-strong);">
          <button type="button" class="btn btn-success btn-sm" style="flex:1;" id="btn-short-ok">✓ 答对了</button>
          <button type="button" class="btn btn-soft-danger btn-sm" style="flex:1;" id="btn-short-err">✕ 答错了（入错题本）</button>
        </div>
      ` : '';

      explainHtml = `
        <div class="${boxCls}">
          <div class="explain-head">
            ${titleHtml}
            <div style="display:flex;align-items:center;gap:8px;">
              ${q.qtype !== 'short' ? `<span class="badge badge-success" style="font-size:13px;">正确答案：${escapeHtml(formatAnswerLabel(q.qtype, q.answer))}</span>` : ''}
              ${sess.submitted ? `<button type="button" class="btn btn-sm btn-secondary" id="btn-prac-retry">重做</button>` : ''}
            </div>
          </div>
          ${q.qtype === 'short' ? `<div class="explain-row"><span class="explain-key">参考答案：</span>${escapeHtml(q.answer)}</div>` : ''}
          ${q.scoring_criteria ? `<div class="explain-row"><span class="explain-key">评分标准：</span>${escapeHtml(q.scoring_criteria)}</div>` : ''}
          <div class="explain-row"><span class="explain-key">答案解析：</span>${escapeHtml(q.explanation || '暂无文字解析')}</div>
          <div class="explain-row" style="font-size:12px;color:var(--text-3);display:flex;gap:12px;flex-wrap:wrap;">
            <span>出处：${escapeHtml(q.category)}</span>
            ${q.code ? `<span class="mono">${escapeHtml(q.code)}</span>` : ''}
            <span>已练 ${q.stats.attempt_count} 次 · 错 ${q.stats.wrong_count} 次</span>
          </div>
          ${shortSelfBtns}
        </div>
      `;
    }

    container.innerHTML = `
      <div class="study-page">
        ${headerHtml}

        <div class="study-body" id="prac-swipe-area">
          <div class="q-paper-card">
            <div class="q-stem-line">${qtypeBadgeHtml(q.qtype)}<span class="q-stem-text">${escapeHtml(q.content)}</span></div>

            ${bodyHtml}
            ${explainHtml}

            <!-- 个人笔记 -->
            <div style="margin-top:16px;padding-top:12px;border-top:1px dashed var(--border);">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
                <span style="font-size:12.5px;font-weight:700;color:var(--text-2);">📝 记忆笔记</span>
                <div style="display:flex;gap:6px;">
                  ${q.stats.in_wrong_book ? `<button type="button" class="btn btn-sm btn-soft-danger" id="btn-rm-wrong">移出错题本</button>` : ''}
                  <button type="button" class="btn btn-sm btn-secondary" id="btn-save-note">保存笔记</button>
                </div>
              </div>
              <input type="text" id="prac-note-inp" class="input" style="padding:7px 11px;font-size:13px;" placeholder="记下口诀或易错点..." value="${escapeHtml(q.stats.note || '')}" />
            </div>

            <div class="q-step-row">
              <button type="button" class="btn btn-secondary" id="btn-prev-q" ${st.currentIndex === 0 ? 'disabled' : ''}>← 上一题</button>
              <span style="font-size:12px;color:var(--text-3);">支持左右滑动 / 方向键切题</span>
              <button type="button" class="btn btn-primary" id="btn-next-q" ${st.currentIndex >= total - 1 ? 'disabled' : ''}>下一题 →</button>
            </div>
          </div>
        </div>

        <!-- 刷题神器灵魂底栏 -->
        <footer class="study-footer">
          <div class="study-footer-inner">
            <button type="button" class="foot-tool-btn ${q.stats.bookmarked ? 'starred' : ''}" id="foot-star">
              <span>${q.stats.bookmarked ? '★' : '☆'}</span>
              <span>${q.stats.bookmarked ? '已收藏' : '收藏'}</span>
            </button>

            <div class="foot-score-pill">
              <span class="foot-ok">✓ ${okCount}</span>
              <span class="foot-err">✕ ${errCount}</span>
            </div>

            <button type="button" class="sheet-trigger-btn" id="foot-sheet-btn">
              <span>▦</span>
              <span>${st.currentIndex + 1}/${total}</span>
            </button>
          </div>
        </footer>
      </div>
    `;

    this.bindModeButtons(container, app);
    this.bindQuestionActions(container, app, q);
  },

  bindModeButtons(container, app) {
    const { DB } = window.ST;
    const st = this.state;

    container.querySelector('#cap-quiz')?.addEventListener('click', () => {
      if (!st.answerMode) return;
      st.answerMode = false;
      app.state.settings.practice_answer_mode = false;
      DB.updateSettings({ practice_answer_mode: false }).catch(() => {});
      this.paint(container, app);
    });
    container.querySelector('#cap-study')?.addEventListener('click', () => {
      if (st.answerMode) return;
      st.answerMode = true;
      app.state.settings.practice_answer_mode = true;
      DB.updateSettings({ practice_answer_mode: true }).catch(() => {});
      this.paint(container, app);
    });
    container.querySelector('#prac-settings-btn')?.addEventListener('click', () => {
      this.openSettingsDrawer(container, app);
    });
  },

  bindQuestionActions(container, app, q) {
    const { DB } = window.ST;
    const st = this.state;

    container.querySelector('#prac-back')?.addEventListener('click', () => {
      this.cleanup();
      app.navigate(st.returnTo);
    });

    const getSess = () => {
      if (!st.sessionMap[q.id]) {
        st.sessionMap[q.id] = { selected: [], submitted: false, isCorrect: null, shortDraft: '', shortRevealed: false };
      }
      return st.sessionMap[q.id];
    };

    const doSubmit = async (ansStr, selfIsCorrect = null) => {
      const res = await DB.submitPractice(q.id, ansStr, selfIsCorrect);
      const sess = getSess();
      sess.submitted = true;
      sess.isCorrect = res.is_correct;
      q.stats = res.stats;
      this.paint(container, app);

      if (res.is_correct && app.state.settings.practice_auto_next && st.currentIndex < st.questions.length - 1) {
        st.autoNextTimer = setTimeout(() => {
          if (app.state.currentView === 'practice') this.goIndex(st.currentIndex + 1, container, app);
        }, 620);
      }
    };

    container.querySelectorAll('.opt-btn[data-opt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (st.answerMode) return;
        const sess = getSess();
        if (sess.submitted) return;
        const letter = btn.dataset.opt;
        if (q.qtype === 'multiple') {
          const set = new Set(sess.selected);
          if (set.has(letter)) set.delete(letter);
          else set.add(letter);
          sess.selected = [...set].sort();
          this.paint(container, app);
        } else {
          sess.selected = [letter];
          doSubmit(letter);
        }
      });
    });

    container.querySelector('#btn-multi-ok')?.addEventListener('click', () => {
      const sess = getSess();
      if (!sess.selected.length) return;
      doSubmit([...sess.selected].sort().join(''));
    });

    container.querySelector('#prac-short-area')?.addEventListener('input', (e) => {
      getSess().shortDraft = e.target.value;
    });
    container.querySelector('#btn-short-show')?.addEventListener('click', () => {
      getSess().shortRevealed = true;
      this.paint(container, app);
    });
    container.querySelector('#btn-short-ok')?.addEventListener('click', () => {
      doSubmit(getSess().shortDraft || '（自评答对）', true);
    });
    container.querySelector('#btn-short-err')?.addEventListener('click', () => {
      doSubmit(getSess().shortDraft || '（自评答错）', false);
    });

    container.querySelector('#btn-prac-retry')?.addEventListener('click', () => {
      delete st.sessionMap[q.id];
      this.paint(container, app);
    });

    container.querySelector('#foot-star')?.addEventListener('click', async () => {
      const res = await DB.toggleBookmark(q.id);
      q.stats.bookmarked = res.bookmarked;
      app.toast(res.bookmarked ? '已加入收藏' : '已取消收藏', 'success');
      this.paint(container, app);
    });

    container.querySelector('#btn-rm-wrong')?.addEventListener('click', async () => {
      await DB.setWrongBook(q.id, false);
      q.stats.in_wrong_book = false;
      app.toast('已移出错题本', 'success');
      this.paint(container, app);
    });

    container.querySelector('#btn-save-note')?.addEventListener('click', async () => {
      const val = container.querySelector('#prac-note-inp').value;
      const res = await DB.saveNote(q.id, val);
      q.stats.note = res.note;
      app.toast('笔记已保存', 'success');
    });

    container.querySelector('#btn-prev-q')?.addEventListener('click', () => {
      if (st.currentIndex > 0) this.goIndex(st.currentIndex - 1, container, app);
    });
    container.querySelector('#btn-next-q')?.addEventListener('click', () => {
      if (st.currentIndex < st.questions.length - 1) this.goIndex(st.currentIndex + 1, container, app);
    });
    container.querySelector('#foot-sheet-btn')?.addEventListener('click', () => {
      this.openAnswerSheetDrawer(container, app);
    });

    // Touch swipe left / right for native mobile feel
    const swipeEl = container.querySelector('#prac-swipe-area');
    if (swipeEl) {
      let sx = 0, sy = 0;
      swipeEl.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          sx = e.touches[0].clientX;
          sy = e.touches[0].clientY;
        }
      }, { passive: true });
      swipeEl.addEventListener('touchend', (e) => {
        if (e.changedTouches.length !== 1) return;
        const dx = e.changedTouches[0].clientX - sx;
        const dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.6) {
          if (dx < 0 && st.currentIndex < st.questions.length - 1) {
            this.goIndex(st.currentIndex + 1, container, app);
          } else if (dx > 0 && st.currentIndex > 0) {
            this.goIndex(st.currentIndex - 1, container, app);
          }
        }
      }, { passive: true });
    }
  },

  goIndex(idx, container, app) {
    this.cleanup();
    const st = this.state;
    st.currentIndex = Math.max(0, Math.min(idx, st.questions.length - 1));
    if (st.mode === 'sequential') {
      window.ST.DB.savePracticeProgress(this.scopeKey(app.state.activeBankId), st.currentIndex).catch(() => {});
    }
    this.paint(container, app);
    window.scrollTo({ top: 0, behavior: 'instant' });
  },

  openAnswerSheetDrawer(container, app) {
    const { qtypeBadgeHtml, QTYPE_META } = window.ST;
    const st = this.state;

    const tileHtml = (item, idx) => {
      const s = st.sessionMap[item.id];
      let cls = 'sheet-dot';
      if (idx === st.currentIndex) cls += ' current';
      if (s && s.submitted) cls += s.isCorrect ? ' correct' : ' wrong';
      else if (item.stats.last_is_correct === 1) cls += ' correct';
      else if (item.stats.in_wrong_book) cls += ' wrong';
      if (item.stats.bookmarked) cls += ' flagged';
      return `<button type="button" class="${cls}" data-sd-idx="${idx}">${idx + 1}</button>`;
    };

    let contentHtml = '';
    let jumpPillsHtml = '';

    if (st.mode === 'random') {
      const circles = st.questions.map((item, idx) => tileHtml(item, idx)).join('');
      contentHtml = `<div class="sheet-circles">${circles}</div>`;
    } else {
      // Group strictly by question type: 单选 -> 多选 -> 判断 -> 简答
      const sections = [];
      for (const t of ['single', 'multiple', 'judge', 'short']) {
        const list = [];
        st.questions.forEach((item, idx) => {
          if (item.qtype === t) list.push({ item, idx });
        });
        if (list.length > 0) {
          sections.push({
            qtype: t,
            label: QTYPE_META[t].label,
            firstNum: list[0].idx + 1,
            lastNum: list[list.length - 1].idx + 1,
            list,
          });
        }
      }

      if (sections.length > 1) {
        jumpPillsHtml = `
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
            ${sections.map((sec) => `
              <button type="button" class="chip" data-sd-sec="${sec.qtype}" style="font-size:12px;">
                ${sec.label} <span class="mono">${sec.firstNum}-${sec.lastNum}</span>
              </button>
            `).join('')}
          </div>
        `;
      }

      contentHtml = sections.map((sec) => {
        const rangeText = sec.firstNum === sec.lastNum ? `第 ${sec.firstNum} 题` : `${sec.firstNum} – ${sec.lastNum} 题`;
        const secDoneOk = sec.list.filter(({ item }) => {
          const s = st.sessionMap[item.id];
          return (s && s.submitted && s.isCorrect === true) || (!s && item.stats.last_is_correct === 1);
        }).length;
        const secDoneErr = sec.list.filter(({ item }) => {
          const s = st.sessionMap[item.id];
          return (s && s.submitted && s.isCorrect === false) || (!s && item.stats.in_wrong_book);
        }).length;
        const circles = sec.list.map(({ item, idx }) => tileHtml(item, idx)).join('');
        return `
          <div id="sd-sec-${sec.qtype}" style="margin-bottom:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:6px 0 10px;border-bottom:1px solid var(--border);margin-bottom:10px;">
              <div style="display:flex;align-items:center;gap:8px;">
                ${qtypeBadgeHtml(sec.qtype)}
                <strong class="mono" style="font-size:13.5px;">${rangeText}</strong>
                <span style="font-size:12px;color:var(--text-3);">共 ${sec.list.length} 题</span>
              </div>
              <div class="mono" style="font-size:12px;color:var(--text-3);">
                <span style="color:var(--green);">对 ${secDoneOk}</span> · <span style="color:var(--red);">错 ${secDoneErr}</span>
              </div>
            </div>
            <div class="sheet-circles">${circles}</div>
          </div>
        `;
      }).join('');
    }

    app.openDrawer({
      title: `答题卡（${st.currentIndex + 1} / ${st.questions.length}）`,
      bodyHtml: `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;font-size:12px;color:var(--text-2);">
          <div style="display:flex;gap:12px;">
            <span><strong style="color:var(--green)">●</strong> 正确</span>
            <span><strong style="color:var(--red)">●</strong> 错题</span>
            <span><strong style="color:var(--text-3)">○</strong> 未做</span>
            <span><strong style="color:var(--amber)">•</strong> 收藏</span>
          </div>
          <button type="button" class="btn btn-sm btn-secondary" id="sheet-clear-sess">清空本次记录</button>
        </div>
        ${jumpPillsHtml}
        ${contentHtml}
      `,
      onMount: (root) => {
        root.querySelectorAll('[data-sd-sec]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const target = root.querySelector(`#sd-sec-${btn.dataset.sdSec}`);
            target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        });
        root.querySelectorAll('[data-sd-idx]').forEach((btn) => {
          btn.addEventListener('click', () => {
            app.closeDrawer();
            this.goIndex(Number(btn.dataset.sdIdx), container, app);
          });
        });
        root.querySelector('#sheet-clear-sess')?.addEventListener('click', () => {
          st.sessionMap = {};
          app.closeDrawer();
          app.toast('已清空本次答题标记');
          this.paint(container, app);
        });
      },
    });
  },

  openSettingsDrawer(container, app) {
    const { DB } = window.ST;
    const s = app.state.settings;

    app.openDrawer({
      title: '刷题设置',
      bodyHtml: `
        <div class="setting-row">
          <div><div class="setting-title">界面主题</div><div class="setting-desc">经典蓝白 / 护眼米纸 / 夜间深色</div></div>
          <div style="display:flex;gap:6px;">
            <button type="button" class="chip ${s.theme === 'light' ? 'active' : ''}" data-set-theme="light">☀️ 蓝白</button>
            <button type="button" class="chip ${s.theme === 'eyecare' ? 'active' : ''}" data-set-theme="eyecare">🌿 护眼</button>
            <button type="button" class="chip ${s.theme === 'dark' ? 'active' : ''}" data-set-theme="dark">🌙 夜间</button>
          </div>
        </div>
        <div class="setting-row">
          <div><div class="setting-title">题干字号</div></div>
          <div style="display:flex;gap:6px;">
            <button type="button" class="chip ${s.font_size === 'sm' ? 'active' : ''}" data-set-font="sm">小</button>
            <button type="button" class="chip ${s.font_size === 'md' ? 'active' : ''}" data-set-font="md">中</button>
            <button type="button" class="chip ${s.font_size === 'lg' ? 'active' : ''}" data-set-font="lg">大</button>
          </div>
        </div>
        <label class="setting-row">
          <div><div class="setting-title">答对自动跳转下一题</div><div class="setting-desc">加快单选/判断题连续刷题节奏</div></div>
          <span class="switch"><input type="checkbox" id="set-auto-next" ${s.practice_auto_next ? 'checked' : ''} /><span class="switch-track"></span></span>
        </label>
        <label class="setting-row">
          <div><div class="setting-title">答对自动移出错题本</div><div class="setting-desc">做对错题后自动标记为已掌握</div></div>
          <span class="switch"><input type="checkbox" id="set-wrong-rm" ${s.wrong_auto_remove ? 'checked' : ''} /><span class="switch-track"></span></span>
        </label>
      `,
      onMount: (root) => {
        root.querySelectorAll('[data-set-theme]').forEach((b) => {
          b.addEventListener('click', async () => {
            await app.setTheme(b.dataset.setTheme);
            this.openSettingsDrawer(container, app);
          });
        });
        root.querySelectorAll('[data-set-font]').forEach((b) => {
          b.addEventListener('click', async () => {
            await app.setFontSize(b.dataset.setFont);
            this.openSettingsDrawer(container, app);
          });
        });
        root.querySelector('#set-auto-next')?.addEventListener('change', (e) => {
          s.practice_auto_next = e.target.checked;
          DB.updateSettings({ practice_auto_next: s.practice_auto_next }).catch(() => {});
        });
        root.querySelector('#set-wrong-rm')?.addEventListener('change', (e) => {
          s.wrong_auto_remove = e.target.checked;
          DB.updateSettings({ wrong_auto_remove: s.wrong_auto_remove }).catch(() => {});
        });
      },
    });
  },

  handleKeydown(e, container, app) {
    const st = this.state;
    if (!st.questions.length) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (st.currentIndex > 0) this.goIndex(st.currentIndex - 1, container, app);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (st.currentIndex < st.questions.length - 1) this.goIndex(st.currentIndex + 1, container, app);
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      st.answerMode = !st.answerMode;
      app.state.settings.practice_answer_mode = st.answerMode;
      window.ST.DB.updateSettings({ practice_answer_mode: st.answerMode }).catch(() => {});
      app.toast(st.answerMode ? '已切换：背题模式（有答案）' : '已切换：答题模式（无答案）');
      this.paint(container, app);
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      container.querySelector('#foot-star')?.click();
    } else if (e.key === 'Enter') {
      const btn = container.querySelector('#btn-multi-ok');
      if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
    } else if (!st.answerMode) {
      const map = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'E', '6': 'F', a: 'A', b: 'B', c: 'C', d: 'D', e: 'E', f: 'F' };
      const letter = map[e.key.toLowerCase()];
      if (letter) {
        const opt = container.querySelector(`.opt-btn[data-opt="${letter}"]:not([disabled])`);
        if (opt) { e.preventDefault(); opt.click(); }
      }
    }
  },
};
