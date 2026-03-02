/**
 * XtreamUI v1.5 - NAVEGAÇÃO PRÓPRIA COMPLETA
 * Não depende do NavigationModule para funcionar
 */

const XtreamUI = {
    // Configuração
    defaultConfig: {
        host: 'http://kinder5.live:80',
        username: '661282206',
        password: '318344838'
    },

    // Estado
    state: {
        view: 'closed', // 'closed', 'menu', 'categories', 'series-list'
        type: null,
        categories: [],
        lastLoadedPlaylist: null
    },

    // Navegação
    menuFocusIndex: 0,
    menuItems: [],
    overlayFocusIndex: 0,
    overlayItems: [],
    
    // Handlers
    _menuKeyHandler: null,
    _overlayKeyHandler: null,
    
    // Overlay
    overlay: null,

    /**
     * Inicializa
     */
    init() {
        this.createOverlay();
        this.setupButton();
        console.log('✅ XtreamUI v1.5 inicializado');
    },

    /**
     * Setup do botão principal
     */
    setupButton() {
        const btn = document.getElementById('btnXtream');
        if (btn) {
            btn.addEventListener('click', () => this.openMenu());
        }
    },

    /**
     * Cria overlay para categorias
     */
    createOverlay() {
        if (this.overlay) return;

        this.overlay = document.createElement('div');
        this.overlay.id = 'xtreamOverlay';
        this.overlay.style.cssText = `
            display: none;
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.98);
            z-index: 9999;
            padding: 20px;
            box-sizing: border-box;
        `;
        this.overlay.innerHTML = `
            <div style="max-width: 900px; margin: 0 auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #444;">
                    <h2 id="xtreamOverlayTitle" style="margin: 0; color: #fff;">📂 Categorias</h2>
                    <span style="color: #666; font-size: 13px;">↑↓ Navegar | OK Selecionar | BACK Voltar</span>
                </div>
                <div style="max-height: calc(100vh - 100px); overflow-y: auto;">
                    <ul id="xtreamOverlayList" style="list-style: none; padding: 0; margin: 0;"></ul>
                </div>
            </div>
        `;
        document.body.appendChild(this.overlay);
    },

    // ═══════════════════════════════════════════════════════════
    // MENU PRINCIPAL
    // ═══════════════════════════════════════════════════════════

    /**
     * Abre o menu principal
     */
    async openMenu() {
        console.log('⚡ Abrindo menu Xtream...');
        
        this.state.view = 'menu';

        // Esconde outras seções
        ['remotePlaylistSelector', 'playlistSelector'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // Mostra seção
        const section = document.getElementById('xtreamSelector');
        if (section) section.style.display = 'block';

        // Carrega conteúdo
        await this.loadMenuContent();

        // Ativa navegação própria
        this.attachMenuKeyHandler();
    },

    /**
     * Fecha menu
     */
    closeMenu() {
        console.log('🚪 Fechando menu Xtream');
        
        const section = document.getElementById('xtreamSelector');
        if (section) section.style.display = 'none';
        
        this.detachMenuKeyHandler();
        this.state.view = 'closed';

        // Retorna foco para botões principais
        const btnXtream = document.getElementById('btnXtream');
        if (btnXtream) btnXtream.focus();
    },

    /**
     * Carrega conteúdo do menu
     */
    async loadMenuContent() {
        const statusDiv = document.getElementById('xtreamStatus');
        const menuList = document.getElementById('xtreamMenuList');

        if (!menuList) return;

        // Loading
        if (statusDiv) {
            statusDiv.innerHTML = '<span style="color: #ffcc00;">🔄 Conectando...</span>';
        }
        menuList.innerHTML = '<li style="color: #888; padding: 15px;">Carregando...</li>';

        try {
            // Conecta
            XtreamClient.configure(
                this.defaultConfig.host,
                this.defaultConfig.username,
                this.defaultConfig.password
            );

            const auth = await XtreamClient.authenticate();

            if (!auth.success) {
                if (statusDiv) statusDiv.innerHTML = `<span style="color: #f44;">❌ ${auth.error}</span>`;
                menuList.innerHTML = '';
                return;
            }

            // Info do usuário
            const exp = new Date(XtreamClient.userInfo.exp_date * 1000);
            if (statusDiv) {
                statusDiv.innerHTML = `
                    <span>👤 ${XtreamClient.userInfo.username}</span> · 
                    <span style="color: #0f0;">🟢 Ativo</span> · 
                    <span>📅 ${exp.toLocaleDateString('pt-BR')}</span>
                `;
            }

            // Carrega categorias
            const [live, vod, series] = await Promise.all([
                XtreamClient.getLiveCategories().catch(() => []),
                XtreamClient.getVodCategories().catch(() => []),
                XtreamClient.getSeriesCategories().catch(() => [])
            ]);

            // Renderiza menu
            menuList.innerHTML = '';
            
            const items = [
                { text: `📺 Canais ao Vivo (${live.length})`, action: () => this.openOverlay('live', live) },
                { text: `🎬 Filmes (${vod.length})`, action: () => this.openOverlay('vod', vod) },
                { text: `📺 Séries (${series.length})`, action: () => this.openOverlay('series', series) },
                { separator: true },
                { text: '⚡ TODOS os Canais', action: () => this.loadAll('live'), highlight: true },
                { text: '⚡ TODOS os Filmes', action: () => this.loadAll('vod'), highlight: true },
                { separator: true },
                { text: '⬅️ Voltar', action: () => this.closeMenu(), back: true }
            ];

            this.menuItems = [];

            items.forEach((item, idx) => {
                if (item.separator) {
                    const sep = document.createElement('li');
                    sep.style.cssText = 'height: 1px; background: #333; margin: 10px 0; list-style: none;';
                    menuList.appendChild(sep);
                    return;
                }

                const li = document.createElement('li');
                li.className = 'xtream-menu-item';
                li.dataset.index = this.menuItems.length;
                li.textContent = item.text;
                li.style.cssText = `
                    padding: 16px 20px;
                    margin: 6px 0;
                    background: ${item.back ? '#333' : '#2a2a2a'};
                    border-radius: 8px;
                    cursor: pointer;
                    color: ${item.highlight ? '#0f0' : '#fff'};
                    font-size: 16px;
                    list-style: none;
                    transition: all 0.1s;
                `;

                li.onclick = item.action;

                this.menuItems.push({ el: li, action: item.action });
                menuList.appendChild(li);
            });

            // Foco inicial
            this.menuFocusIndex = 0;
            this.updateMenuFocus();

        } catch (err) {
            console.error(err);
            if (statusDiv) statusDiv.innerHTML = `<span style="color: #f44;">❌ ${err.message}</span>`;
        }
    },

    /**
     * Atualiza foco do menu
     */
    updateMenuFocus() {
        this.menuItems.forEach((item, idx) => {
            if (idx === this.menuFocusIndex) {
                item.el.style.outline = '3px solid #0f0';
                item.el.style.background = '#3a3a3a';
                item.el.style.transform = 'scale(1.02)';
                item.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                item.el.style.outline = 'none';
                item.el.style.background = item.el.textContent.includes('Voltar') ? '#333' : '#2a2a2a';
                item.el.style.transform = 'scale(1)';
            }
        });
    },

    /**
     * Anexa handler de teclado do menu
     */
    attachMenuKeyHandler() {
        this.detachMenuKeyHandler();

        this._menuKeyHandler = (e) => {
            // Só processa se menu estiver visível
            const section = document.getElementById('xtreamSelector');
            if (!section || section.style.display === 'none') return;
            if (this.overlay.style.display === 'block') return; // Overlay está aberto

            const key = e.key;
            const code = e.keyCode || e.which;

            console.log(`🎮 Menu key: "${key}" code: ${code}`);

            // DOWN: ArrowDown ou código 40
            if (key === 'ArrowDown' || code === 40) {
                e.preventDefault();
                e.stopPropagation();
                if (this.menuFocusIndex < this.menuItems.length - 1) {
                    this.menuFocusIndex++;
                    this.updateMenuFocus();
                }
                return false;
            }

            // UP: ArrowUp ou código 38
            if (key === 'ArrowUp' || code === 38) {
                e.preventDefault();
                e.stopPropagation();
                if (this.menuFocusIndex > 0) {
                    this.menuFocusIndex--;
                    this.updateMenuFocus();
                }
                return false;
            }

            // ENTER/OK: Enter (13), Tizen OK (65385)
            if (key === 'Enter' || code === 13 || code === 65385) {
                e.preventDefault();
                e.stopPropagation();
                const current = this.menuItems[this.menuFocusIndex];
                if (current && current.action) {
                    current.action();
                }
                return false;
            }

            // BACK: Escape, Backspace, Tizen Back (10009)
            if (key === 'Escape' || key === 'Backspace' || code === 27 || code === 8 || code === 10009) {
                e.preventDefault();
                e.stopPropagation();
                this.closeMenu();
                return false;
            }
        };

        // IMPORTANTE: capture = true para pegar antes do NavigationModule
        document.addEventListener('keydown', this._menuKeyHandler, true);
        console.log('⌨️ Menu key handler ATIVADO');
    },

    /**
     * Remove handler do menu
     */
    detachMenuKeyHandler() {
        if (this._menuKeyHandler) {
            document.removeEventListener('keydown', this._menuKeyHandler, true);
            this._menuKeyHandler = null;
            console.log('⌨️ Menu key handler removido');
        }
    },

    // ═══════════════════════════════════════════════════════════
    // OVERLAY DE CATEGORIAS
    // ═══════════════════════════════════════════════════════════

    /**
     * Abre overlay
     */
    openOverlay(type, categories) {
        console.log(`📂 Abrindo overlay: ${type} (${categories.length} categorias)`);

        this.state.view = 'categories';
        this.state.type = type;
        this.state.categories = categories;

        // Título
        const titles = { live: '📺 Canais ao Vivo', vod: '🎬 Filmes', series: '📺 Séries' };
        document.getElementById('xtreamOverlayTitle').textContent = titles[type] || 'Categorias';

        // Mostra overlay
        this.overlay.style.display = 'block';

        // Popula lista
        this.renderOverlayList(type, categories);

        // Ativa navegação
        this.attachOverlayKeyHandler();
    },

    /**
     * Renderiza lista do overlay
     */
    renderOverlayList(type, categories) {
        const list = document.getElementById('xtreamOverlayList');
        list.innerHTML = '';

        this.overlayItems = [];

        // Item "Todos"
        this.addOverlayItem(list, '⚡ Carregar TODOS', () => this.loadCategory(type, null, 'Todos'), '#ff0');

        // Categorias
        categories.forEach(cat => {
            this.addOverlayItem(list, `📁 ${cat.category_name}`, () => {
                if (type === 'series') {
                    this.loadSeriesCategory(cat.category_id, cat.category_name);
                } else {
                    this.loadCategory(type, cat.category_id, cat.category_name);
                }
            });
        });

        // Foco inicial
        this.overlayFocusIndex = 0;
        this.updateOverlayFocus();
    },

    /**
     * Adiciona item ao overlay
     */
    addOverlayItem(list, text, action, color = '#fff') {
        const li = document.createElement('li');
        li.className = 'xtream-overlay-item';
        li.dataset.index = this.overlayItems.length;
        li.textContent = text;
        li.style.cssText = `
            padding: 14px 20px;
            margin: 5px 0;
            background: #2a2a2a;
            border-radius: 6px;
            cursor: pointer;
            color: ${color};
            font-size: 15px;
            list-style: none;
            transition: all 0.1s;
        `;
        li.onclick = action;

        this.overlayItems.push({ el: li, action });
        list.appendChild(li);
    },

    /**
     * Atualiza foco do overlay
     */
    updateOverlayFocus() {
        this.overlayItems.forEach((item, idx) => {
            if (idx === this.overlayFocusIndex) {
                item.el.style.outline = '3px solid #0f0';
                item.el.style.background = '#3a3a3a';
                item.el.style.transform = 'scale(1.01)';
                item.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                item.el.style.outline = 'none';
                item.el.style.background = '#2a2a2a';
                item.el.style.transform = 'scale(1)';
            }
        });
    },

    /**
     * Fecha overlay
     */
    closeOverlay() {
        console.log('🚪 Fechando overlay');
        this.overlay.style.display = 'none';
        this.detachOverlayKeyHandler();
        this.state.view = 'menu';
        
        // Reativa navegação do menu
        this.menuFocusIndex = 0;
        this.updateMenuFocus();
    },

    /**
     * Handler de teclado do overlay
     */
    attachOverlayKeyHandler() {
        this.detachOverlayKeyHandler();

        this._overlayKeyHandler = (e) => {
            if (this.overlay.style.display !== 'block') return;

            const key = e.key;
            const code = e.keyCode || e.which;

            console.log(`🎮 Overlay key: "${key}" code: ${code}`);

            // DOWN
            if (key === 'ArrowDown' || code === 40) {
                e.preventDefault();
                e.stopPropagation();
                if (this.overlayFocusIndex < this.overlayItems.length - 1) {
                    this.overlayFocusIndex++;
                    this.updateOverlayFocus();
                }
                return false;
            }

            // UP
            if (key === 'ArrowUp' || code === 38) {
                e.preventDefault();
                e.stopPropagation();
                if (this.overlayFocusIndex > 0) {
                    this.overlayFocusIndex--;
                    this.updateOverlayFocus();
                }
                return false;
            }

            // ENTER/OK
            if (key === 'Enter' || code === 13 || code === 65385) {
                e.preventDefault();
                e.stopPropagation();
                const current = this.overlayItems[this.overlayFocusIndex];
                if (current && current.action) {
                    current.action();
                }
                return false;
            }

            // BACK
            if (key === 'Escape' || key === 'Backspace' || code === 27 || code === 8 || code === 10009) {
                e.preventDefault();
                e.stopPropagation();
                if (this.state.view === 'series-list') {
                    this.openOverlay('series', this.state.categories);
                } else {
                    this.closeOverlay();
                }
                return false;
            }
        };

        document.addEventListener('keydown', this._overlayKeyHandler, true);
        console.log('⌨️ Overlay key handler ATIVADO');
    },

    detachOverlayKeyHandler() {
        if (this._overlayKeyHandler) {
            document.removeEventListener('keydown', this._overlayKeyHandler, true);
            this._overlayKeyHandler = null;
        }
    },

    // ═══════════════════════════════════════════════════════════
    // CARREGAMENTO
    // ═══════════════════════════════════════════════════════════

    async loadCategory(type, categoryId, categoryName) {
        console.log(`🔄 Carregando ${type} - ${categoryName}`);
        this.showLoading(`Carregando ${categoryName}...`);

        try {
            let streams, cats;
            if (type === 'live') {
                cats = await XtreamClient.getLiveCategories();
                streams = await XtreamClient.getLiveStreams(categoryId);
                streams = XtreamClient.convertLiveToM3UFormat(streams, cats);
            } else {
                cats = await XtreamClient.getVodCategories();
                streams = await XtreamClient.getVodStreams(categoryId);
                streams = XtreamClient.convertVodToM3UFormat(streams, cats);
            }

            this.hideLoading();

            if (streams?.length > 0) {
                this.applyPlaylist(streams, `Xtream - ${categoryName}`);
            } else {
                alert('Nenhum item encontrado');
            }
        } catch (err) {
            this.hideLoading();
            alert(`Erro: ${err.message}`);
        }
    },

    async loadAll(type) {
        console.log(`⚡ Carregando TODOS ${type}`);
        this.showLoading('Carregando...');

        try {
            let streams, cats;
            if (type === 'live') {
                cats = await XtreamClient.getLiveCategories();
                streams = await XtreamClient.getLiveStreams(null);
                streams = XtreamClient.convertLiveToM3UFormat(streams, cats);
            } else {
                cats = await XtreamClient.getVodCategories();
                streams = await XtreamClient.getVodStreams(null);
                streams = XtreamClient.convertVodToM3UFormat(streams, cats);
            }

            this.hideLoading();

            if (streams?.length > 0) {
                const name = type === 'live' ? 'Todos os Canais' : 'Todos os Filmes';
                this.applyPlaylist(streams, `Xtream - ${name}`);
            }
        } catch (err) {
            this.hideLoading();
            alert(`Erro: ${err.message}`);
        }
    },

    async loadSeriesCategory(categoryId, categoryName) {
        console.log(`📺 Carregando séries: ${categoryName}`);
        this.showLoading('Carregando séries...');

        try {
            const seriesList = await XtreamClient.getSeriesForCategory(categoryId);
            this.hideLoading();

            if (!seriesList?.length) {
                alert('Nenhuma série encontrada');
                return;
            }

            this.state.view = 'series-list';
            document.getElementById('xtreamOverlayTitle').textContent = `📺 ${categoryName}`;

            const list = document.getElementById('xtreamOverlayList');
            list.innerHTML = '';
            this.overlayItems = [];

            seriesList.forEach(s => {
                this.addOverlayItem(list, `📺 ${s.name}`, () => this.loadSeriesEpisodes(s.series_id, s.name));
            });

            this.overlayFocusIndex = 0;
            this.updateOverlayFocus();

        } catch (err) {
            this.hideLoading();
            alert(`Erro: ${err.message}`);
        }
    },

    async loadSeriesEpisodes(seriesId, seriesName) {
        console.log(`📺 Carregando episódios: ${seriesName}`);
        this.showLoading(`Carregando "${seriesName}"...`);

        try {
            const info = await XtreamClient.getSeriesInfo(seriesId);
            const episodes = XtreamClient.convertSeriesToM3UFormat(info);
            this.hideLoading();

            if (episodes?.length > 0) {
                this.applyPlaylist(episodes, `Xtream - ${seriesName}`);
            } else {
                alert('Nenhum episódio encontrado');
            }
        } catch (err) {
            this.hideLoading();
            alert(`Erro: ${err.message}`);
        }
    },

    // ═══════════════════════════════════════════════════════════
    // APLICAR PLAYLIST
    // ═══════════════════════════════════════════════════════════

    applyPlaylist(channels, playlistName) {
        console.log(`✅ Aplicando: ${playlistName} (${channels.length})`);

        // Salva contexto
        if (typeof StateManager !== 'undefined' && StateManager.savePlaylistContext) {
            StateManager.savePlaylistContext({
                playlistName,
                playlistType: 'xtream'
            });
        }

        // Define playlist
        if (typeof AppState !== 'undefined') {
            AppState.setPlaylist(channels, playlistName);
        }

        // Fecha tudo
        this.overlay.style.display = 'none';
        this.detachOverlayKeyHandler();
        this.detachMenuKeyHandler();
        
        const section = document.getElementById('xtreamSelector');
        if (section) section.style.display = 'none';
        
        this.state.view = 'closed';

        // Atualiza canais
        if (typeof ChannelModule !== 'undefined' && ChannelModule.updateChannelList) {
            ChannelModule.updateChannelList();
        }

        // Mensagem
        const msg = document.getElementById('messageArea');
        if (msg) {
            msg.innerHTML = `<div style="color:#0f0;padding:12px;background:rgba(0,50,0,0.5);border-radius:5px;margin:10px 0;">✅ ${channels.length} itens carregados</div>`;
            setTimeout(() => { msg.innerHTML = ''; }, 4000);
        }
    },

    // ═══════════════════════════════════════════════════════════
    // UTILITÁRIOS
    // ═══════════════════════════════════════════════════════════

    showLoading(text) {
        let el = document.getElementById('xtreamLoading');
        if (!el) {
            el = document.createElement('div');
            el.id = 'xtreamLoading';
            el.style.cssText = `
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.95);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10005;
                color: #fff;
                font-size: 18px;
            `;
            document.body.appendChild(el);
        }
        el.innerHTML = `<div style="text-align:center"><div style="font-size:36px;margin-bottom:15px;">⏳</div>${text}</div>`;
        el.style.display = 'flex';
    },

    hideLoading() {
        const el = document.getElementById('xtreamLoading');
        if (el) el.style.display = 'none';
    }
};

// Init
document.addEventListener('DOMContentLoaded', () => XtreamUI.init());
window.XtreamUI = XtreamUI;
console.log('✅ XtreamUI v1.5 carregado');