/**
 * Banks & Import View — 题库管理、离线导入导出（CSV/XLSX/JSON）与题目维护
 */
window.ST = window.ST || {};
window.ST.Views = window.ST.Views || {};

window.ST.Views.banks = {
  state: {
    filterBankId: '',
    filterType: 'all',
    keyword: '',
    page: 1,
    pageSize: 15,
    preview: null,
  },

  async render(container, app) {
    if (this.state.filterBankId === '' && app.state.activeBankId) {
      this.state.filterBankId = String(app.state.activeBankId);
    }
    await this.paint(container, app);
  },

  async paint(container, app) {
    const { DB, escapeHtml, formatAnswerLabel, qtypeBadgeHtml } = window.ST;
    const st = this.state;

    const [banks, qRes] = await Promise.all([
      DB.listBanks(),
      DB.listQuestions({
        bankId: st.filterBankId ? Number(st.filterBankId) : null,
        qtype: st.filterType,
        keyword: st.keyword,
        page: st.page,
        pageSize: st.pageSize,
      }),
    ]);
    app.state.banks = banks;

    const totalPages = Math.max(1, Math.ceil((qRes.total || 0) / st.pageSize));
    if (st.page > totalPages) st.page = totalPages;

    const bankCardsHtml = banks.length
      ? banks.map((b) => {
          const active = app.state.activeBankId === b.id;
          return `
            <div class="card" style="${active ? 'border-color:var(--brand);box-shadow:0 0 0 2px var(--brand-ring);' : ''}">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
                <div style="min-width:0;">
                  <div style="font-size:15.5px;font-weight:800;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <span>📘 ${escapeHtml(b.name)}</span>
                    ${active ? `<span class="badge badge-single">当前</span>` : ''}
                  </div>
                  <div style="font-size:12px;color:var(--text-3);margin-top:3px;">
                    ${escapeHtml(b.description || (b.source_file ? `来源：${b.source_file}` : '本地题库'))}
                  </div>
                </div>
                <span class="mono" style="font-size:18px;font-weight:800;color:var(--brand);white-space:nowrap;flex-shrink:0;">
                  ${b.total_count}<span style="font-size:12px;font-weight:600;margin-left:2px;">题</span>
                </span>
              </div>

              <div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 8px;">
                <span class="badge badge-single">单选 ${b.counts.single}</span>
                <span class="badge badge-multiple">多选 ${b.counts.multiple}</span>
                <span class="badge badge-judge">判断 ${b.counts.judge}</span>
                <span class="badge badge-short">简答 ${b.counts.short}</span>
              </div>

              <div style="font-size:12px;color:var(--text-3);margin-bottom:10px;">
                已刷 ${b.practiced_count} · 错题 ${b.wrong_count} · 收藏 ${b.bookmark_count}
              </div>

              <div style="display:flex;gap:6px;flex-wrap:wrap;padding-top:8px;border-top:1px solid var(--border);">
                ${!active ? `<button class="btn btn-sm btn-soft" data-b-use="${b.id}">设为当前</button>` : ''}
                <button class="btn btn-sm btn-secondary" data-b-edit="${b.id}">重命名</button>
                <button class="btn btn-sm btn-secondary" data-b-exp-csv="${b.id}">导出CSV</button>
                <button class="btn btn-sm btn-secondary" data-b-exp-xlsx="${b.id}">导出Excel</button>
                <button class="btn btn-sm btn-soft-danger" data-b-del="${b.id}">删除</button>
              </div>
            </div>
          `;
        }).join('')
      : `<div class="card empty-box"><div class="empty-ico">📚</div><div class="empty-ttl">暂无题库</div><p>请先导入文件或新建题库。</p></div>`;

    const previewHtml = st.preview ? renderPreviewBox(st.preview, banks) : '';

    const bankOpts = [
      `<option value="" ${!st.filterBankId ? 'selected' : ''}>全部题库</option>`,
      ...banks.map((b) => `<option value="${b.id}" ${String(st.filterBankId) === String(b.id) ? 'selected' : ''}>${escapeHtml(b.name)}</option>`),
    ].join('');

    const qRows = qRes.items.length
      ? qRes.items.map((q) => `
          <div class="list-row" style="align-items:flex-start;">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
                ${qtypeBadgeHtml(q.qtype)}
                <span style="font-size:12px;color:var(--text-3);">${escapeHtml(q.category)}</span>
                ${q.code ? `<span class="mono" style="font-size:11.5px;color:var(--text-3);">${escapeHtml(q.code)}</span>` : ''}
              </div>
              <div style="font-size:14px;font-weight:600;line-height:1.55;">${escapeHtml(q.content)}</div>
              <div style="font-size:12.5px;color:var(--green);font-weight:700;margin-top:4px;">
                答案：${escapeHtml(formatAnswerLabel(q.qtype, q.answer).slice(0, 60))}
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button class="btn btn-sm btn-secondary" data-q-edit="${q.id}">编辑</button>
              <button class="btn btn-sm btn-soft-danger" data-q-del="${q.id}">删除</button>
            </div>
          </div>
        `).join('')
      : `<div class="empty-box" style="padding:28px 10px;"><div class="empty-ttl">没有匹配的题目</div></div>`;

    container.innerHTML = `
      <div class="container">
        <div class="section-bar">
          <div>
            <h1 class="section-title">题库管理与导入</h1>
            <div style="font-size:12.5px;color:var(--text-3);margin-top:2px;">离线本地解析 CSV / Excel (.xlsx) / JSON，数据安全保存在本机</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-sm btn-secondary" id="btn-dl-tpl-csv">⬇ CSV模板</button>
            <button class="btn btn-sm btn-secondary" id="btn-dl-tpl-xlsx">⬇ Excel模板</button>
            <button class="btn btn-sm btn-primary" id="btn-new-bank">+ 新建题库</button>
          </div>
        </div>

        <!-- 导入卡片 -->
        <div class="card">
          <div class="card-head">
            <h2 class="card-title">📥 导入题库文件（支持后期随时追加更新）</h2>
          </div>
          <input type="file" id="imp-file" accept=".csv,.xlsx,.xls,.json,.txt" class="hidden" />
          <div id="imp-drop" class="dropzone">
            <div style="font-size:30px;margin-bottom:6px;">📄</div>
            <div style="font-size:14.5px;font-weight:700;margin-bottom:4px;">点击选择或拖拽 CSV / XLSX / JSON 文件到此处</div>
            <div style="font-size:12px;color:var(--text-3);">自动兼容 UTF-8 / GBK 编码、$;$ 选项分隔符与 A/B/C/D 分列格式</div>
          </div>
          ${previewHtml}
        </div>

        <!-- 我的题库列表 -->
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-bottom:14px;">
          ${bankCardsHtml}
        </div>

        <!-- 题目维护列表 -->
        <div class="card">
          <div class="card-head">
            <h2 class="card-title">题目管理（共 ${qRes.total} 题）</h2>
            <button class="btn btn-sm btn-primary" id="btn-add-q">+ 手动加题</button>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
            <select id="bf-bank" class="select" style="width:auto;min-width:130px;padding:7px 10px;">${bankOpts}</select>
            <select id="bf-type" class="select" style="width:auto;min-width:105px;padding:7px 10px;">
              <option value="all" ${st.filterType === 'all' ? 'selected' : ''}>全部题型</option>
              <option value="single" ${st.filterType === 'single' ? 'selected' : ''}>单选题</option>
              <option value="multiple" ${st.filterType === 'multiple' ? 'selected' : ''}>多选题</option>
              <option value="judge" ${st.filterType === 'judge' ? 'selected' : ''}>判断题</option>
              <option value="short" ${st.filterType === 'short' ? 'selected' : ''}>简答题</option>
            </select>
            <input type="text" id="bf-kw" class="input" style="flex:1;min-width:160px;padding:7px 11px;" placeholder="搜索题干 / 编号 / 分类..." value="${escapeHtml(st.keyword)}" />
            <button class="btn btn-sm btn-secondary" id="bf-go">搜索</button>
          </div>

          <div>${qRows}</div>

          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:1px solid var(--border);font-size:12.5px;color:var(--text-3);">
            <span>第 ${st.page} / ${totalPages} 页</span>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-sm btn-secondary" id="bf-prev" ${st.page <= 1 ? 'disabled' : ''}>上一页</button>
              <button class="btn btn-sm btn-secondary" id="bf-next" ${st.page >= totalPages ? 'disabled' : ''}>下一页</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents(container, app, banks, qRes.items);
  },

  bindEvents(container, app, banks, pageQuestions) {
    const { DB, Importer } = window.ST;
    const st = this.state;

    // Template downloads (pure client-side offline!)
    container.querySelector('#btn-dl-tpl-csv')?.addEventListener('click', () => {
      Importer.triggerDownloadBlob(Importer.exportQuestionsCsvBlob(Importer.getTemplateQuestions()), '刷题神器标准导入模板.csv');
      app.toast('已下载标准 CSV 模板（含单选/多选/判断/简答）', 'success');
    });
    container.querySelector('#btn-dl-tpl-xlsx')?.addEventListener('click', () => {
      Importer.triggerDownloadBlob(Importer.exportQuestionsXlsxBlob(Importer.getTemplateQuestions()), '刷题神器标准导入模板.xlsx');
      app.toast('已下载标准 Excel 模板', 'success');
    });

    container.querySelector('#btn-new-bank')?.addEventListener('click', () => {
      this.openBankModal(app, null, () => this.paint(container, app));
    });

    // Bank card actions
    container.querySelectorAll('[data-b-use]').forEach((b) => {
      b.addEventListener('click', async () => {
        const id = Number(b.dataset.bUse);
        await app.setActiveBank(id);
        st.filterBankId = String(id);
        st.page = 1;
        app.toast('已设为当前刷题题库', 'success');
        this.paint(container, app);
      });
    });
    container.querySelectorAll('[data-b-edit]').forEach((b) => {
      b.addEventListener('click', () => {
        const bank = banks.find((x) => x.id === Number(b.dataset.bEdit));
        if (bank) this.openBankModal(app, bank, () => this.paint(container, app));
      });
    });
    container.querySelectorAll('[data-b-exp-csv]').forEach((b) => {
      b.addEventListener('click', async () => {
        const id = Number(b.dataset.bExpCsv);
        const bank = banks.find((x) => x.id === id);
        const res = await DB.listQuestions({ bankId: id });
        Importer.triggerDownloadBlob(Importer.exportQuestionsCsvBlob(res.items), `${bank?.name || '题库'}.csv`);
        app.toast('已导出 CSV 文件', 'success');
      });
    });
    container.querySelectorAll('[data-b-exp-xlsx]').forEach((b) => {
      b.addEventListener('click', async () => {
        const id = Number(b.dataset.bExpXlsx);
        const bank = banks.find((x) => x.id === id);
        const res = await DB.listQuestions({ bankId: id });
        Importer.triggerDownloadBlob(Importer.exportQuestionsXlsxBlob(res.items), `${bank?.name || '题库'}.xlsx`);
        app.toast('已导出 Excel 文件', 'success');
      });
    });
    container.querySelectorAll('[data-b-del]').forEach((b) => {
      b.addEventListener('click', async () => {
        const id = Number(b.dataset.bDel);
        const bank = banks.find((x) => x.id === id);
        const ok = await app.confirm('删除题库', `确定要删除「${bank?.name}」及其中所有题目吗？`, '确认删除', true);
        if (!ok) return;
        await DB.deleteBank(id);
        if (app.state.activeBankId === id) await app.setActiveBank(null);
        if (String(st.filterBankId) === String(id)) st.filterBankId = '';
        app.toast('题库已删除', 'success');
        this.paint(container, app);
      });
    });

    // Dropzone & File input
    const fileInp = container.querySelector('#imp-file');
    const drop = container.querySelector('#imp-drop');
    const processFile = async (file) => {
      if (!file) return;
      try {
        const parsed = await Importer.parseQuestionFile(file);
        st.preview = parsed;
        await this.paint(container, app);
        app.toast(parsed.total > 0 ? `已解析 ${parsed.total} 道有效题目` : '未识别到有效题目', parsed.total > 0 ? 'success' : 'warning');
      } catch (err) {
        app.toast(err.message, 'error');
      }
    };
    drop?.addEventListener('click', () => fileInp?.click());
    fileInp?.addEventListener('change', (e) => processFile(e.target.files[0]));
    drop?.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
    drop?.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop?.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('dragover');
      if (e.dataTransfer.files?.length) processFile(e.dataTransfer.files[0]);
    });

    // Preview Confirm
    if (st.preview) {
      container.querySelectorAll('input[name="imp-mode"]').forEach((r) => {
        r.addEventListener('change', () => {
          const isNew = container.querySelector('input[name="imp-mode"]:checked').value === 'new';
          container.querySelector('#imp-new-box')?.classList.toggle('hidden', !isNew);
          container.querySelector('#imp-old-box')?.classList.toggle('hidden', isNew);
        });
      });
      container.querySelector('#imp-cancel')?.addEventListener('click', () => {
        st.preview = null;
        this.paint(container, app);
      });
      container.querySelector('#imp-ok')?.addEventListener('click', async () => {
        const mode = container.querySelector('input[name="imp-mode"]:checked')?.value || 'new';
        const bankName = container.querySelector('#imp-bname')?.value.trim();
        const bankId = mode === 'existing' ? Number(container.querySelector('#imp-bid')?.value) : null;
        const skipDup = container.querySelector('#imp-dup')?.checked ?? true;
        try {
          const res = await DB.importQuestions({
            questions: st.preview.questions,
            bankId,
            bankName: bankName || st.preview.suggested_bank_name,
            sourceFile: st.preview.filename,
            skipDuplicates: skipDup,
          });
          st.preview = null;
          st.filterBankId = String(res.bank_id);
          st.page = 1;
          await app.setActiveBank(res.bank_id);
          app.toast(`导入成功：新增 ${res.inserted} 题${res.skipped ? `，跳过重复 ${res.skipped} 题` : ''}`, 'success');
          this.paint(container, app);
        } catch (err) {
          app.toast(err.message, 'error');
        }
      });
    }

    // Question Browser
    container.querySelector('#bf-bank')?.addEventListener('change', (e) => { st.filterBankId = e.target.value; st.page = 1; this.paint(container, app); });
    container.querySelector('#bf-type')?.addEventListener('change', (e) => { st.filterType = e.target.value; st.page = 1; this.paint(container, app); });
    const searchGo = () => { st.keyword = container.querySelector('#bf-kw').value.trim(); st.page = 1; this.paint(container, app); };
    container.querySelector('#bf-go')?.addEventListener('click', searchGo);
    container.querySelector('#bf-kw')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchGo(); });
    container.querySelector('#bf-prev')?.addEventListener('click', () => { if (st.page > 1) { st.page--; this.paint(container, app); } });
    container.querySelector('#bf-next')?.addEventListener('click', () => { st.page++; this.paint(container, app); });

    container.querySelector('#btn-add-q')?.addEventListener('click', () => {
      if (!banks.length) { app.toast('请先新建题库', 'warning'); return; }
      const defBid = st.filterBankId ? Number(st.filterBankId) : banks[0].id;
      this.openQuestionModal(app, null, defBid, banks, () => this.paint(container, app));
    });
    container.querySelectorAll('[data-q-edit]').forEach((b) => {
      b.addEventListener('click', () => {
        const q = pageQuestions.find((x) => x.id === Number(b.dataset.qEdit));
        if (q) this.openQuestionModal(app, q, q.bank_id, banks, () => this.paint(container, app));
      });
    });
    container.querySelectorAll('[data-q-del]').forEach((b) => {
      b.addEventListener('click', async () => {
        const ok = await app.confirm('删除题目', '确定删除这道题吗？', '删除', true);
        if (!ok) return;
        await DB.deleteQuestion(Number(b.dataset.qDel));
        app.toast('已删除', 'success');
        this.paint(container, app);
      });
    });
  },

  openBankModal(app, bank, onSaved) {
    const { DB, escapeHtml } = window.ST;
    const isEdit = Boolean(bank);
    app.openModal({
      title: isEdit ? '重命名题库' : '新建题库',
      bodyHtml: `
        <div class="form-field">
          <label class="form-label">题库名称 *</label>
          <input type="text" id="mb-name" class="input" placeholder="例如：配电自动化补充题库" value="${escapeHtml(bank?.name || '')}" />
        </div>
        <div class="form-field">
          <label class="form-label">备注说明（选填）</label>
          <textarea id="mb-desc" class="textarea" rows="3">${escapeHtml(bank?.description || '')}</textarea>
        </div>
      `,
      footerHtml: `<button class="btn btn-secondary" data-m-close>取消</button><button class="btn btn-primary" id="mb-ok">保存</button>`,
      onMount: (root) => {
        root.querySelector('#mb-ok')?.addEventListener('click', async () => {
          const name = root.querySelector('#mb-name').value.trim();
          const desc = root.querySelector('#mb-desc').value.trim();
          if (!name) { app.toast('请填写题库名称', 'warning'); return; }
          if (isEdit) await DB.updateBank(bank.id, name, desc);
          else await DB.createBank(name, desc);
          app.closeModal();
          app.toast(isEdit ? '已更新' : '已创建', 'success');
          onSaved();
        });
      },
    });
  },

  openQuestionModal(app, q, defBankId, banks, onSaved) {
    const { DB, escapeHtml } = window.ST;
    const isEdit = Boolean(q);
    let qtype = q?.qtype || 'single';
    let options = q && (q.qtype === 'single' || q.qtype === 'multiple') ? [...q.options] : ['', '', '', ''];
    let answer = q?.answer || (qtype === 'judge' ? 'A' : '');

    const renderDyn = (root) => {
      const box = root.querySelector('#mq-dyn');
      if (qtype === 'single' || qtype === 'multiple') {
        const aSet = new Set(answer.split(''));
        const rows = options.map((txt, idx) => {
          const l = String.fromCharCode(65 + idx);
          return `
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
              <label style="display:inline-flex;align-items:center;gap:4px;min-width:46px;font-weight:700;cursor:pointer;">
                <input type="${qtype === 'single' ? 'radio' : 'checkbox'}" name="mq-pick" value="${l}" ${aSet.has(l) ? 'checked' : ''} /> ${l}
              </label>
              <input type="text" class="input" style="padding:7px 10px;" data-mo="${idx}" placeholder="选项 ${l}" value="${escapeHtml(txt)}" />
              ${options.length > 2 ? `<button type="button" class="btn btn-sm btn-soft-danger" data-md="${idx}">✕</button>` : ''}
            </div>
          `;
        }).join('');
        box.innerHTML = `
          <div class="form-field">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <label class="form-label" style="margin:0;">选项（勾选左侧为正确答案）*</label>
              ${options.length < 8 ? `<button type="button" class="btn btn-sm btn-secondary" id="mq-add-o">+ 选项</button>` : ''}
            </div>
            ${rows}
          </div>
        `;
        box.querySelectorAll('[data-mo]').forEach((i) => i.addEventListener('input', () => { options[Number(i.dataset.mo)] = i.value; }));
        box.querySelectorAll('input[name="mq-pick"]').forEach((i) => i.addEventListener('change', () => {
          answer = [...box.querySelectorAll('input[name="mq-pick"]:checked')].map((x) => x.value).sort().join('');
        }));
        box.querySelector('#mq-add-o')?.addEventListener('click', () => { options.push(''); renderDyn(root); });
        box.querySelectorAll('[data-md]').forEach((b) => b.addEventListener('click', () => { options.splice(Number(b.dataset.md), 1); renderDyn(root); }));
      } else if (qtype === 'judge') {
        if (answer !== 'A' && answer !== 'B') answer = 'A';
        box.innerHTML = `
          <div class="form-field">
            <label class="form-label">正确答案 *</label>
            <div style="display:flex;gap:18px;">
              <label style="cursor:pointer;font-weight:700;"><input type="radio" name="mq-j" value="A" ${answer === 'A' ? 'checked' : ''} /> ✓ 正确（A）</label>
              <label style="cursor:pointer;font-weight:700;"><input type="radio" name="mq-j" value="B" ${answer === 'B' ? 'checked' : ''} /> ✕ 错误（B）</label>
            </div>
          </div>
        `;
        box.querySelectorAll('input[name="mq-j"]').forEach((r) => r.addEventListener('change', () => { answer = r.value; }));
      } else {
        box.innerHTML = `
          <div class="form-field">
            <label class="form-label">参考答案 *</label>
            <textarea id="mq-sans" class="textarea" rows="3" placeholder="请输入简答题参考答案...">${escapeHtml(answer)}</textarea>
          </div>
          <div class="form-field">
            <label class="form-label">答案要点及评分标准（选填）</label>
            <textarea id="mq-scrit" class="textarea" rows="2" placeholder="用于模拟考自评打分">${escapeHtml(q?.scoring_criteria || '')}</textarea>
          </div>
        `;
        box.querySelector('#mq-sans')?.addEventListener('input', (e) => { answer = e.target.value; });
      }
    };

    const bankOpts = banks.map((b) => `<option value="${b.id}" ${b.id === defBankId ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('');
    app.openModal({
      title: isEdit ? '编辑题目' : '手动新增题目',
      bodyHtml: `
        <div class="form-row-2">
          <div class="form-field"><label class="form-label">所属题库</label><select id="mq-bank" class="select">${bankOpts}</select></div>
          <div class="form-field">
            <label class="form-label">题型</label>
            <select id="mq-type" class="select">
              <option value="single" ${qtype === 'single' ? 'selected' : ''}>单选题</option>
              <option value="multiple" ${qtype === 'multiple' ? 'selected' : ''}>多选题</option>
              <option value="judge" ${qtype === 'judge' ? 'selected' : ''}>判断题</option>
              <option value="short" ${qtype === 'short' ? 'selected' : ''}>简答题</option>
            </select>
          </div>
        </div>
        <div class="form-field"><label class="form-label">试题正文 *</label><textarea id="mq-stem" class="textarea" rows="3">${escapeHtml(q?.content || '')}</textarea></div>
        <div id="mq-dyn"></div>
        <div class="form-field"><label class="form-label">答案解析（选填）</label><textarea id="mq-exp" class="textarea" rows="2">${escapeHtml(q?.explanation || '')}</textarea></div>
        <div class="form-row-2">
          <div class="form-field"><label class="form-label">章节 / 出处</label><input type="text" id="mq-cat" class="input" value="${escapeHtml(q?.category || '')}" /></div>
          <div class="form-field"><label class="form-label">试题编号</label><input type="text" id="mq-code" class="input" value="${escapeHtml(q?.code || '')}" /></div>
        </div>
      `,
      footerHtml: `<button class="btn btn-secondary" data-m-close>取消</button><button class="btn btn-primary" id="mq-ok">保存</button>`,
      onMount: (root) => {
        renderDyn(root);
        root.querySelector('#mq-type')?.addEventListener('change', (e) => {
          qtype = e.target.value;
          answer = qtype === 'judge' ? 'A' : '';
          if ((qtype === 'single' || qtype === 'multiple') && options.length < 2) options = ['', '', '', ''];
          renderDyn(root);
        });
        root.querySelector('#mq-ok')?.addEventListener('click', async () => {
          try {
            const payload = {
              bank_id: Number(root.querySelector('#mq-bank').value),
              qtype,
              content: root.querySelector('#mq-stem').value.trim(),
              options: (qtype === 'single' || qtype === 'multiple') ? options.map((x) => x.trim()).filter(Boolean) : [],
              answer: answer.trim(),
              explanation: root.querySelector('#mq-exp').value.trim(),
              scoring_criteria: root.querySelector('#mq-scrit')?.value.trim() || (q?.scoring_criteria || ''),
              category: root.querySelector('#mq-cat').value.trim() || '未分类',
              code: root.querySelector('#mq-code').value.trim(),
            };
            if (isEdit) await DB.updateQuestion(q.id, payload);
            else await DB.createQuestion(payload);
            app.closeModal();
            app.toast(isEdit ? '题目已更新' : '题目已添加', 'success');
            onSaved();
          } catch (err) {
            app.toast(err.message, 'error');
          }
        });
      },
    });
  },
};

function renderPreviewBox(p, banks) {
  const { escapeHtml, formatAnswerLabel, qtypeBadgeHtml } = window.ST;
  const existOpts = banks.map((b) => `<option value="${b.id}">${escapeHtml(b.name)} (${b.total_count}题)</option>`).join('');
  const sampleHtml = p.questions.slice(0, 6).map((q) => `
    <div style="padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;">
      ${qtypeBadgeHtml(q.qtype)} <strong>${escapeHtml(q.content.slice(0, 65))}${q.content.length > 65 ? '...' : ''}</strong>
      <span style="color:var(--green);margin-left:6px;font-weight:700;">[${escapeHtml(formatAnswerLabel(q.qtype, q.answer).slice(0, 20))}]</span>
    </div>
  `).join('');

  return `
    <div style="margin-top:14px;padding:14px;border-radius:14px;border:1.5px solid var(--brand);background:var(--bg-subtle);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <strong>预览：${escapeHtml(p.filename)}（共 ${p.total} 题）</strong>
        <button class="btn btn-sm btn-secondary" id="imp-cancel">取消</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        <span class="badge badge-single">单选 ${p.by_type.single}</span>
        <span class="badge badge-multiple">多选 ${p.by_type.multiple}</span>
        <span class="badge badge-judge">判断 ${p.by_type.judge}</span>
        <span class="badge badge-short">简答 ${p.by_type.short}</span>
        ${p.warnings.length ? `<span class="badge badge-warning">跳过/警告 ${p.warnings.length}</span>` : ''}
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:10px;font-size:13px;font-weight:600;">
        <label style="cursor:pointer;"><input type="radio" name="imp-mode" value="new" checked /> 创建为新题库</label>
        ${banks.length ? `<label style="cursor:pointer;"><input type="radio" name="imp-mode" value="existing" /> 追加到已有题库</label>` : ''}
        <label style="cursor:pointer;"><input type="checkbox" id="imp-dup" checked /> 自动去重</label>
      </div>
      <div id="imp-new-box" style="margin-bottom:10px;">
        <input type="text" id="imp-bname" class="input" placeholder="输入新题库名称" value="${escapeHtml(p.suggested_bank_name)}" />
      </div>
      <div id="imp-old-box" class="hidden" style="margin-bottom:10px;">
        <select id="imp-bid" class="select">${existOpts}</select>
      </div>
      <div style="margin-bottom:12px;">${sampleHtml}</div>
      <button class="btn btn-primary btn-block" id="imp-ok" ${p.total === 0 ? 'disabled' : ''}>✓ 确认导入 ${p.total} 道试题</button>
    </div>
  `;
}
