/**
 * XtreamContinue v1.0
 * "Continue Assistindo" — salva e restaura posição de reprodução
 * Compatível com Smart TV Tizen
 *
 * USO NO player.html:
 *   // Ao iniciar o player, restaurar posição:
 *   const saved = XtreamContinue.getPosition(url);
 *   if (saved && saved.positionMs > 30000) {
 *       avplay.seekTo(saved.positionMs);
 *   }
 *
 *   // Durante reprodução (a cada N segundos):
 *   XtreamContinue.savePosition({ url, name, logo, positionMs, durationMs });
 *
 *   // Ao fechar/sair:
 *   XtreamContinue.savePosition({ url, name, logo, positionMs, durationMs });
 *   // Se assistiu tudo (>90%), marca como concluído:
 *   XtreamContinue.markFinished(url);
 */

const XtreamContinue = {

    STORAGE_KEY:  'xtream_continue',
    MAX_ITEMS:    50,       // máximo de itens guardados
    MIN_POSITION: 10000,    // não salva se < 10s (evita lixo)
    SAVE_INTERVAL: 15000,   // salva a cada 15s durante reprodução
    FINISH_THRESHOLD: 0.90, // acima de 90% → considera concluído

    // Cache em memória: { [url]: { ...dados } }
    _data: null,

    // Timer de salvamento periódico
    _saveTimer: null,

    // ═══════════════════════════════════════════════════════════
    // STORAGE
    // ═══════════════════════════════════════════════════════════

    _load() {
        if (this._data) return this._data;
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            this._data = raw ? JSON.parse(raw) : {};
        } catch (e) {
            console.warn('⚠️ XtreamContinue: erro ao carregar', e);
            this._data = {};
        }
        return this._data;
    },

    _save() {
        try {
            // Garante limite de MAX_ITEMS (remove os mais antigos)
            const data = this._data;
            const keys = Object.keys(data);
            if (keys.length > this.MAX_ITEMS) {
                keys.sort((a, b) => (data[a].updatedAt || 0) - (data[b].updatedAt || 0));
                const toDelete = keys.slice(0, keys.length - this.MAX_ITEMS);
                toDelete.forEach(k => delete data[k]);
            }
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('⚠️ XtreamContinue: erro ao salvar', e);
        }
    },

    // ═══════════════════════════════════════════════════════════
    // CHAVE DE INDEXAÇÃO (usa URL como key)
    // ═══════════════════════════════════════════════════════════

    _key(url) {
        // Remove tokens/timestamps da URL para evitar duplicatas
        return url ? url.split('?')[0] : url;
    },

    // ═══════════════════════════════════════════════════════════
    // API PÚBLICA — POSIÇÃO
    // ═══════════════════════════════════════════════════════════

    /**
     * Salva posição de reprodução
     * @param {Object} opts
     * @param {string}  opts.url          URL do stream
     * @param {string}  opts.name         Nome do canal/filme/episódio
     * @param {string}  [opts.logo]       URL da logo/poster
     * @param {string}  [opts.group]      Categoria
     * @param {string}  [opts.type]       'live' | 'vod' | 'series'
     * @param {number}  opts.positionMs   Posição atual em milissegundos
     * @param {number}  [opts.durationMs] Duração total em milissegundos
     */
    savePosition({ url, name, logo, group, type, positionMs, durationMs }) {
        if (!url || positionMs == null) return;
        if (positionMs < this.MIN_POSITION) return; // muito curto, ignora

        const key  = this._key(url);
        const data = this._load();

        const progress = durationMs > 0 ? positionMs / durationMs : 0;

        // Se > FINISH_THRESHOLD e já existe entrada, marca como concluído
        if (progress >= this.FINISH_THRESHOLD && data[key]) {
            this.markFinished(url);
            return;
        }

        data[key] = {
            url,
            name:        name || data[key]?.name || 'Sem nome',
            logo:        logo || data[key]?.logo || '',
            group:       group || data[key]?.group || '',
            type:        type || data[key]?.type || 'vod',
            positionMs:  Math.floor(positionMs),
            durationMs:  durationMs ? Math.floor(durationMs) : (data[key]?.durationMs || 0),
            progress:    parseFloat(progress.toFixed(4)),
            finished:    false,
            updatedAt:   Date.now(),
            addedAt:     data[key]?.addedAt || Date.now()
        };

        this._save();
    },

    /**
     * Recupera posição salva de uma URL
     * @param {string} url
     * @returns {Object|null} { positionMs, durationMs, progress, finished, ... } ou null
     */
    getPosition(url) {
        const key  = this._key(url);
        const data = this._load();
        return data[key] || null;
    },

    /**
     * Marca item como concluído (remove do "continue assistindo")
     * @param {string} url
     */
    markFinished(url) {
        const key  = this._key(url);
        const data = this._load();
        if (data[key]) {
            data[key].finished  = true;
            data[key].progress  = 1;
            data[key].updatedAt = Date.now();
            this._save();
            console.log('✅ XtreamContinue: concluído —', data[key].name);
            this._notify('finished', data[key]);
        }
    },

    /**
     * Remove entrada de uma URL
     * @param {string} url
     */
    remove(url) {
        const key  = this._key(url);
        const data = this._load();
        if (data[key]) {
            const item = data[key];
            delete data[key];
            this._save();
            console.log('🗑️ XtreamContinue: removido —', item.name);
        }
    },

    /**
     * Remove todos
     */
    clear() {
        this._data = {};
        this._save();
        console.log('🗑️ XtreamContinue: histórico limpo');
    },

    /**
     * Retorna lista de itens em progresso (não concluídos), mais recentes primeiro
     * @returns {Array}
     */
    getInProgress() {
        const data = this._load();
        return Object.values(data)
            .filter(i => !i.finished && i.positionMs >= this.MIN_POSITION)
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },

    /**
     * Retorna TODOS os itens (incluindo concluídos), mais recentes primeiro
     */
    getAll() {
        const data = this._load();
        return Object.values(data)
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },

    /**
     * Verifica se uma URL tem posição salva (e não foi concluída)
     * @param {string} url
     * @returns {boolean}
     */
    hasProgress(url) {
        const item = this.getPosition(url);
        return !!(item && !item.finished && item.positionMs >= this.MIN_POSITION);
    },

    /**
     * Total de itens em progresso
     */
    count() {
        return this.getInProgress().length;
    },

    // ═══════════════════════════════════════════════════════════
    // INTEGRAÇÃO COM AVPLAY (player.html)
    // ═══════════════════════════════════════════════════════════

    /**
     * Inicia salvamento automático periódico durante reprodução.
     * Chame depois que o avplay.play() estiver rodando.
     *
     * @param {Object} opts - { getPositionMs, getDurationMs, url, name, logo, group, type }
     *   getPositionMs: função que retorna avplay.getCurrentTime()
     *   getDurationMs: função que retorna avplay.getDuration()
     */
    startAutoSave({ getPositionMs, getDurationMs, url, name, logo, group, type }) {
        this.stopAutoSave();

        this._saveTimer = setInterval(() => {
            try {
                const pos = getPositionMs();
                const dur = getDurationMs ? getDurationMs() : 0;
                if (pos > 0) {
                    this.savePosition({ url, name, logo, group, type, positionMs: pos, durationMs: dur });
                }
            } catch (e) {
                // silencioso — avplay pode estar em estado inválido
            }
        }, this.SAVE_INTERVAL);

        console.log('⏱️ XtreamContinue: auto-save iniciado para', name);
    },

    /**
     * Para o salvamento automático
     */
    stopAutoSave() {
        if (this._saveTimer) {
            clearInterval(this._saveTimer);
            this._saveTimer = null;
        }
    },

    /**
     * Retorna a posição de retomada para exibir prompt ao usuário.
     * Retorna null se não houver posição salva relevante.
     *
     * @param {string} url
     * @returns {{ positionMs, label } | null}
     */
    getResumeInfo(url) {
        const item = this.getPosition(url);
        if (!item || item.finished || item.positionMs < this.MIN_POSITION) return null;
        return {
            positionMs: item.positionMs,
            label:      this._formatTime(item.positionMs),
            progress:   item.progress,
            name:       item.name
        };
    },

    // ═══════════════════════════════════════════════════════════
    // UI HELPERS
    // ═══════════════════════════════════════════════════════════

    /**
     * Exibe prompt de retomada (overlay) dentro do player.
     * Retorna uma Promise que resolve com true (retomar) ou false (do início).
     *
     * @param {string} url
     * @returns {Promise<boolean>}
     */
    showResumePrompt(url) {
        return new Promise((resolve) => {
            const info = this.getResumeInfo(url);
            if (!info) { resolve(false); return; }

            // Cria overlay
            const overlay = document.createElement('div');
            overlay.id = 'continuePrompt';
            overlay.style.cssText = `
                position: fixed;
                bottom: 100px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0,0,0,0.95);
                border: 2px solid #0f0;
                border-radius: 10px;
                padding: 20px 32px;
                z-index: 99999;
                text-align: center;
                color: #fff;
                font-size: 16px;
                min-width: 340px;
            `;
            overlay.innerHTML = `
                <div style="margin-bottom:12px;font-size:18px;">⏯️ Continuar assistindo?</div>
                <div style="color:#aaa;font-size:14px;margin-bottom:18px;">
                    Parou em <strong style="color:#0f0;">${info.label}</strong>
                    ${info.progress ? `<span style="color:#555"> · ${Math.round(info.progress * 100)}% assistido</span>` : ''}
                </div>
                <div style="display:flex;gap:16px;justify-content:center;">
                    <button id="cpResume" style="padding:10px 22px;background:#0a0;border:2px solid #0f0;color:#fff;border-radius:6px;font-size:15px;cursor:pointer;">
                        ▶️ Retomar
                    </button>
                    <button id="cpRestart" style="padding:10px 22px;background:#222;border:2px solid #555;color:#ccc;border-radius:6px;font-size:15px;cursor:pointer;">
                        🔄 Do início
                    </button>
                </div>
            `;

            document.body.appendChild(overlay);

            const btnResume  = document.getElementById('cpResume');
            const btnRestart = document.getElementById('cpRestart');

            btnResume.focus();

            // Navegação por teclas dentro do prompt
            const keyHandler = (e) => {
                const code = e.keyCode || e.which;
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || code === 37 || code === 39) {
                    e.preventDefault();
                    const focused = document.activeElement;
                    focused === btnResume ? btnRestart.focus() : btnResume.focus();
                }
                if (e.key === 'Enter' || code === 13) {
                    e.preventDefault();
                    document.activeElement === btnResume ? confirm(true) : confirm(false);
                }
                // Escape = do início
                if (e.key === 'Escape' || code === 27 || code === 10009) {
                    e.preventDefault();
                    confirm(false);
                }
            };

            document.addEventListener('keydown', keyHandler, true);

            const confirm = (resume) => {
                document.removeEventListener('keydown', keyHandler, true);
                overlay.remove();
                resolve(resume);
            };

            btnResume.onclick  = () => confirm(true);
            btnRestart.onclick = () => confirm(false);

            // Auto-retoma em 8s se não interagir
            const autoTimer = setTimeout(() => confirm(true), 8000);
            overlay.addEventListener('click', () => clearTimeout(autoTimer), { once: true });
            overlay.addEventListener('keydown', () => clearTimeout(autoTimer), { once: true });
        });
    },

    /**
     * Renderiza lista de "continue assistindo" em um container
     * @param {HTMLElement} container
     * @param {Function} onPlay - callback(item) ao clicar
     * @param {Function} onRemove - callback(item) opcional
     */
    renderList(container, onPlay, onRemove) {
        if (!container) return;

        const list = this.getInProgress();
        container.innerHTML = '';

        if (!list.length) {
            container.innerHTML = `
                <li style="color:#666;text-align:center;padding:40px 20px;font-size:16px;list-style:none;">
                    ▶️ Nenhum conteúdo em progresso.<br>
                    <span style="font-size:13px;color:#555;margin-top:8px;display:block;">
                        Filmes e episódios que você começou a assistir aparecem aqui.
                    </span>
                </li>`;
            return;
        }

        list.forEach(item => {
            const li = document.createElement('li');
            li.className = 'channel-item continue-item';
            li.style.position = 'relative';
            li.dataset.url = item.url;

            // Logo / placeholder
            if (item.logo) {
                const img = document.createElement('img');
                img.className = 'thumb';
                img.src = item.logo;
                img.loading = 'lazy';
                img.onerror = () => { img.remove(); li.insertBefore(makePlaceholder(), li.firstChild); };
                li.appendChild(img);
            } else {
                li.appendChild(makePlaceholder());
            }

            // Barra de progresso visual
            const bar = document.createElement('div');
            bar.style.cssText = `
                position: absolute;
                bottom: 0; left: 0;
                height: 4px;
                width: ${Math.round((item.progress || 0) * 100)}%;
                background: #0f0;
                border-radius: 0 0 0 6px;
                transition: width 0.3s;
            `;
            li.appendChild(bar);

            // Nome
            const nameEl = document.createElement('span');
            nameEl.className = 'name';
            nameEl.textContent = item.name;
            li.appendChild(nameEl);

            // Tempo salvo
            const timeEl = document.createElement('span');
            timeEl.style.cssText = 'display:block;font-size:11px;color:#0f0;margin-top:3px;';
            timeEl.textContent = `⏱ ${this._formatTime(item.positionMs)}${item.durationMs ? ' / ' + this._formatTime(item.durationMs) : ''}`;
            li.appendChild(timeEl);

            // Botão remover
            const btnRemove = document.createElement('button');
            btnRemove.textContent = '✕';
            btnRemove.title = 'Remover do histórico';
            btnRemove.style.cssText = `
                position: absolute;
                top: 6px; right: 6px;
                background: rgba(180,0,0,0.85);
                border: none; color: #fff;
                border-radius: 50%;
                width: 22px; height: 22px;
                font-size: 12px;
                cursor: pointer;
                display: none;
                line-height: 22px;
                text-align: center;
                padding: 0;
            `;
            li.appendChild(btnRemove);

            li.addEventListener('mouseenter', () => btnRemove.style.display = 'block');
            li.addEventListener('mouseleave', () => btnRemove.style.display = 'none');

            li.onclick  = () => { if (onPlay) onPlay(item); };
            btnRemove.onclick = (e) => {
                e.stopPropagation();
                this.remove(item.url);
                li.remove();
                if (onRemove) onRemove(item);
                if (!container.querySelector('.continue-item')) {
                    this.renderList(container, onPlay, onRemove);
                }
            };

            container.appendChild(li);
        });

        function makePlaceholder() {
            const d = document.createElement('div');
            d.className = 'thumb-placeholder';
            d.textContent = '▶️';
            return d;
        }
    },

    /**
     * Badge com contador de itens em progresso (para usar num botão de menu)
     * @returns {HTMLElement}
     */
    createBadge() {
        const badge = document.createElement('span');
        badge.id = 'continueBadge';
        const count = this.count();
        badge.textContent = count > 0 ? ` (${count})` : '';
        badge.style.cssText = 'color:#0f0;font-weight:bold;';

        // Atualiza quando algo muda
        document.addEventListener('xtream:continue', () => {
            const n = this.count();
            badge.textContent = n > 0 ? ` (${n})` : '';
        });

        return badge;
    },

    // ═══════════════════════════════════════════════════════════
    // EVENTOS
    // ═══════════════════════════════════════════════════════════

    _notify(action, item) {
        document.dispatchEvent(new CustomEvent('xtream:continue', {
            detail: { action, item }
        }));
    },

    // ═══════════════════════════════════════════════════════════
    // UTILITÁRIOS
    // ═══════════════════════════════════════════════════════════

    _formatTime(ms) {
        if (!ms && ms !== 0) return '--:--';
        const totalSec = Math.floor(ms / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        if (h > 0) {
            return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        }
        return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
};

// Expor globalmente
window.XtreamContinue = XtreamContinue;
console.log('▶️ XtreamContinue v1.0 carregado');
