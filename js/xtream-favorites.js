/**
 * XtreamFavorites v1.0
 * Gerenciamento de canais/filmes/séries favoritos
 * Compatível com Smart TV Tizen
 */

const XtreamFavorites = {

    STORAGE_KEY: 'xtream_favorites',

    // Cache em memória
    _data: null,

    // ═══════════════════════════════════════════════════════════
    // STORAGE
    // ═══════════════════════════════════════════════════════════

    _load() {
        if (this._data) return this._data;
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            this._data = raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.warn('⚠️ XtreamFavorites: erro ao carregar', e);
            this._data = [];
        }
        return this._data;
    },

    _save() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._data));
        } catch (e) {
            console.warn('⚠️ XtreamFavorites: erro ao salvar', e);
        }
    },

    // ═══════════════════════════════════════════════════════════
    // API PÚBLICA
    // ═══════════════════════════════════════════════════════════

    /**
     * Retorna todos os favoritos
     * @returns {Array} lista de favoritos
     */
    getAll() {
        return this._load();
    },

    /**
     * Verifica se um item é favorito (por URL)
     * @param {string} url
     * @returns {boolean}
     */
    isFavorite(url) {
        return this._load().some(f => f.url === url);
    },

    /**
     * Adiciona um item aos favoritos
     * @param {Object} item - { url, name, logo, group, type }
     *   type: 'live' | 'vod' | 'series'
     * @returns {boolean} true se adicionado, false se já existia
     */
    add(item) {
        const list = this._load();
        if (list.some(f => f.url === item.url)) {
            console.log('⭐ Já é favorito:', item.name);
            return false;
        }

        list.unshift({
            url:       item.url || '',
            name:      item.name || 'Sem nome',
            logo:      item.logo || item.stream_icon || '',
            group:     item.group || '',
            type:      item.type || 'live',
            addedAt:   Date.now()
        });

        this._save();
        console.log('⭐ Favorito adicionado:', item.name);
        this._notify('added', item);
        return true;
    },

    /**
     * Remove um item dos favoritos (por URL)
     * @param {string} url
     * @returns {boolean} true se removido
     */
    remove(url) {
        const list = this._load();
        const idx = list.findIndex(f => f.url === url);
        if (idx === -1) return false;

        const removed = list.splice(idx, 1)[0];
        this._save();
        console.log('🗑️ Favorito removido:', removed.name);
        this._notify('removed', removed);
        return true;
    },

    /**
     * Alterna favorito (adiciona se não existe, remove se existe)
     * @param {Object} item - { url, name, logo, group, type }
     * @returns {'added'|'removed'}
     */
    toggle(item) {
        if (this.isFavorite(item.url)) {
            this.remove(item.url);
            return 'removed';
        } else {
            this.add(item);
            return 'added';
        }
    },

    /**
     * Remove todos os favoritos
     */
    clear() {
        this._data = [];
        this._save();
        console.log('🗑️ Todos os favoritos removidos');
    },

    /**
     * Retorna favoritos filtrados por tipo
     * @param {'live'|'vod'|'series'} type
     */
    getByType(type) {
        return this._load().filter(f => f.type === type);
    },

    /**
     * Busca favoritos pelo nome
     * @param {string} query
     */
    search(query) {
        const q = query.toLowerCase();
        return this._load().filter(f => f.name.toLowerCase().includes(q));
    },

    /**
     * Total de favoritos
     */
    count() {
        return this._load().length;
    },

    // ═══════════════════════════════════════════════════════════
    // EVENTOS
    // ═══════════════════════════════════════════════════════════

    _notify(action, item) {
        document.dispatchEvent(new CustomEvent('xtream:favorite', {
            detail: { action, item }
        }));
    },

    // ═══════════════════════════════════════════════════════════
    // UI HELPERS
    // ═══════════════════════════════════════════════════════════

    /**
     * Exibe notificação toast na tela
     * @param {'added'|'removed'} action
     * @param {string} name
     */
    showToast(action, name) {
        let toast = document.getElementById('favToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'favToast';
            toast.style.cssText = `
                position: fixed;
                bottom: 80px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0,0,0,0.95);
                color: #fff;
                padding: 14px 28px;
                border-radius: 8px;
                font-size: 17px;
                z-index: 99999;
                border: 2px solid #f5c518;
                pointer-events: none;
                transition: opacity 0.3s;
                white-space: nowrap;
            `;
            document.body.appendChild(toast);
        }

        const icon  = action === 'added' ? '⭐' : '💔';
        const label = action === 'added' ? 'Adicionado aos favoritos' : 'Removido dos favoritos';
        const short = name.length > 30 ? name.substring(0, 30) + '…' : name;
        toast.textContent = `${icon} ${short} — ${label}`;
        toast.style.opacity = '1';
        toast.style.display = 'block';

        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => { toast.style.display = 'none'; }, 350);
        }, 2500);
    },

    /**
     * Renderiza lista de favoritos em um elemento UL/container
     * @param {HTMLElement} container
     * @param {Function} onPlay - callback(item) chamado ao clicar
     * @param {Function} onRemove - callback(item) opcional
     */
    renderList(container, onPlay, onRemove) {
        if (!container) return;

        const list = this.getAll();
        container.innerHTML = '';

        if (!list.length) {
            container.innerHTML = `
                <li style="color:#666;text-align:center;padding:40px 20px;font-size:16px;list-style:none;">
                    ⭐ Nenhum favorito ainda.<br>
                    <span style="font-size:13px;color:#555;margin-top:8px;display:block;">
                        Pressione F ou o botão ⭐ em qualquer canal para favoritar.
                    </span>
                </li>`;
            return;
        }

        const typeIcons = { live: '📺', vod: '🎬', series: '📺', default: '▶️' };

        list.forEach(item => {
            const li = document.createElement('li');
            li.className = 'channel-item fav-item';
            li.dataset.url = item.url;

            // Logo / placeholder
            if (item.logo) {
                const img = document.createElement('img');
                img.className = 'thumb';
                img.src = item.logo;
                img.loading = 'lazy';
                img.onerror = () => { img.remove(); li.insertBefore(makePlaceholder(item.type), li.firstChild); };
                li.appendChild(img);
            } else {
                li.appendChild(makePlaceholder(item.type));
            }

            // Nome
            const nameEl = document.createElement('span');
            nameEl.className = 'name';
            nameEl.textContent = item.name;
            li.appendChild(nameEl);

            // Badge de tipo
            const badge = document.createElement('span');
            badge.style.cssText = 'position:absolute;top:6px;right:6px;font-size:11px;background:rgba(0,0,0,0.7);padding:2px 6px;border-radius:4px;color:#ccc;';
            badge.textContent = item.type || 'live';
            li.appendChild(badge);

            // Botão remover
            const btnRemove = document.createElement('button');
            btnRemove.className = 'fav-remove-btn';
            btnRemove.textContent = '🗑️';
            btnRemove.title = 'Remover dos favoritos';
            btnRemove.style.cssText = 'position:absolute;bottom:6px;right:6px;background:rgba(200,0,0,0.8);border:none;color:#fff;border-radius:4px;padding:3px 7px;font-size:13px;cursor:pointer;display:none;';
            li.appendChild(btnRemove);

            li.addEventListener('mouseenter', () => btnRemove.style.display = 'block');
            li.addEventListener('mouseleave', () => btnRemove.style.display = 'none');

            // Ações
            li.onclick = () => { if (onPlay) onPlay(item); };
            btnRemove.onclick = (e) => {
                e.stopPropagation();
                this.remove(item.url);
                this.showToast('removed', item.name);
                li.remove();
                if (onRemove) onRemove(item);
                if (!container.children.length) this.renderList(container, onPlay, onRemove);
            };

            li.style.position = 'relative';
            container.appendChild(li);
        });

        function makePlaceholder(type) {
            const d = document.createElement('div');
            d.className = 'thumb-placeholder';
            d.textContent = typeIcons[type] || typeIcons.default;
            return d;
        }
    },

    /**
     * Cria botão de favorito (⭐/💔) pronto para usar
     * @param {Object} item - { url, name, logo, group, type }
     * @returns {HTMLButtonElement}
     */
    createToggleButton(item) {
        const btn = document.createElement('button');
        btn.className = 'fav-toggle-btn';

        const update = () => {
            const isFav = this.isFavorite(item.url);
            btn.textContent = isFav ? '⭐ Favorito' : '☆ Favoritar';
            btn.style.borderColor = isFav ? '#f5c518' : '#555';
            btn.style.color = isFav ? '#f5c518' : '#ccc';
        };

        btn.style.cssText = `
            padding: 8px 16px;
            border-radius: 6px;
            background: rgba(0,0,0,0.7);
            border: 2px solid #555;
            font-size: 15px;
            cursor: pointer;
            transition: all 0.2s;
        `;

        btn.onclick = () => {
            const action = this.toggle(item);
            this.showToast(action, item.name);
            update();
        };

        update();
        return btn;
    }
};

// Expor globalmente
window.XtreamFavorites = XtreamFavorites;
console.log('⭐ XtreamFavorites v1.0 carregado');
