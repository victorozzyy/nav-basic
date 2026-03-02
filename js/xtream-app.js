/**
 * XtreamApp v1.4
 * - Ordenação em todas as telas
 * - Restauração de estado ao voltar do player
 */

const XtreamApp = {
    // Configuração
    config: {
        host: 'http://kinder5.live:80',
        username: '661282206',
        password: '318344838'
    },

    // Estado
    state: {
        categories: { live: [], vod: [], series: [] },
        currentType: null,
        currentCategoryId: null,
        currentCategoryName: null,
        currentChannels: [],
        currentChannelsTitle: '',
        currentSeriesList: [],
        currentSeriesTitle: ''
    },

    /**
     * Inicializa app — mostra seletor de lista antes de conectar
     */
    async init() {
        console.log('🚀 XtreamApp v1.4 iniciando...');

        document.addEventListener('xtream:back', () => this.handleBack());
        document.addEventListener('xtream:sortChanged', (e) => this.handleSortChanged(e.detail.mode));

        // Mostra seletor de playlist (busca URLs do GitHub)
        XtreamPlaylistSelector.show(async (playlist) => {
            // Extrai host/user/pass da URL escolhida
            try {
                const u = new URL(playlist.url);
                this.config.host     = `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}`;
                this.config.username = u.searchParams.get('username') || '';
                this.config.password = u.searchParams.get('password') || '';
            } catch {
                this.config.host = playlist.url;
            }

            await this.connect();
            this.showMainMenu();
        });
    },

    /**
     * Verifica retorno do player
     */
    checkReturnFromPlayer() {
        try {
            const saved = localStorage.getItem('xtreamPlayerState');
            if (saved) {
                const state = JSON.parse(saved);
                if (Date.now() - state.timestamp < 30 * 60 * 1000) {
                    return state;
                }
            }
        } catch (e) {}
        return null;
    },

    /**
     * Restaura estado do player
     */
    async restoreFromPlayerState(state) {
        console.log('📂 Restaurando:', state);
        
        try { localStorage.removeItem('xtreamPlayerState'); } catch (e) {}
        
        switch (state.screen) {
            case 'channels':
                if (state.type && state.categoryId) {
                    this.state.currentType = state.type;
                    this.state.currentCategoryId = state.categoryId;
                    this.state.currentCategoryName = state.categoryName;
                    
                    await this.loadCategory(state.type, state.categoryId, state.categoryName);
                    
                    setTimeout(() => {
                        if (state.focusIndex >= 0) {
                            XtreamNavigation.focusIndex = state.focusIndex;
                            XtreamNavigation.updateFocus();
                        }
                    }, 300);
                } else {
                    this.showMainMenu();
                }
                break;
                
            case 'series':
                this.state.currentType = 'series';
                this.state.currentCategoryId = state.categoryId;
                this.state.currentCategoryName = state.categoryName;
                await this.showSeriesList(state.categoryId, state.categoryName);
                setTimeout(() => {
                    if (state.focusIndex >= 0) {
                        XtreamNavigation.focusIndex = state.focusIndex;
                        XtreamNavigation.updateFocus();
                    }
                }, 300);
                break;
                
            case 'categories':
                this.showCategories(state.type || 'vod', true);
                break;
                
            default:
                this.showMainMenu();
        }
    },

    /**
     * Conecta ao servidor
     */
    async connect() {
        this.showLoading('Conectando ao servidor...');

        try {
            XtreamClient.configure(
                this.config.host,
                this.config.username,
                this.config.password
            );

            const auth = await XtreamClient.authenticate();

            if (auth.success) {
                const exp = new Date(XtreamClient.userInfo.exp_date * 1000);
                document.getElementById('userStatus').innerHTML = 
                    `👤 ${XtreamClient.userInfo.username} · 🟢 Ativo · 📅 ${exp.toLocaleDateString('pt-BR')}`;
                document.getElementById('userStatus').classList.add('connected');

                const [live, vod, series] = await Promise.all([
                    XtreamClient.getLiveCategories().catch(() => []),
                    XtreamClient.getVodCategories().catch(() => []),
                    XtreamClient.getSeriesCategories().catch(() => [])
                ]);

                this.state.categories = { live, vod, series };
                console.log(`✅ Conectado - Live: ${live.length}, VOD: ${vod.length}, Series: ${series.length}`);
            } else {
                document.getElementById('userStatus').textContent = `❌ ${auth.error}`;
                document.getElementById('userStatus').classList.add('error');
            }
        } catch (err) {
            document.getElementById('userStatus').textContent = `❌ ${err.message}`;
            document.getElementById('userStatus').classList.add('error');
        }

        this.hideLoading();
    },

    // ═══════════════════════════════════════════════════════════
    // ORDENAÇÃO
    // ═══════════════════════════════════════════════════════════

    handleSortChanged(mode) {
        console.log('🔄 Ordenação:', mode);
        const screen = XtreamNavigation.currentScreen;
        
        if (screen === 'channels' && this.state.currentChannels.length) {
            this.reorderCurrentChannels();
        } else if (screen === 'series' && this.state.currentSeriesList.length) {
            this.reorderCurrentSeries();
        } else if (screen === 'categories') {
            this.showCategories(this.state.currentType, true);
        }
    },

    sortByName(items, mode, nameKey = 'name') {
        if (!items?.length) return items;
        const sorted = [...items];
        
        switch (mode) {
            case 'alphabetical':
                sorted.sort((a, b) => {
                    const nameA = (a[nameKey] || a.category_name || '').toLowerCase();
                    const nameB = (b[nameKey] || b.category_name || '').toLowerCase();
                    return nameA.localeCompare(nameB, 'pt-BR');
                });
                break;
            case 'year':
                sorted.sort((a, b) => {
                    const yearA = this.extractYear(a[nameKey] || a.category_name) || 0;
                    const yearB = this.extractYear(b[nameKey] || b.category_name) || 0;
                    if (yearB !== yearA) return yearB - yearA;
                    return (a[nameKey] || '').localeCompare(b[nameKey] || '', 'pt-BR');
                });
                break;
        }
        return sorted;
    },

    extractYear(name) {
        if (!name) return null;
        const match = name.match(/[\(\[]?(\d{4})[\)\]]?/);
        if (match) {
            const year = parseInt(match[1], 10);
            if (year >= 1900 && year <= 2099) return year;
        }
        return null;
    },

    reorderCurrentChannels() {
        const idx = XtreamNavigation.focusIndex;
        this.showChannels(this.state.currentChannels, this.state.currentChannelsTitle, true);
        setTimeout(() => { XtreamNavigation.focusIndex = idx; XtreamNavigation.updateFocus(); }, 100);
    },

    reorderCurrentSeries() {
        const idx = XtreamNavigation.focusIndex;
        this.renderSeriesList(this.state.currentSeriesList, this.state.currentSeriesTitle, true);
        setTimeout(() => { XtreamNavigation.focusIndex = idx; XtreamNavigation.updateFocus(); }, 100);
    },

    getSortIndicatorHTML() {
        const info = XtreamNavigation.getSortModeInfo?.() || { icon: '📋', text: 'Padrão' };
        return `<span style="background:#333;padding:5px 10px;border-radius:5px;font-size:14px;margin-left:10px;color:#0f0;">${info.icon} ${info.text}</span>`;
    },

    // ═══════════════════════════════════════════════════════════
    // TELAS
    // ═══════════════════════════════════════════════════════════

    showMainMenu(restoreFocus = false) {
        console.log('📋 Menu principal');
        this.hideAllScreens();
        document.getElementById('mainMenu').classList.remove('hidden');

        const list = document.getElementById('menuList');
        list.innerHTML = '';

        const favCount  = (typeof XtreamFavorites !== 'undefined') ? XtreamFavorites.count() : 0;
        const contCount = (typeof XtreamContinue  !== 'undefined') ? XtreamContinue.count()  : 0;

        const items = [
            { text: `📺 Canais ao Vivo (${this.state.categories.live.length})`, action: () => this.showCategories('live') },
            { text: `🎬 Filmes (${this.state.categories.vod.length})`, action: () => this.showCategories('vod') },
            { text: `📺 Séries (${this.state.categories.series.length})`, action: () => this.showCategories('series') },
            { separator: true },
            { text: `⭐ Favoritos${favCount  ? ' (' + favCount  + ')' : ''}`, action: () => this.showFavorites() },
            { text: `▶️ Continue Assistindo${contCount ? ' (' + contCount + ')' : ''}`, action: () => this.showContinue() },
            { separator: true },
            { text: '⚡ TODOS Canais', action: () => this.loadAllChannels('live'), highlight: true },
            { text: '⚡ TODOS Filmes', action: () => this.loadAllChannels('vod'), highlight: true },
            { separator: true },
            { text: '⬅️ Voltar ao App', action: () => this.backToApp(), back: true }
        ];

        items.forEach(item => {
            if (item.separator) {
                const sep = document.createElement('li');
                sep.style.cssText = 'height:1px;background:#333;margin:15px 0;';
                list.appendChild(sep);
                return;
            }
            const li = document.createElement('li');
            li.className = 'menu-item' + (item.highlight ? ' highlight' : '') + (item.back ? ' back-btn' : '');
            li.textContent = item.text;
            li.onclick = item.action;
            list.appendChild(li);
        });

        XtreamNavigation.currentScreen = 'menu';
        XtreamNavigation.history = [];
        XtreamNavigation.setColumns(1);
        XtreamNavigation.setItems('#menuList .menu-item', restoreFocus ? XtreamNavigation.getSavedFocusIndex() : 0);
    },

    showCategories(type, restoreFocus = false) {
        console.log(`📂 Categorias: ${type}`);
        this.state.currentType = type;
        if (!restoreFocus) XtreamNavigation.navigateTo('categories');

        this.hideAllScreens();
        document.getElementById('categoryScreen').classList.remove('hidden');

        const titles = { live: '📺 Canais ao Vivo', vod: '🎬 Filmes', series: '📺 Séries' };
        const categories = this.sortByName([...this.state.categories[type]], XtreamNavigation.sortMode, 'category_name');

        document.getElementById('categoryTitle').innerHTML = `${titles[type]} <span class="item-count">${categories.length}</span> ${this.getSortIndicatorHTML()}`;

        const list = document.getElementById('categoryList');
        list.innerHTML = '';
        list.className = 'grid-list';

        const allItem = document.createElement('li');
        allItem.className = 'category-item highlight';
        allItem.innerHTML = '⚡ Carregar TODOS';
        allItem.onclick = () => this.loadAllChannels(type);
        list.appendChild(allItem);

        categories.forEach(cat => {
            const li = document.createElement('li');
            li.className = 'category-item';
            li.innerHTML = `📁 ${cat.category_name}`;
            li.onclick = () => {
                this.state.currentCategoryId = cat.category_id;
                this.state.currentCategoryName = cat.category_name;
                type === 'series' ? this.showSeriesList(cat.category_id, cat.category_name) : this.loadCategory(type, cat.category_id, cat.category_name);
            };
            list.appendChild(li);
        });

        const backBtn = document.createElement('li');
        backBtn.className = 'category-item back-btn';
        backBtn.textContent = '⬅️ Voltar';
        backBtn.onclick = () => this.handleBack();
        list.appendChild(backBtn);

        XtreamNavigation.setColumns(3);
        XtreamNavigation.setItems('#categoryList .category-item', restoreFocus ? XtreamNavigation.getSavedFocusIndex() : 0);
    },

    async showSeriesList(categoryId, categoryName, restoreFocus = false) {
        console.log(`📺 Séries: ${categoryName}`);
        if (!restoreFocus) this.showLoading('Carregando séries...');

        try {
            const seriesList = await XtreamClient.getSeriesForCategory(categoryId);
            this.hideLoading();
            if (!seriesList?.length) { alert('Nenhuma série'); return; }

            this.state.currentSeriesList = [...seriesList];
            this.state.currentSeriesTitle = categoryName;
            if (!restoreFocus) XtreamNavigation.navigateTo('series');

            this.renderSeriesList(seriesList, categoryName, restoreFocus);
        } catch (err) {
            this.hideLoading();
            alert(`Erro: ${err.message}`);
        }
    },

    renderSeriesList(seriesList, categoryName, restoreFocus = false) {
        this.hideAllScreens();
        document.getElementById('seriesScreen').classList.remove('hidden');

        const sorted = this.sortByName(seriesList, XtreamNavigation.sortMode, 'name');
        document.getElementById('seriesTitle').innerHTML = `📺 ${categoryName} <span class="item-count">${sorted.length}</span> ${this.getSortIndicatorHTML()}`;

        const list = document.getElementById('seriesList');
        list.innerHTML = '';
        list.className = 'grid-list';

        sorted.forEach(series => {
            const li = document.createElement('li');
            li.className = 'series-item';

            if (series.cover) {
                const img = document.createElement('img');
                img.className = 'poster';
                img.src = series.cover;
                img.loading = 'lazy';
                img.onerror = () => { img.remove(); li.insertBefore(this.createPlaceholder('📺'), li.firstChild); };
                li.appendChild(img);
            } else {
                li.appendChild(this.createPlaceholder('📺'));
            }

            const name = document.createElement('div');
            name.className = 'series-name';
            name.textContent = series.name;
            li.appendChild(name);

            li.onclick = () => this.loadSeriesEpisodes(series.series_id, series.name);
            list.appendChild(li);
        });

        const backBtn = document.createElement('li');
        backBtn.className = 'series-item back-btn';
        backBtn.textContent = '⬅️ Voltar';
        backBtn.onclick = () => this.handleBack();
        list.appendChild(backBtn);

        XtreamNavigation.setColumns(3);
        XtreamNavigation.setItems('#seriesList .series-item', restoreFocus ? XtreamNavigation.getSavedFocusIndex() : 0);
    },

    showChannels(channels, title, restoreFocus = false) {
        console.log(`📺 ${channels.length} canais`);

        if (!restoreFocus) {
            this.state.currentChannels = [...channels];
            this.state.currentChannelsTitle = title;
            XtreamNavigation.navigateTo('channels');
        }

        const sorted = this.sortByName(restoreFocus ? channels : this.state.currentChannels, XtreamNavigation.sortMode);

        this.hideAllScreens();
        document.getElementById('channelScreen').classList.remove('hidden');
        document.getElementById('channelTitle').innerHTML = `${title} <span class="item-count">${sorted.length}</span> ${this.getSortIndicatorHTML()}`;

        const list = document.getElementById('channelList');
        list.innerHTML = '';
        list.className = 'grid-list';

        sorted.forEach((channel, index) => {
            const li = document.createElement('li');
            li.className = 'channel-item';
            li.dataset.index = index;

            if (channel.logo) {
                const img = document.createElement('img');
                img.className = 'thumb';
                img.src = channel.logo;
                img.loading = 'lazy';
                img.onerror = () => { img.remove(); li.insertBefore(this.createPlaceholder('🎬'), li.firstChild); };
                li.appendChild(img);
            } else {
                li.appendChild(this.createPlaceholder('🎬'));
            }

            const name = document.createElement('span');
            name.className = 'name';
            name.textContent = channel.name;
            li.appendChild(name);

            li.onclick = () => this.playChannel(channel, index);
            list.appendChild(li);
        });

        const backBtn = document.createElement('li');
        backBtn.className = 'channel-item back-btn';
        backBtn.textContent = '⬅️ Voltar';
        backBtn.onclick = () => this.handleBack();
        list.appendChild(backBtn);

        XtreamNavigation.setColumns(3);
        XtreamNavigation.setItems('#channelList .channel-item', restoreFocus ? XtreamNavigation.getSavedFocusIndex() : 0);
    },

    createPlaceholder(emoji) {
        const div = document.createElement('div');
        div.className = 'thumb-placeholder';
        div.textContent = emoji;
        return div;
    },

    // ═══════════════════════════════════════════════════════════
    // CARREGAMENTO
    // ═══════════════════════════════════════════════════════════

    async loadCategory(type, categoryId, categoryName) {
        console.log(`🔄 ${type}: ${categoryName}`);
        this.showLoading(`Carregando ${categoryName}...`);

        try {
            let streams;
            if (type === 'live') {
                streams = await XtreamClient.getLiveStreams(categoryId);
                streams = XtreamClient.convertLiveToM3UFormat(streams, this.state.categories.live);
            } else {
                streams = await XtreamClient.getVodStreams(categoryId);
                streams = XtreamClient.convertVodToM3UFormat(streams, this.state.categories.vod);
            }
            this.hideLoading();
            if (streams?.length) {
                this.showChannels(streams, `${type === 'live' ? '📺' : '🎬'} ${categoryName}`);
            } else {
                alert('Nenhum item');
            }
        } catch (err) {
            this.hideLoading();
            alert(`Erro: ${err.message}`);
        }
    },

    async loadAllChannels(type) {
        console.log(`⚡ TODOS: ${type}`);
        this.showLoading('Carregando...');

        try {
            let streams;
            if (type === 'live') {
                streams = await XtreamClient.getLiveStreams(null);
                streams = XtreamClient.convertLiveToM3UFormat(streams, this.state.categories.live);
            } else {
                streams = await XtreamClient.getVodStreams(null);
                streams = XtreamClient.convertVodToM3UFormat(streams, this.state.categories.vod);
            }
            this.hideLoading();
            if (streams?.length) {
                this.showChannels(streams, type === 'live' ? '📺 Todos os Canais' : '🎬 Todos os Filmes');
            }
        } catch (err) {
            this.hideLoading();
            alert(`Erro: ${err.message}`);
        }
    },

    async loadSeriesEpisodes(seriesId, seriesName) {
        console.log(`📺 Episódios: ${seriesName}`);
        this.showLoading(`"${seriesName}"...`);

        try {
            const info = await XtreamClient.getSeriesInfo(seriesId);
            const episodes = XtreamClient.convertSeriesToM3UFormat(info);
            this.hideLoading();
            if (episodes?.length) {
                this.showChannels(episodes, `📺 ${seriesName}`);
            } else {
                alert('Nenhum episódio');
            }
        } catch (err) {
            this.hideLoading();
            alert(`Erro: ${err.message}`);
        }
    },

    // ═══════════════════════════════════════════════════════════
    // AÇÕES
    // ═══════════════════════════════════════════════════════════

    playChannel(channel, index) {
        console.log(`▶️ ${channel.name}`);

        // Salva índice para restaurar foco ao fechar
        this.state._lastFocusIndex = index;

        // Abre player como overlay (iframe) sem sair da página
        this.openPlayerOverlay(channel.url, channel.name, index);
    },

    /**
     * Abre o player em overlay sobre a tela atual
     */
    openPlayerOverlay(url, name, index) {
        // Remove overlay anterior se existir
        this.closePlayerOverlay();

        // Overlay escuro de fundo
        const backdrop = document.createElement('div');
        backdrop.id = 'playerOverlayBackdrop';
        backdrop.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            background: #000;
            z-index: 99998;
        `;

        // Container do iframe
        const container = document.createElement('div');
        container.id = 'playerOverlayContainer';
        container.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            z-index: 99999;
            display: flex;
            flex-direction: column;
        `;

        // Barra de título com botão fechar
        const titleBar = document.createElement('div');
        titleBar.id = 'playerOverlayTitleBar';
        titleBar.style.cssText = `
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 50px;
            background: linear-gradient(to bottom, rgba(0,0,0,0.9), transparent);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
            z-index: 100000;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s;
        `;
        titleBar.innerHTML = `
            <span id="overlayChannelTitle" style="color:#fff;font-size:16px;text-shadow:0 1px 4px #000;">▶️ ${name}</span>
            <span style="color:#aaa;font-size:13px;">BACK / ESC para fechar</span>
        `;

        // Mostra barra ao mover mouse, esconde depois
        container.addEventListener('mousemove', () => {
            titleBar.style.opacity = '1';
            clearTimeout(this._titleBarTimer);
            this._titleBarTimer = setTimeout(() => titleBar.style.opacity = '0', 3000);
        });

        // Iframe do player
        const iframe = document.createElement('iframe');
        iframe.id = 'playerOverlayIframe';
        iframe.src = `player.html?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}&index=${index}&origin=overlay`;
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            background: #000;
        `;
        iframe.allow = 'autoplay; fullscreen';

        container.appendChild(titleBar);
        container.appendChild(iframe);
        document.body.appendChild(backdrop);
        document.body.appendChild(container);

        // Escuta mensagem de fechamento vinda do iframe
        this._overlayMessageHandler = (event) => {
            if (event.data && event.data.type === 'close') {
                console.log('📤 Player overlay solicitou fechamento');
                this.closePlayerOverlay();
            }
            // Repassa pedido de playlist para o iframe
            if (event.data && event.data.type === 'request-playlist') {
                const playlist = this.state.currentChannels.map(ch => ({
                    url: ch.url,
                    name: ch.name
                }));
                iframe.contentWindow.postMessage({
                    type: 'playlist-data',
                    playlist: playlist,
                    currentIndex: index
                }, '*');
            }
            // 🔼🔽 Troca de canal via setas ↑↓ do controle remoto
            if (event.data && event.data.type === 'switch-channel') {
                const delta = event.data.delta || 0;
                const channels = this.state.currentChannels;
                if (!channels || !channels.length) return;
                index = (index + delta + channels.length) % channels.length;
                const ch = channels[index];
                console.log(`🔄 switch-channel(${delta}) → [${index}] ${ch.name}`);
                iframe.contentWindow.postMessage({
                    type: 'play-channel',
                    url: ch.url,
                    name: ch.name,
                    index: index
                }, '*');
                // Atualiza título da titleBar
                const titleEl = document.getElementById('overlayChannelTitle');
                if (titleEl) titleEl.textContent = '📺 ' + ch.name;
            }
        };
        window.addEventListener('message', this._overlayMessageHandler);

        // Tecla Escape/Back no contexto da página principal também fecha
        this._overlayKeyHandler = (e) => {
            const code = e.keyCode || e.which;
            // Só fecha se o foco não estiver dentro do iframe
            if (document.activeElement === iframe) return;
            if (e.key === 'Escape' || code === 27 || code === 10009) {
                e.preventDefault();
                e.stopPropagation();
                this.closePlayerOverlay();
            }
        };
        document.addEventListener('keydown', this._overlayKeyHandler, true);

        // Foca o iframe para que o player receba teclas
        iframe.addEventListener('load', () => {
            iframe.contentWindow.focus();
        });

        console.log('🖥️ Player overlay aberto:', name);
    },

    /**
     * Fecha o overlay do player e restaura foco na lista
     */
    closePlayerOverlay() {
        // Remove handlers
        if (this._overlayMessageHandler) {
            window.removeEventListener('message', this._overlayMessageHandler);
            this._overlayMessageHandler = null;
        }
        if (this._overlayKeyHandler) {
            document.removeEventListener('keydown', this._overlayKeyHandler, true);
            this._overlayKeyHandler = null;
        }
        clearTimeout(this._titleBarTimer);

        // Remove elementos do DOM
        const backdrop = document.getElementById('playerOverlayBackdrop');
        const container = document.getElementById('playerOverlayContainer');
        if (backdrop) backdrop.remove();
        if (container) container.remove();

        // Restaura foco na lista de canais
        setTimeout(() => {
            const savedIdx = this.state._lastFocusIndex ?? XtreamNavigation.focusIndex;
            XtreamNavigation.focusIndex = savedIdx;
            XtreamNavigation.updateFocus();
        }, 100);

        console.log('🖥️ Player overlay fechado – tela anterior restaurada');
    },

    // ═══════════════════════════════════════════════════════════
    // FAVORITOS
    // ═══════════════════════════════════════════════════════════

    showFavorites() {
        if (typeof XtreamFavorites === 'undefined') {
            alert('Módulo de favoritos não carregado.');
            return;
        }
        console.log('⭐ Tela de Favoritos');
        XtreamNavigation.navigateTo('favorites');
        this.hideAllScreens();

        const screen = document.getElementById('favoritesScreen');
        screen.classList.remove('hidden');
        document.getElementById('favoritesTitle').innerHTML =
            `⭐ Favoritos <span class="item-count">${XtreamFavorites.count()}</span>`;

        const list = document.getElementById('favoritesList');

        XtreamFavorites.renderList(
            list,
            (item) => this.playChannel(item, 0),   // onPlay
            ()     => {                             // onRemove: atualiza contador no título
                document.getElementById('favoritesTitle').innerHTML =
                    `⭐ Favoritos <span class="item-count">${XtreamFavorites.count()}</span>`;
            }
        );

        // Botão voltar
        const backBtn = document.createElement('li');
        backBtn.className = 'channel-item back-btn';
        backBtn.textContent = '⬅️ Voltar';
        backBtn.onclick = () => this.handleBack();
        list.appendChild(backBtn);

        XtreamNavigation.setColumns(3);
        XtreamNavigation.setItems('#favoritesList .channel-item', 0);
    },

    // ═══════════════════════════════════════════════════════════
    // CONTINUE ASSISTINDO
    // ═══════════════════════════════════════════════════════════

    showContinue() {
        if (typeof XtreamContinue === 'undefined') {
            alert('Módulo de continue assistindo não carregado.');
            return;
        }
        console.log('▶️ Tela de Continue Assistindo');
        XtreamNavigation.navigateTo('continue');
        this.hideAllScreens();

        const screen = document.getElementById('continueScreen');
        screen.classList.remove('hidden');
        document.getElementById('continueTitle').innerHTML =
            `▶️ Continue Assistindo <span class="item-count">${XtreamContinue.count()}</span>`;

        const list = document.getElementById('continueList');

        XtreamContinue.renderList(
            list,
            (item) => this.playChannel(item, 0),   // onPlay
            ()     => {                             // onRemove: atualiza contador
                document.getElementById('continueTitle').innerHTML =
                    `▶️ Continue Assistindo <span class="item-count">${XtreamContinue.count()}</span>`;
            }
        );

        // Botão voltar
        const backBtn = document.createElement('li');
        backBtn.className = 'channel-item back-btn';
        backBtn.textContent = '⬅️ Voltar';
        backBtn.onclick = () => this.handleBack();
        list.appendChild(backBtn);

        XtreamNavigation.setColumns(3);
        XtreamNavigation.setItems('#continueList .channel-item', 0);
    },

    backToApp() {
        window.location.href = 'index.html';
    },

    handleBack() {
        const prev = XtreamNavigation.goBack();
        if (!prev) { this.backToApp(); return; }

        switch (prev.screen) {
            case 'menu':       this.showMainMenu(true); break;
            case 'categories': this.showCategories(this.state.currentType, true); break;
            case 'favorites':  this.showFavorites(); break;
            case 'continue':   this.showContinue(); break;
            case 'series':
                this.state.currentSeriesList.length ?
                    this.renderSeriesList(this.state.currentSeriesList, this.state.currentSeriesTitle, true) :
                    this.showSeriesList(this.state.currentCategoryId, this.state.currentCategoryName, true);
                break;
            default: this.showMainMenu(true);
        }
    },

    // ═══════════════════════════════════════════════════════════
    // UTILITÁRIOS
    // ═══════════════════════════════════════════════════════════

    hideAllScreens() {
        ['mainMenu', 'categoryScreen', 'seriesScreen', 'channelScreen', 'favoritesScreen', 'continueScreen'].forEach(id => {
            document.getElementById(id)?.classList.add('hidden');
        });
    },

    showLoading(text) {
        document.getElementById('loadingText').textContent = text;
        document.getElementById('loadingOverlay').classList.remove('hidden');
    },

    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }
};

document.addEventListener('DOMContentLoaded', () => XtreamApp.init());
window.XtreamApp = XtreamApp;
console.log('✅ XtreamApp v1.4 carregado');