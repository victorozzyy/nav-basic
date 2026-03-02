/**
 * XtreamPlaylistSelector v2.0
 *
 * Usa a section#playlistScreen já presente no HTML (não cria div dinâmica).
 * Isso garante que ao pressionar BACK o usuário retorne ao próprio xtream.html.
 */

const XtreamPlaylistSelector = {

    INDEX_URL: 'https://raw.githubusercontent.com/victorozzyy/m3uplayer-web/refs/heads/main/playlists2/listaauto004.m3u',

    PROXIES: [
        '',
        'https://corsproxy.io/?',
        'https://api.allorigins.win/raw?url='
    ],

    playlists: [],
    _items: [],
    _focusIdx: 0,
    _onSelect: null,
    _keyHandler: null,

    async show(onSelect) {
        this._onSelect = onSelect;
        this._showScreen();
        this._setStatus('🔄 Buscando listas...');

        try {
            const text = await this._fetchText(this.INDEX_URL);
            this.playlists = this._parseUrls(text);

            if (!this.playlists.length) {
                this._setStatus('⚠️ Nenhuma lista encontrada.');
                return;
            }

            this._renderList();
            this._setStatus('↑↓ Navegar  ·  OK Selecionar  ·  1-9 Acesso rápido');

        } catch (err) {
            this._setStatus('❌ Erro: ' + err.message);
        }
    },

    _showScreen() {
        ['mainMenu', 'categoryScreen', 'seriesScreen', 'channelScreen',
         'favoritesScreen', 'continueScreen'].forEach(id => {
            document.getElementById(id)?.classList.add('hidden');
        });
        const screen = document.getElementById('playlistScreen');
        if (screen) screen.classList.remove('hidden');
        this._attachKeys();
    },

    _hideScreen() {
        const screen = document.getElementById('playlistScreen');
        if (screen) screen.classList.add('hidden');
        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler, true);
            this._keyHandler = null;
        }
    },

    async _fetchText(url) {
        for (const proxy of this.PROXIES) {
            try {
                const target = proxy ? proxy + encodeURIComponent(url) : url;
                const r = await fetch(target, { cache: 'no-store' });
                if (r.ok) return await r.text();
            } catch (e) {}
        }
        throw new Error('Não foi possível baixar o índice de listas.');
    },

    _parseUrls(text) {
        const result = [];
        text.split(/\r?\n/).forEach(raw => {
            const line = raw.trim();
            if (!line || line.startsWith('#')) return;
            try {
                const u = new URL(line);
                const name = u.hostname.replace(/^www\./, '');
                result.push({ name, url: line });
            } catch {}
        });
        return result;
    },

    _setStatus(msg) {
        const el = document.getElementById('psStatus');
        if (el) el.textContent = msg;
    },

    _renderList() {
        const list = document.getElementById('psList');
        if (!list) return;
        list.innerHTML = '';
        this._items = [];
        this._focusIdx = 0;

        this.playlists.forEach((p, i) => {
            const isXtream = /get\.php|username=/.test(p.url);
            const li = document.createElement('li');
            li.className = 'ps-item';
            li.innerHTML = `
                <div class="ps-num">${i + 1}</div>
                <div class="ps-info">
                    <div class="ps-name">${p.name}</div>
                    <div class="ps-url">${p.url}</div>
                </div>
                <div class="ps-badge">${isXtream ? '📡 Xtream' : '📄 M3U'}</div>
            `;
            li.addEventListener('click', () => this._select(i));
            list.appendChild(li);
            this._items.push(li);
        });

        this._updateFocus();
    },

    _updateFocus() {
        this._items.forEach((el, i) => el.classList.toggle('focused', i === this._focusIdx));
        this._items[this._focusIdx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },

    _select(idx) {
        const p = this.playlists[idx];
        if (!p) return;
        this._hideScreen();
        if (this._onSelect) this._onSelect(p);
    },

    _attachKeys() {
        if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler, true);

        this._keyHandler = (e) => {
            const screen = document.getElementById('playlistScreen');
            if (!screen || screen.classList.contains('hidden')) return;

            const code = e.keyCode || e.which;

            if (code === 38 || e.key === 'ArrowUp') {
                e.preventDefault(); e.stopPropagation();
                if (this._focusIdx > 0) { this._focusIdx--; this._updateFocus(); }
                return;
            }
            if (code === 40 || e.key === 'ArrowDown') {
                e.preventDefault(); e.stopPropagation();
                if (this._focusIdx < this._items.length - 1) { this._focusIdx++; this._updateFocus(); }
                return;
            }
            if (code === 13 || code === 65385 || e.key === 'Enter') {
                e.preventDefault(); e.stopPropagation();
                this._select(this._focusIdx);
                return;
            }
            if (code >= 49 && code <= 57) {
                e.preventDefault(); e.stopPropagation();
                const idx = code - 49;
                if (idx < this._items.length) this._select(idx);
                return;
            }
            e.preventDefault(); e.stopPropagation();
        };

        document.addEventListener('keydown', this._keyHandler, true);
    }
};

window.XtreamPlaylistSelector = XtreamPlaylistSelector;
console.log('✅ XtreamPlaylistSelector v2.0 carregado');