/**
 * 刷题神器 PWA Main Controller
 * Handles IndexedDB init/seeding, Service Worker offline registration,
 * PWA install prompt, routing, drawers, modals, toasts, and themes.
 */

window.ST = window.ST || {};

const App = {
  state: {
    currentView: 'home',
    currentParams: {},
    banks: [],
    activeBankId: null,
    settings: {},
  },
  deferredInstallPrompt: null,

  async init() {
    this.registerPWA();
    this.bindGlobalEvents();
    const { DB } = window.ST;

    try {
      await DB.ensureSeeded();
      const [settings, banks] = await Promise.all([DB.getSettings(), DB.listBanks()]);
      this.state.settings = settings;
      this.state.banks = banks;

      if (settings.active_bank_id && banks.some((b) => b.id === settings.active_bank_id)) {
        this.state.activeBankId = settings.active_bank_id;
      } else if (settings.active_bank_id === null && banks.length > 0 && localStorage.getItem('st_bank_explicit_all') !== '1') {
        this.state.activeBankId = banks[0].id;
      } else {
        this.state.activeBankId = null;
      }

      this.applyTheme(settings.theme || 'light');
      this.applyFontSize(settings.font_size || 'md');
      await this.navigate('home');
    } catch (err) {
      document.getElementById('app-main').innerHTML = `
        <div class="container"><div class="card empty-box">
          <div class="empty-ico">⚠️</div>
          <div class="empty-ttl">初始化本地数据库失败</div>
          <p>${window.ST.escapeHtml(err.message)}</p>
        </div></div>
      `;
    }
  },

  registerPWA() {
    // Capture Chrome/Edge/Android install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      document.getElementById('btn-install-pwa-top')?.classList.remove('hidden');
      if (this.state.currentView === 'home' || this.state.currentView === 'me') {
        this.renderCurrentView();
      }
    });

    window.addEventListener('appinstalled', () => {
      this.deferredInstallPrompt = null;
      document.getElementById('btn-install-pwa-top')?.classList.add('hidden');
      this.toast('🎉 「刷题神器」已成功安装到本设备！', 'success');
    });

    // Register Service Worker for full offline capability
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              this.toast('发现新版本，刷新页面即可升级');
            }
          });
        });
      }).catch(() => {});
    }

    // Optional local desktop launcher SSE lifecycle (ignored cleanly when hosted statically!)
    if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
      try {
        const es = new EventSource('./api/lifecycle');
        es.onerror = () => { try { es.close(); } catch {} };
        window.addEventListener('beforeunload', () => { try { es.close(); } catch {} });
      } catch {}
    }
  },

  async promptInstallPWA() {
    if (!this.deferredInstallPrompt) {
      this.navigate('me');
      return;
    }
    this.deferredInstallPrompt.prompt();
    const choice = await this.deferredInstallPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      this.deferredInstallPrompt = null;
      document.getElementById('btn-install-pwa-top')?.classList.add('hidden');
    }
  },

  themeIcon() {
    const t = this.state.settings.theme || 'light';
    return t === 'dark' ? '🌙' : t === 'eyecare' ? '🌿' : '☀️';
  },

  applyTheme(theme) {
    const t = ['light', 'eyecare', 'dark'].includes(theme) ? theme : 'light';
    document.documentElement.setAttribute('data-theme', t);
    const meta = document.getElementById('meta-theme-color');
    if (meta) {
      meta.setAttribute('content', t === 'dark' ? '#0c1220' : t === 'eyecare' ? '#ece8dc' : '#1677ff');
    }
    const btn = document.getElementById('btn-quick-theme');
    if (btn) btn.textContent = t === 'dark' ? '🌙' : t === 'eyecare' ? '🌿' : '☀️';
  },

  async setTheme(theme) {
    this.state.settings.theme = theme;
    this.applyTheme(theme);
    await window.ST.DB.updateSettings({ theme });
  },

  async cycleTheme() {
    const order = ['light', 'eyecare', 'dark'];
    const labels = { light: '经典蓝白', eyecare: '护眼米纸', dark: '夜间深色' };
    const idx = order.indexOf(this.state.settings.theme || 'light');
    const next = order[(idx + 1) % order.length];
    await this.setTheme(next);
    this.toast(`已切换主题：${labels[next]}`);
    if (this.state.currentView === 'home' || this.state.currentView === 'me') {
      this.renderCurrentView();
    }
  },

  applyFontSize(size) {
    const s = ['sm', 'md', 'lg'].includes(size) ? size : 'md';
    document.documentElement.setAttribute('data-font', s);
  },

  async setFontSize(size) {
    this.state.settings.font_size = size;
    this.applyFontSize(size);
    await window.ST.DB.updateSettings({ font_size: size });
  },

  async setActiveBank(bankId) {
    this.state.activeBankId = bankId ? Number(bankId) : null;
    localStorage.setItem('st_bank_explicit_all', this.state.activeBankId === null ? '1' : '0');
    await window.ST.DB.updateSettings({ active_bank_id: this.state.activeBankId });
  },

  bindGlobalEvents() {
    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => this.navigate(btn.dataset.tab));
    });
    document.getElementById('topbar-logo-btn')?.addEventListener('click', () => this.navigate('home'));
    document.getElementById('btn-quick-theme')?.addEventListener('click', () => this.cycleTheme());
    document.getElementById('btn-install-pwa-top')?.addEventListener('click', () => this.promptInstallPWA());

    document.addEventListener('keydown', (e) => {
      const modal = document.getElementById('modal-root');
      const drawer = document.getElementById('drawer-root');
      if (modal && !modal.classList.contains('hidden')) {
        if (e.key === 'Escape') this.closeModal();
        return;
      }
      if (drawer && !drawer.classList.contains('hidden')) {
        if (e.key === 'Escape') this.closeDrawer();
        return;
      }
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;

      const view = window.ST.Views[this.state.currentView];
      if (view && typeof view.handleKeydown === 'function') {
        view.handleKeydown(e, document.getElementById('app-main'), this);
      }
    });
  },

  async navigate(viewName, params = {}) {
    const prev = window.ST.Views[this.state.currentView];
    if (prev && typeof prev.cleanup === 'function') prev.cleanup();

    this.closeDrawer();
    this.closeModal();

    this.state.currentView = viewName;
    this.state.currentParams = params;

    const target = window.ST.Views[viewName];
    const isImmersive = Boolean(target?.immersive);
    document.body.classList.toggle('immersive-mode', isImmersive);
    document.getElementById('app-main')?.classList.toggle('has-tabbar', !isImmersive);

    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === viewName);
    });

    await this.renderCurrentView();
    window.scrollTo({ top: 0, behavior: 'instant' });
  },

  async renderCurrentView() {
    const main = document.getElementById('app-main');
    const view = window.ST.Views[this.state.currentView];
    if (!view) return;
    try {
      await view.render(main, this, this.state.currentParams);
    } catch (err) {
      this.toast(err.message || '页面渲染异常', 'error');
    }
  },

  // ------------------------------------------------------------------
  // Drawer, Modal, Confirm & Toast
  // ------------------------------------------------------------------

  openDrawer({ title, bodyHtml, onMount = null }) {
    const root = document.getElementById('drawer-root');
    root.innerHTML = `
      <div class="drawer-sheet">
        <div class="drawer-handle"></div>
        <div class="drawer-head">
          <h3 class="drawer-title">${window.ST.escapeHtml(title)}</h3>
          <button type="button" class="close-x" data-d-close aria-label="关闭">✕</button>
        </div>
        <div class="drawer-body">${bodyHtml}</div>
      </div>
    `;
    root.classList.remove('hidden');
    root.querySelectorAll('[data-d-close]').forEach((b) => b.addEventListener('click', () => this.closeDrawer()));
    root.onclick = (e) => { if (e.target === root) this.closeDrawer(); };
    if (typeof onMount === 'function') onMount(root);
  },

  closeDrawer() {
    const root = document.getElementById('drawer-root');
    if (root) { root.classList.add('hidden'); root.innerHTML = ''; }
  },

  openModal({ title, bodyHtml, footerHtml = '', onMount = null }) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-box">
        <div class="modal-head">
          <h3 class="modal-title">${window.ST.escapeHtml(title)}</h3>
          <button type="button" class="close-x" data-m-close aria-label="关闭">✕</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-foot">${footerHtml}</div>` : ''}
      </div>
    `;
    root.classList.remove('hidden');
    root.querySelectorAll('[data-m-close]').forEach((b) => b.addEventListener('click', () => this.closeModal()));
    root.onclick = (e) => { if (e.target === root) this.closeModal(); };
    if (typeof onMount === 'function') onMount(root);
  },

  closeModal() {
    const root = document.getElementById('modal-root');
    if (root) { root.classList.add('hidden'); root.innerHTML = ''; }
  },

  confirm(title, message, okText = '确定', danger = false) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; this.closeModal(); resolve(v); };
      this.openModal({
        title,
        bodyHtml: `<p style="margin:0;line-height:1.7;color:var(--text-2);font-size:14.5px;">${window.ST.escapeHtml(message)}</p>`,
        footerHtml: `
          <button type="button" class="btn btn-secondary" id="cfm-no">取消</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="cfm-yes">${window.ST.escapeHtml(okText)}</button>
        `,
        onMount: (root) => {
          root.querySelector('#cfm-no')?.addEventListener('click', () => finish(false));
          root.querySelector('#cfm-yes')?.addEventListener('click', () => finish(true));
          root.querySelectorAll('[data-m-close]').forEach((b) => b.addEventListener('click', () => finish(false)));
          root.onclick = (e) => { if (e.target === root) finish(false); };
        },
      });
    });
  },

  toast(message, type = 'default') {
    const stack = document.getElementById('toast-root');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = `toast ${type !== 'default' ? type : ''}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.22s';
      setTimeout(() => el.remove(), 240);
    }, 2400);
  },
};

window.ST.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
