// js/xtream-app.js
/**
 * XtreamApp v1.5
 * - Ordenação em todas as telas
 * - Restauração de estado ao voltar do player
 * - Busca global e filtros locais em categorias/canais/séries
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

    // ═══════════════════════════════════════════════════════════
    // BUSCA — estado e cache
    // ═══════════════════════════════════════════════════════════

    search: {
        globalQuery: '',
        globalType: 'all',
        globalCache: {},      // cache de todos os streams por tipo
        debounceTimers: {}
    },

    /**
     * Inicializa app
     */
    // js/xtream-app.js — Adicione na função init(), junto com os outros listeners

    async init() {
        console.log('🚀 XtreamApp v1.5 iniciando...');

        document.addEventListener('xtream:back', () => this.handleBack());
        document.addEventListener('xtream:sortChanged', (e) => this.handleSortChanged(e.detail.mode));

        // 🔍 Busca global via tecla amarela ou azul (quando não há busca local)
        document.addEventListener('xtream:openSearch', () => this.showSearch());

        // Inicializa busca
        this.initSearchInputs();

        // Mostra seletor de playlist
        XtreamPlaylistSelector.show(async (playlist) => {
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

    // ═══════════════════════════════════════════════════════════
    // BUSCA — Inicialização dos inputs
    // ═══════════════════════════════════════════════════════════

    initSearchInputs() {
        // Filtro local — categorias
        this.setupLocalSearchInput(
            'categorySearchInput', 'categorySearchClear', 'categorySearchCount',
            'categoryList', '.category-item'
        );

        // Filtro local — canais/filmes
        this.setupLocalSearchInput(
            'channelSearchInput', 'channelSearchClear', 'channelSearchCount',
            'channelList', '.channel-item'
        );

        // Filtro local — séries
        this.setupLocalSearchInput(
            'seriesSearchInput', 'seriesSearchClear', 'seriesSearchCount',
            'seriesList', '.series-item'
        );

        // Busca global
        this.setupGlobalSearchInput();

        console.log('🔍 Busca inicializada');
    },

    /**
     * Configura um input de filtro local
     */
    setupLocalSearchInput(inputId, clearId, countId, listId, itemSelector) {
        const input = document.getElementById(inputId);
        const clearBtn = document.getElementById(clearId);
        const countEl = document.getElementById(countId);

        if (!input) return;

        // Digitação
        input.addEventListener('input', () => {
            const query = input.value.trim();

            // Mostra/oculta botão limpar
            if (clearBtn) clearBtn.classList.toggle('visible', query.length > 0);

            // Debounce
            this.debounce(inputId, () => {
                this.applyLocalFilter(query, listId, itemSelector, countEl);
            }, 250);
        });

        // Botão limpar
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                input.value = '';
                if (clearBtn) clearBtn.classList.remove('visible');
                this.applyLocalFilter('', listId, itemSelector, countEl);
                input.focus();
            });
        }

        // Controle de foco
        input.addEventListener('focus', () => {
            XtreamNavigation.setSearchInputFocused(true);
            input.parentElement.classList.add('focused');
        });
        input.addEventListener('blur', () => {
            XtreamNavigation.setSearchInputFocused(false);
            input.parentElement.classList.remove('focused');
        });
    },

    /**
     * Aplica filtro local — esconde/mostra itens na lista
     */
    applyLocalFilter(query, listId, itemSelector, countEl) {
        const list = document.getElementById(listId);
        if (!list) return;

        const queryLower = query.toLowerCase();
        const items = list.querySelectorAll(itemSelector);

        let visibleCount = 0;
        let totalCount = 0;

        items.forEach(item => {
            // Pula botão voltar e "carregar todos"
            if (item.classList.contains('back-btn') || item.classList.contains('highlight')) return;

            totalCount++;
            const text = item.textContent.toLowerCase();

            if (!queryLower || text.includes(queryLower)) {
                item.style.display = '';
                visibleCount++;

                // Highlight do texto encontrado
                if (queryLower) {
                    this.highlightSearchText(item, queryLower);
                } else {
                    this.removeSearchHighlight(item);
                }
            } else {
                item.style.display = 'none';
            }
        });

        // Atualiza contador
        if (countEl) {
            countEl.textContent = queryLower ? `${visibleCount}/${totalCount}` : '';
        }

        // Mensagem "sem resultados"
        let noRes = list.querySelector('.search-no-results');
        if (visibleCount === 0 && queryLower) {
            if (!noRes) {
                noRes = document.createElement('li');
                noRes.className = 'search-no-results';
                noRes.style.cssText = 'text-align:center;padding:40px 20px;color:#555;font-size:16px;list-style:none;';
                const backBtn = list.querySelector('.back-btn');
                if (backBtn) list.insertBefore(noRes, backBtn);
                else list.appendChild(noRes);
            }
            noRes.innerHTML = `<span style="font-size:48px;display:block;margin-bottom:12px;">🔍</span>
                Nenhum resultado para "<em style="color:#888;">${this.escapeHtml(queryLower)}</em>"`;
        } else if (noRes) {
            noRes.remove();
        }

        // Reconfigura navegação com itens visíveis
        const visibleSelector = `#${listId} ${itemSelector}:not([style*="display: none"])`;
        const visibleItems = document.querySelectorAll(visibleSelector);
        if (visibleItems.length > 0) {
            XtreamNavigation.focusIndex = 0;
            XtreamNavigation.setItems(visibleSelector, 0);
        }
    },

    /**
     * Highlight de texto nos itens
     */
    highlightSearchText(element, query) {
        const nameEl = element.querySelector('.name, .series-name');
        if (!nameEl) return;

        // Salva texto original se ainda não salvou
        if (!nameEl.dataset.originalText) {
            nameEl.dataset.originalText = nameEl.textContent;
        }

        const original = nameEl.dataset.originalText;
        const lowerOriginal = original.toLowerCase();
        const idx = lowerOriginal.indexOf(query);

        if (idx >= 0) {
            const before = original.substring(0, idx);
            const match  = original.substring(idx, idx + query.length);
            const after  = original.substring(idx + query.length);
            nameEl.innerHTML =
                this.escapeHtml(before) +
                `<span class="search-highlight">${this.escapeHtml(match)}</span>` +
                this.escapeHtml(after);
        }
    },

    removeSearchHighlight(element) {
        const nameEl = element.querySelector('.name, .series-name');
        if (!nameEl || !nameEl.dataset.originalText) return;
        nameEl.textContent = nameEl.dataset.originalText;
    },

    /**
     * Limpa input de busca de uma tela
     */
    clearSearchInput(inputId, clearId, countId) {
        const input = document.getElementById(inputId);
        const clearBtn = document.getElementById(clearId);
        const countEl = document.getElementById(countId);

        if (input) input.value = '';
        if (clearBtn) clearBtn.classList.remove('visible');
        if (countEl) countEl.textContent = '';
    },

    // ═══════════════════════════════════════════════════════════
    // BUSCA GLOBAL
    // ═══════════════════════════════════════════════════════════

    setupGlobalSearchInput() {
        const input = document.getElementById('globalSearchInput');
        const clearBtn = document.getElementById('globalSearchClear');
        const countEl = document.getElementById('globalSearchCount');

        if (!input) return;

        // Digitação
        input.addEventListener('input', () => {
            const query = input.value.trim();
            this.search.globalQuery = query;
            if (clearBtn) clearBtn.classList.toggle('visible', query.length > 0);

            this.debounce('globalSearch', () => {
                this.executeGlobalSearch(query);
            }, 500);
        });

        // Limpar
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                input.value = '';
                this.search.globalQuery = '';
                clearBtn.classList.remove('visible');
                if (countEl) countEl.textContent = '';
                document.getElementById('searchResultsList').innerHTML = '';
                input.focus();
            });
        }

        // Foco
        input.addEventListener('focus', () => {
            XtreamNavigation.setSearchInputFocused(true);
            input.parentElement.classList.add('focused');
        });
        input.addEventListener('blur', () => {
            XtreamNavigation.setSearchInputFocused(false);
            input.parentElement.classList.remove('focused');
        });

        // Tabs de tipo
        const tabs = document.querySelectorAll('#searchTypeTabs .search-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.search.globalType = tab.dataset.type;
                if (this.search.globalQuery) {
                    this.executeGlobalSearch(this.search.globalQuery);
                }
            });
        });
    },

    /**
     * Executa busca global em todos os streams
     */
    async executeGlobalSearch(query) {
        const countEl = document.getElementById('globalSearchCount');
        const list = document.getElementById('searchResultsList');

        if (!query || query.length < 2) {
            if (list) list.innerHTML = '';
            if (countEl) countEl.textContent = query.length === 1 ? 'Digite mais...' : '';
            return;
        }

        if (countEl) countEl.textContent = '⏳ Buscando...';
        const queryLower = query.toLowerCase();
        let results = [];

        try {
            const type = this.search.globalType;

            if (type === 'all' || type === 'live') {
                const r = await this.searchStreams('live', queryLower);
                results = results.concat(r);
            }
            if (type === 'all' || type === 'vod') {
                const r = await this.searchStreams('vod', queryLower);
                results = results.concat(r);
            }
            if (type === 'all' || type === 'series') {
                const r = await this.searchStreams('series', queryLower);
                results = results.concat(r);
            }

            if (countEl) {
                countEl.textContent = `${results.length} resultado${results.length !== 1 ? 's' : ''}`;
            }

            this.renderGlobalSearchResults(results, query);
        } catch (err) {
            console.error('Erro na busca:', err);
            if (countEl) countEl.textContent = '❌ Erro';
        }
    },

    /**
     * Busca streams de um tipo (carrega todos se necessário)
     */
    async searchStreams(type, queryLower) {
        // Carrega cache se necessário
        if (!this.search.globalCache[type]) {
            try {
                let streams;
                if (type === 'live') {
                    streams = await XtreamClient.getLiveStreams(null);
                    streams = XtreamClient.convertLiveToM3UFormat(streams, this.state.categories.live);
                } else if (type === 'vod') {
                    streams = await XtreamClient.getVodStreams(null);
                    streams = XtreamClient.convertVodToM3UFormat(streams, this.state.categories.vod);
                } else if (type === 'series') {
                    streams = [];
                    for (const cat of this.state.categories.series) {
                        try {
                            const list = await XtreamClient.getSeriesForCategory(cat.category_id);
                            if (Array.isArray(list)) {
                                list.forEach(s => streams.push({
                                    name: s.name,
                                    logo: s.cover || '',
                                    group: cat.category_name,
                                    seriesId: s.series_id,
                                    type: 'series'
                                }));
                            }
                        } catch (e) {}
                    }
                }
                this.search.globalCache[type] = streams || [];
                console.log(`🔍 Cache ${type}: ${this.search.globalCache[type].length} itens`);
            } catch (err) {
                console.warn(`Erro cache ${type}:`, err);
                return [];
            }
        }

        // Filtra
        return this.search.globalCache[type]
            .filter(item => {
                const name = (item.name || '').toLowerCase();
                const group = (item.group || '').toLowerCase();
                return name.includes(queryLower) || group.includes(queryLower);
            })
            .map(item => ({ ...item, searchType: type }));
    },

    /**
     * Renderiza resultados da busca global
     */
    renderGlobalSearchResults(results, query) {
        const list = document.getElementById('searchResultsList');
        list.innerHTML = '';
        list.className = 'grid-list';

        if (results.length === 0) {
            list.innerHTML = `<li class="search-no-results" style="text-align:center;padding:40px;color:#555;font-size:16px;list-style:none;">
                <span style="font-size:48px;display:block;margin-bottom:12px;">🔍</span>
                Nenhum resultado para "<em style="color:#888;">${this.escapeHtml(query)}</em>"
            </li>`;
            return;
        }

        const limited = results.slice(0, 200);
        const queryLower = query.toLowerCase();
        const typeIcons = { live: '📺', vod: '🎬', series: '📺' };
        const typeLabels = { live: 'Live', vod: 'Filme', series: 'Série' };

        limited.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'channel-item';
            li.dataset.index = index;
            const icon = typeIcons[item.searchType] || '📄';

            // Thumb
            if (item.logo) {
                const img = document.createElement('img');
                img.className = 'thumb';
                img.src = item.logo;
                img.loading = 'lazy';
                img.onerror = () => { img.remove(); li.insertBefore(this.createPlaceholder(icon), li.firstChild); };
                li.appendChild(img);
            } else {
                li.appendChild(this.createPlaceholder(icon));
            }

            // Nome com highlight
            const nameSpan = document.createElement('span');
            nameSpan.className = 'name';
            const nameText = item.name || '';
            const nameLower = nameText.toLowerCase();
            const matchIdx = nameLower.indexOf(queryLower);
            if (matchIdx >= 0) {
                nameSpan.innerHTML =
                    this.escapeHtml(nameText.substring(0, matchIdx)) +
                    `<span class="search-highlight">${this.escapeHtml(nameText.substring(matchIdx, matchIdx + query.length))}</span>` +
                    this.escapeHtml(nameText.substring(matchIdx + query.length));
            } else {
                nameSpan.textContent = nameText;
            }
            li.appendChild(nameSpan);

            // Badge
            const badge = document.createElement('span');
            badge.style.cssText = 'font-size:11px;color:#555;margin-left:auto;flex-shrink:0;padding-left:8px;';
            badge.textContent = `${typeLabels[item.searchType] || ''} · ${item.group || ''}`;
            li.appendChild(badge);

            li.onclick = () => {
                if (item.searchType === 'series' && item.seriesId) {
                    this.loadSeriesEpisodes(item.seriesId, item.name);
                } else if (item.url) {
                    this.playChannel(item, index);
                }
            };
            list.appendChild(li);
        });

        if (results.length > 200) {
            const more = document.createElement('li');
            more.style.cssText = 'text-align:center;padding:20px;color:#555;font-size:14px;list-style:none;';
            more.textContent = `... e mais ${results.length - 200} resultados. Refine sua busca.`;
            list.appendChild(more);
        }

        // Botão voltar
        const backBtn = document.createElement('li');
        backBtn.className = 'channel-item back-btn';
        backBtn.textContent = '⬅️ Voltar';
        backBtn.onclick = () => this.handleBack();
        list.appendChild(backBtn);

        XtreamNavigation.setColumns(3);
        XtreamNavigation.setItems('#searchResultsList .channel-item', 0);
    },

    /**
     * Mostra tela de busca global
     */
    showSearch() {
        console.log('🔍 Tela de busca global');
        XtreamNavigation.navigateTo('search');
        this.hideAllScreens();

        const screen = document.getElementById('searchScreen');
        screen.classList.remove('hidden');

        XtreamNavigation.currentScreen = 'search';

        // Foca no input
        setTimeout(() => {
            const input = document.getElementById('globalSearchInput');
            if (input) input.focus();
        }, 200);
    },

    // ═══════════════════════════════════════════════════════════
    // CONEXÃO
    // ═══════════════════════════════════════════════════════════

    checkReturnFromPlayer() {
        try {
            const saved = localStorage.getItem('xtreamPlayerState');
            if (saved) {
                const state = JSON.parse(saved);
                if (Date.now() - state.timestamp < 30 * 60 * 1000) return state;
            }
        } catch (e) {}
        return null;
    },

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
                        if (state.focusIndex >= 0) { XtreamNavigation.focusIndex = state.focusIndex; XtreamNavigation.updateFocus(); }
                    }, 300);
                } else { this.showMainMenu(); }
                break;
            case 'series':
                this.state.currentType = 'series';
                this.state.currentCategoryId = state.categoryId;
                this.state.currentCategoryName = state.categoryName;
                await this.showSeriesList(state.categoryId, state.categoryName);
                setTimeout(() => {
                    if (state.focusIndex >= 0) { XtreamNavigation.focusIndex = state.focusIndex; XtreamNavigation.updateFocus(); }
                }, 300);
                break;
            case 'categories':
                this.showCategories(state.type || 'vod', true);
                break;
            default:
                this.showMainMenu();
        }
    },

    async connect() {
        this.showLoading('Conectando ao servidor...');
        try {
            XtreamClient.configure(this.config.host, this.config.username, this.config.password);
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

                // Limpa cache de busca ao conectar
                this.search.globalCache = {};

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
        if (screen === 'channels' && this.state.currentChannels.length) this.reorderCurrentChannels();
        else if (screen === 'series' && this.state.currentSeriesList.length) this.reorderCurrentSeries();
        else if (screen === 'categories') this.showCategories(this.state.currentType, true);
    },

    sortByName(items, mode, nameKey = 'name') {
        if (!items?.length) return items;
        const sorted = [...items];
        switch (mode) {
            case 'alphabetical':
                sorted.sort((a, b) => {
                    const nA = (a[nameKey] || a.category_name || '').toLowerCase();
                    const nB = (b[nameKey] || b.category_name || '').toLowerCase();
                    return nA.localeCompare(nB, 'pt-BR');
                });
                break;
            case 'year':
                sorted.sort((a, b) => {
                    const yA = this.extractYear(a[nameKey] || a.category_name) || 0;
                    const yB = this.extractYear(b[nameKey] || b.category_name) || 0;
                    if (yB !== yA) return yB - yA;
                    return (a[nameKey] || '').localeCompare(b[nameKey] || '', 'pt-BR');
                });
                break;
        }
        return sorted;
    },

    extractYear(name) {
        if (!name) return null;
        const match = name.match(/[\(\[]?(\d{4})[\)\]]?/);
        if (match) { const y = parseInt(match[1], 10); if (y >= 1900 && y <= 2099) return y; }
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
            { text: '🔍 Buscar', action: () => this.showSearch(), highlight: true },
            { separator: true },
            { text: `⭐ Favoritos${favCount ? ' (' + favCount + ')' : ''}`, action: () => this.showFavorites() },
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

        document.getElementById('categoryTitle').innerHTML =
            `${titles[type]} <span class="item-count">${categories.length}</span> ${this.getSortIndicatorHTML()}`;

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
                type === 'series' ? this.showSeriesList(cat.category_id, cat.category_name)
                                  : this.loadCategory(type, cat.category_id, cat.category_name);
            };
            list.appendChild(li);
        });

        const backBtn = document.createElement('li');
        backBtn.className = 'category-item back-btn';
        backBtn.textContent = '⬅️ Voltar';
        backBtn.onclick = () => this.handleBack();
        list.appendChild(backBtn);

        // Limpa busca local
        this.clearSearchInput('categorySearchInput', 'categorySearchClear', 'categorySearchCount');

        XtreamNavigation.currentScreen = 'categories';
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
        document.getElementById('seriesTitle').innerHTML =
            `📺 ${categoryName} <span class="item-count">${sorted.length}</span> ${this.getSortIndicatorHTML()}`;

        const list = document.getElementById('seriesList');
        list.innerHTML = '';
        list.className = 'grid-list';

        sorted.forEach(series => {
            const li = document.createElement('li');
            li.className = 'series-item';
            if (series.cover) {
                const img = document.createElement('img');
                img.className = 'poster'; img.src = series.cover; img.loading = 'lazy';
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

        // Limpa busca local
        this.clearSearchInput('seriesSearchInput', 'seriesSearchClear', 'seriesSearchCount');

        XtreamNavigation.currentScreen = 'series';
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
        document.getElementById('channelTitle').innerHTML =
            `${title} <span class="item-count">${sorted.length}</span> ${this.getSortIndicatorHTML()}`;

        const list = document.getElementById('channelList');
        list.innerHTML = '';
        list.className = 'grid-list';

        sorted.forEach((channel, index) => {
            const li = document.createElement('li');
            li.className = 'channel-item';
            li.dataset.index = index;
            if (channel.logo) {
                const img = document.createElement('img');
                img.className = 'thumb'; img.src = channel.logo; img.loading = 'lazy';
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

        // Limpa busca local
        this.clearSearchInput('channelSearchInput', 'channelSearchClear', 'channelSearchCount');

        XtreamNavigation.currentScreen = 'channels';
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
            } else { alert('Nenhum item'); }
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
            } else { alert('Nenhum episódio'); }
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
        this.state._lastFocusIndex = index;
        this.openPlayerOverlay(channel.url, channel.name, index);
    },

    openPlayerOverlay(url, name, index) {
        this.closePlayerOverlay();

        const backdrop = document.createElement('div');
        backdrop.id = 'playerOverlayBackdrop';
        backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000;z-index:99998;';

        const container = document.createElement('div');
        container.id = 'playerOverlayContainer';
        container.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;display:flex;flex-direction:column;';

        const titleBar = document.createElement('div');
        titleBar.id = 'playerOverlayTitleBar';
        titleBar.style.cssText = 'position:absolute;top:0;left:0;right:0;height:50px;background:linear-gradient(to bottom,rgba(0,0,0,0.9),transparent);display:flex;align-items:center;justify-content:space-between;padding:0 20px;z-index:100000;pointer-events:none;opacity:0;transition:opacity 0.3s;';
        titleBar.innerHTML = `<span id="overlayChannelTitle" style="color:#fff;font-size:16px;text-shadow:0 1px 4px #000;">▶️ ${name}</span>
            <span style="color:#aaa;font-size:13px;">BACK / ESC para fechar</span>`;

        container.addEventListener('mousemove', () => {
            titleBar.style.opacity = '1';
            clearTimeout(this._titleBarTimer);
            this._titleBarTimer = setTimeout(() => titleBar.style.opacity = '0', 3000);
        });

        const iframe = document.createElement('iframe');
        iframe.id = 'playerOverlayIframe';
        iframe.src = `player.html?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}&index=${index}&origin=overlay`;
        iframe.style.cssText = 'width:100%;height:100%;border:none;background:#000;';
        iframe.allow = 'autoplay; fullscreen';

        container.appendChild(titleBar);
        container.appendChild(iframe);
        document.body.appendChild(backdrop);
        document.body.appendChild(container);

        this._overlayMessageHandler = (event) => {
            if (event.data && event.data.type === 'close') {
                this.closePlayerOverlay();
            }
            if (event.data && event.data.type === 'request-playlist') {
                const playlist = this.state.currentChannels.map(ch => ({ url: ch.url, name: ch.name }));
                iframe.contentWindow.postMessage({ type: 'playlist-data', playlist, currentIndex: index }, '*');
            }
            if (event.data && event.data.type === 'switch-channel') {
                const delta = event.data.delta || 0;
                const channels = this.state.currentChannels;
                if (!channels || !channels.length) return;
                index = (index + delta + channels.length) % channels.length;
                const ch = channels[index];
                iframe.contentWindow.postMessage({ type: 'play-channel', url: ch.url, name: ch.name, index }, '*');
                const titleEl = document.getElementById('overlayChannelTitle');
                if (titleEl) titleEl.textContent = '📺 ' + ch.name;
            }
        };
        window.addEventListener('message', this._overlayMessageHandler);

        this._overlayKeyHandler = (e) => {
            const code = e.keyCode || e.which;
            if (document.activeElement === iframe) return;
            if (e.key === 'Escape' || code === 27 || code === 10009) {
                e.preventDefault(); e.stopPropagation();
                this.closePlayerOverlay();
            }
        };
        document.addEventListener('keydown', this._overlayKeyHandler, true);

        iframe.addEventListener('load', () => { iframe.contentWindow.focus(); });
        console.log('🖥️ Player overlay aberto:', name);
    },

    closePlayerOverlay() {
        if (this._overlayMessageHandler) { window.removeEventListener('message', this._overlayMessageHandler); this._overlayMessageHandler = null; }
        if (this._overlayKeyHandler) { document.removeEventListener('keydown', this._overlayKeyHandler, true); this._overlayKeyHandler = null; }
        clearTimeout(this._titleBarTimer);
        document.getElementById('playerOverlayBackdrop')?.remove();
        document.getElementById('playerOverlayContainer')?.remove();
        setTimeout(() => {
            const savedIdx = this.state._lastFocusIndex ?? XtreamNavigation.focusIndex;
            XtreamNavigation.focusIndex = savedIdx;
            XtreamNavigation.updateFocus();
        }, 100);
        console.log('🖥️ Player overlay fechado');
    },

    // ═══════════════════════════════════════════════════════════
    // FAVORITOS
    // ═══════════════════════════════════════════════════════════

    showFavorites() {
        if (typeof XtreamFavorites === 'undefined') { alert('Módulo não carregado.'); return; }
        console.log('⭐ Favoritos');
        XtreamNavigation.navigateTo('favorites');
        this.hideAllScreens();
        document.getElementById('favoritesScreen').classList.remove('hidden');
        document.getElementById('favoritesTitle').innerHTML = `⭐ Favoritos <span class="item-count">${XtreamFavorites.count()}</span>`;

        const list = document.getElementById('favoritesList');
        XtreamFavorites.renderList(list,
            (item) => this.playChannel(item, 0),
            () => { document.getElementById('favoritesTitle').innerHTML = `⭐ Favoritos <span class="item-count">${XtreamFavorites.count()}</span>`; }
        );

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
        if (typeof XtreamContinue === 'undefined') { alert('Módulo não carregado.'); return; }
        console.log('▶️ Continue Assistindo');
        XtreamNavigation.navigateTo('continue');
        this.hideAllScreens();
        document.getElementById('continueScreen').classList.remove('hidden');
        document.getElementById('continueTitle').innerHTML = `▶️ Continue Assistindo <span class="item-count">${XtreamContinue.count()}</span>`;

        const list = document.getElementById('continueList');
        XtreamContinue.renderList(list,
            (item) => this.playChannel(item, 0),
            () => { document.getElementById('continueTitle').innerHTML = `▶️ Continue Assistindo <span class="item-count">${XtreamContinue.count()}</span>`; }
        );

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
        // Se busca está focada, apenas sai do input
        if (XtreamNavigation.isSearchInputFocused()) {
            document.activeElement?.blur();
            return;
        }

        const prev = XtreamNavigation.goBack();
        if (!prev) { this.backToApp(); return; }

        switch (prev.screen) {
            case 'menu':       this.showMainMenu(true); break;
            case 'categories': this.showCategories(this.state.currentType, true); break;
            case 'favorites':  this.showFavorites(); break;
            case 'continue':   this.showContinue(); break;
            case 'search':     this.showSearch(); break;
            case 'series':
                this.state.currentSeriesList.length
                    ? this.renderSeriesList(this.state.currentSeriesList, this.state.currentSeriesTitle, true)
                    : this.showSeriesList(this.state.currentCategoryId, this.state.currentCategoryName, true);
                break;
            default: this.showMainMenu(true);
        }
    },

    // ═══════════════════════════════════════════════════════════
    // UTILITÁRIOS
    // ═══════════════════════════════════════════════════════════

    hideAllScreens() {
        ['mainMenu', 'categoryScreen', 'seriesScreen', 'channelScreen',
         'favoritesScreen', 'continueScreen', 'searchScreen'].forEach(id => {
            document.getElementById(id)?.classList.add('hidden');
        });
    },

    showLoading(text) {
        document.getElementById('loadingText').textContent = text;
        document.getElementById('loadingOverlay').classList.remove('hidden');
    },

    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    },

    debounce(key, fn, delay) {
        if (this.search.debounceTimers[key]) clearTimeout(this.search.debounceTimers[key]);
        this.search.debounceTimers[key] = setTimeout(fn, delay);
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

document.addEventListener('DOMContentLoaded', () => XtreamApp.init());
window.XtreamApp = XtreamApp;
console.log('✅ XtreamApp v1.5 carregado');
