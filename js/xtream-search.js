// js/xtream-search.js
/**
 * XtreamSearch v1.0
 * - Busca global (todos os tipos) e busca local (dentro de categoria)
 * - Compatível com controle remoto Tizen
 * - Integra com XtreamNavigation
 * - Debounce de digitação
 * - Highlight dos termos encontrados
 */

const XtreamSearch = {

    // ═══════════════════════════════════════════════════════════
    // ESTADO
    // ═══════════════════════════════════════════════════════════

    // Busca global
    globalQuery: '',
    globalType: 'all',         // 'all', 'live', 'vod', 'series'
    globalResults: [],
    globalCache: {},           // cache de streams já carregados

    // Busca local (dentro de categoria/canais/séries)
    localFilters: {
        category: { query: '', originalItems: [] },
        channel:  { query: '', originalItems: [] },
        series:   { query: '', originalItems: [] }
    },

    // Debounce
    _debounceTimers: {},

    // Estado de foco
    _inputFocused: false,

    // ═══════════════════════════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════════════════════════

    init() {
        this.setupLocalSearch('category', 'categorySearchInput', 'categorySearchClear', 'categorySearchCount');
        this.setupLocalSearch('channel',  'channelSearchInput',  'channelSearchClear',  'channelSearchCount');
        this.setupLocalSearch('series',   'seriesSearchInput',   'seriesSearchClear',   'seriesSearchCount');
        this.setupGlobalSearch();

        console.log('🔍 XtreamSearch v1.0 inicializado');
    },

    // ═══════════════════════════════════════════════════════════
    // BUSCA LOCAL (filtro dentro de tela)
    // ═══════════════════════════════════════════════════════════

    setupLocalSearch(type, inputId, clearId, countId) {
        const input = document.getElementById(inputId);
        const clearBtn = document.getElementById(clearId);
        const countEl = document.getElementById(countId);

        if (!input) return;

        // Digitar
        input.addEventListener('input', () => {
            const query = input.value.trim();
            this.localFilters[type].query = query;

            // Mostra/oculta botão limpar
            if (clearBtn) {
                clearBtn.classList.toggle('visible', query.length > 0);
            }

            // Debounce
            this.debounce(`local_${type}`, () => {
                this.applyLocalFilter(type, countEl);
            }, 300);
        });

        // Limpar
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                input.value = '';
                this.localFilters[type].query = '';
                clearBtn.classList.remove('visible');
                this.applyLocalFilter(type, countEl);
                input.focus();
            });
        }

        // Foco — sinaliza que o input está ativo
        input.addEventListener('focus', () => {
            this._inputFocused = true;
            input.parentElement.classList.add('focused');
        });

        input.addEventListener('blur', () => {
            this._inputFocused = false;
            input.parentElement.classList.remove('focused');
        });

        // Enter no input → sai do input e foca nos resultados
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.keyCode === 13) {
                e.preventDefault();
                input.blur();
                // Foca no primeiro item da lista
                this.focusFirstResult(type);
            }
            // Escape/Back → limpa busca se tiver texto, senão sai
            if (e.key === 'Escape' || e.keyCode === 27 || e.keyCode === 10009) {
                e.preventDefault();
                if (input.value.length > 0) {
                    input.value = '';
                    this.localFilters[type].query = '';
                    if (clearBtn) clearBtn.classList.remove('visible');
                    this.applyLocalFilter(type, countEl);
                } else {
                    input.blur();
                }
            }
            // Seta para baixo → sai do input e foca nos resultados
            if (e.key === 'ArrowDown' || e.keyCode === 40) {
                e.preventDefault();
                input.blur();
                this.focusFirstResult(type);
            }
        });
    },

    /**
     * Salva os itens originais de uma lista (antes de filtrar)
     */
    saveOriginalItems(type, items) {
        this.localFilters[type].originalItems = [...items];
        this.localFilters[type].query = '';

        // Limpa input correspondente
        const inputIds = {
            category: 'categorySearchInput',
            channel:  'channelSearchInput',
            series:   'seriesSearchInput'
        };
        const input = document.getElementById(inputIds[type]);
        if (input) input.value = '';

        const clearIds = {
            category: 'categorySearchClear',
            channel:  'channelSearchClear',
            series:   'seriesSearchClear'
        };
        const clearBtn = document.getElementById(clearIds[type]);
        if (clearBtn) clearBtn.classList.remove('visible');

        const countIds = {
            category: 'categorySearchCount',
            channel:  'channelSearchCount',
            series:   'seriesSearchCount'
        };
        const countEl = document.getElementById(countIds[type]);
        if (countEl) countEl.textContent = '';
    },

    /**
     * Aplica filtro local na lista visível
     */
    applyLocalFilter(type, countEl) {
        const query = this.localFilters[type].query.toLowerCase();
        const listIds = {
            category: 'categoryList',
            channel:  'channelList',
            series:   'seriesList'
        };
        const list = document.getElementById(listIds[type]);
        if (!list) return;

        const itemSelectors = {
            category: '.category-item',
            channel:  '.channel-item',
            series:   '.series-item'
        };
        const items = list.querySelectorAll(itemSelectors[type]);

        let visibleCount = 0;
        let totalCount = 0;

        items.forEach(item => {
            // Pula botão voltar
            if (item.classList.contains('back-btn')) return;
            // Pula item "carregar todos"
            if (item.classList.contains('highlight')) return;

            totalCount++;
            const text = item.textContent.toLowerCase();

            if (!query || text.includes(query)) {
                item.style.display = '';
                visibleCount++;

                // Highlight do texto encontrado
                if (query && type !== 'category') {
                    this.highlightText(item, query);
                }
            } else {
                item.style.display = 'none';
            }
        });

        // Atualiza contador
        if (countEl) {
            if (query) {
                countEl.textContent = `${visibleCount}/${totalCount}`;
            } else {
                countEl.textContent = '';
            }
        }

        // Mostra mensagem "sem resultados"
        let noResults = list.querySelector('.no-results');
        if (visibleCount === 0 && query) {
            if (!noResults) {
                noResults = document.createElement('li');
                noResults.className = 'no-results';
                // Insere antes do botão voltar
                const backBtn = list.querySelector('.back-btn');
                if (backBtn) {
                    list.insertBefore(noResults, backBtn);
                } else {
                    list.appendChild(noResults);
                }
            }
            noResults.innerHTML = `
                <span class="no-results-icon">🔍</span>
                Nenhum resultado para "<span class="no-results-query">${this.escapeHtml(query)}</span>"
            `;
        } else if (noResults) {
            noResults.remove();
        }

        // Reconfigura navegação com itens visíveis
        this.refreshNavigation(type);
    },

    /**
     * Highlight do texto buscado dentro de um elemento
     */
    highlightText(element, query) {
        // Encontra o elemento de nome/texto
        const nameEl = element.querySelector('.name, .series-name, .ps-name');
        if (!nameEl) return;

        const originalText = nameEl.textContent;
        const lowerText = originalText.toLowerCase();
        const idx = lowerText.indexOf(query);

        if (idx >= 0) {
            const before = originalText.substring(0, idx);
            const match  = originalText.substring(idx, idx + query.length);
            const after  = originalText.substring(idx + query.length);
            nameEl.innerHTML = `${this.escapeHtml(before)}<span class="search-highlight">${this.escapeHtml(match)}</span>${this.escapeHtml(after)}`;
        } else {
            nameEl.textContent = originalText;
        }
    },

    /**
     * Remove highlights
     */
    removeHighlights(element) {
        const nameEl = element.querySelector('.name, .series-name');
        if (!nameEl) return;
        const highlights = nameEl.querySelectorAll('.search-highlight');
        highlights.forEach(h => {
            h.replaceWith(document.createTextNode(h.textContent));
        });
    },

    /**
     * Foca no primeiro resultado visível após filtro
     */
    focusFirstResult(type) {
        const listIds = {
            category: 'categoryList',
            channel:  'channelList',
            series:   'seriesList'
        };
        const itemSelectors = {
            category: '.category-item',
            channel:  '.channel-item',
            series:   '.series-item'
        };

        const list = document.getElementById(listIds[type]);
        if (!list) return;

        const visibleItems = Array.from(list.querySelectorAll(itemSelectors[type]))
            .filter(item => item.style.display !== 'none');

        if (visibleItems.length > 0) {
            // Reconfigura navegação e foca no primeiro
            XtreamNavigation.setItems(
                `#${listIds[type]} ${itemSelectors[type]}:not([style*="display: none"])`,
                0
            );
        }
    },

    /**
     * Reconfigura a navegação após filtrar itens
     */
    refreshNavigation(type) {
        const listIds = {
            category: 'categoryList',
            channel:  'channelList',
            series:   'seriesList'
        };
        const itemSelectors = {
            category: '.category-item',
            channel:  '.channel-item',
            series:   '.series-item'
        };

        const listId = listIds[type];
        const selector = itemSelectors[type];

        // Filtra apenas itens visíveis
        const visibleSelector = `#${listId} ${selector}:not([style*="display: none"])`;
        const visibleItems = document.querySelectorAll(visibleSelector);

        if (visibleItems.length > 0) {
            XtreamNavigation.focusIndex = 0;
            XtreamNavigation.setItems(visibleSelector, 0);
        }
    },

    // ═══════════════════════════════════════════════════════════
    // BUSCA GLOBAL (tela dedicada)
    // ═══════════════════════════════════════════════════════════

    setupGlobalSearch() {
        const input = document.getElementById('globalSearchInput');
        const clearBtn = document.getElementById('globalSearchClear');
        const countEl = document.getElementById('globalSearchCount');

        if (!input) return;

        // Digitar
        input.addEventListener('input', () => {
            const query = input.value.trim();
            this.globalQuery = query;

            if (clearBtn) clearBtn.classList.toggle('visible', query.length > 0);

            this.debounce('global', () => {
                this.executeGlobalSearch(query);
            }, 500);
        });

        // Limpar
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                input.value = '';
                this.globalQuery = '';
                clearBtn.classList.remove('visible');
                if (countEl) countEl.textContent = '';
                document.getElementById('searchResultsList').innerHTML = '';
                input.focus();
            });
        }

        // Foco
        input.addEventListener('focus', () => {
            this._inputFocused = true;
            input.parentElement.classList.add('focused');
        });
        input.addEventListener('blur', () => {
            this._inputFocused = false;
            input.parentElement.classList.remove('focused');
        });

        // Teclas no input
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.keyCode === 13) {
                e.preventDefault();
                this.executeGlobalSearch(input.value.trim());
                input.blur();
                // Foca no primeiro resultado
                setTimeout(() => {
                    const items = document.querySelectorAll('#searchResultsList .channel-item');
                    if (items.length > 0) {
                        XtreamNavigation.setItems('#searchResultsList .channel-item', 0);
                    }
                }, 100);
            }
            if (e.key === 'Escape' || e.keyCode === 27 || e.keyCode === 10009) {
                e.preventDefault();
                if (input.value.length > 0) {
                    input.value = '';
                    this.globalQuery = '';
                    if (clearBtn) clearBtn.classList.remove('visible');
                    if (countEl) countEl.textContent = '';
                    document.getElementById('searchResultsList').innerHTML = '';
                } else {
                    input.blur();
                    // Voltar
                    if (typeof XtreamApp !== 'undefined') {
                        XtreamApp.handleBack();
                    }
                }
            }
            if (e.key === 'ArrowDown' || e.keyCode === 40) {
                e.preventDefault();
                input.blur();
                const items = document.querySelectorAll('#searchResultsList .channel-item');
                if (items.length > 0) {
                    XtreamNavigation.setItems('#searchResultsList .channel-item', 0);
                }
            }
        });

        // Tabs de tipo
        this.setupSearchTabs();
    },

    setupSearchTabs() {
        const tabs = document.querySelectorAll('#searchTypeTabs .search-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.globalType = tab.dataset.type;

                // Re-busca
                if (this.globalQuery) {
                    this.executeGlobalSearch(this.globalQuery);
                }
            });
        });
    },

    /**
     * Executa busca global em todas as categorias
     */
    async executeGlobalSearch(query) {
        if (!query || query.length < 2) {
            document.getElementById('searchResultsList').innerHTML = '';
            document.getElementById('globalSearchCount').textContent = '';
            return;
        }

        const countEl = document.getElementById('globalSearchCount');
        const list = document.getElementById('searchResultsList');
        countEl.textContent = '⏳';

        const queryLower = query.toLowerCase();
        let results = [];

        try {
            // Busca em streams já carregados (cache)
            if (this.globalType === 'all' || this.globalType === 'live') {
                const liveResults = await this.searchInType('live', queryLower);
                results = results.concat(liveResults);
            }
            if (this.globalType === 'all' || this.globalType === 'vod') {
                const vodResults = await this.searchInType('vod', queryLower);
                results = results.concat(vodResults);
            }
            if (this.globalType === 'all' || this.globalType === 'series') {
                const seriesResults = await this.searchInType('series', queryLower);
                results = results.concat(seriesResults);
            }

            this.globalResults = results;
            countEl.textContent = `${results.length} resultado${results.length !== 1 ? 's' : ''}`;

            this.renderGlobalResults(results, query);
        } catch (err) {
            console.error('Erro na busca:', err);
            countEl.textContent = '❌ Erro';
        }
    },

    /**
     * Busca em um tipo específico (carrega todos os streams se necessário)
     */
    async searchInType(type, queryLower) {
        // Usa cache se disponível
        if (!this.globalCache[type]) {
            try {
                if (typeof XtreamClient === 'undefined') return [];

                let streams;
                if (type === 'live') {
                    streams = await XtreamClient.getLiveStreams(null);
                    streams = XtreamClient.convertLiveToM3UFormat(
                        streams,
                        XtreamApp.state.categories.live
                    );
                } else if (type === 'vod') {
                    streams = await XtreamClient.getVodStreams(null);
                    streams = XtreamClient.convertVodToM3UFormat(
                        streams,
                        XtreamApp.state.categories.vod
                    );
                } else if (type === 'series') {
                    // Séries: busca na lista de séries (não episódios)
                    streams = [];
                    for (const cat of XtreamApp.state.categories.series) {
                        try {
                            const seriesList = await XtreamClient.getSeriesForCategory(cat.category_id);
                            if (Array.isArray(seriesList)) {
                                seriesList.forEach(s => {
                                    streams.push({
                                        name: s.name,
                                        logo: s.cover || '',
                                        group: cat.category_name,
                                        seriesId: s.series_id,
                                        type: 'series'
                                    });
                                });
                            }
                        } catch (e) {}
                    }
                }

                this.globalCache[type] = streams || [];
                console.log(`🔍 Cache ${type}: ${this.globalCache[type].length} itens`);
            } catch (err) {
                console.warn(`Erro ao buscar ${type}:`, err);
                return [];
            }
        }

        // Filtra pelo query
        return this.globalCache[type].filter(item => {
            const name = (item.name || '').toLowerCase();
            const group = (item.group || '').toLowerCase();
            return name.includes(queryLower) || group.includes(queryLower);
        }).map(item => ({
            ...item,
            searchType: type
        }));
    },

    /**
     * Renderiza resultados da busca global
     */
    renderGlobalResults(results, query) {
        const list = document.getElementById('searchResultsList');
        list.innerHTML = '';
        list.className = 'grid-list';

        if (results.length === 0) {
            list.innerHTML = `
                <li class="no-results">
                    <span class="no-results-icon">🔍</span>
                    Nenhum resultado para "<span class="no-results-query">${this.escapeHtml(query)}</span>"
                </li>
            `;
            return;
        }

        // Limita a 200 resultados para performance
        const limited = results.slice(0, 200);
        const queryLower = query.toLowerCase();

        limited.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'channel-item';
            li.dataset.index = index;

            // Badge de tipo
            const typeIcons = { live: '📺', vod: '🎬', series: '📺' };
            const typeLabels = { live: 'Live', vod: 'Filme', series: 'Série' };
            const typeIcon = typeIcons[item.searchType] || '📄';

            if (item.logo) {
                const img = document.createElement('img');
                img.className = 'thumb';
                img.src = item.logo;
                img.loading = 'lazy';
                img.onerror = () => {
                    img.remove();
                    const ph = document.createElement('div');
                    ph.className = 'thumb-placeholder';
                    ph.textContent = typeIcon;
                    li.insertBefore(ph, li.firstChild);
                };
                li.appendChild(img);
            } else {
                const ph = document.createElement('div');
                ph.className = 'thumb-placeholder';
                ph.textContent = typeIcon;
                li.appendChild(ph);
            }

            const nameSpan = document.createElement('span');
            nameSpan.className = 'name';
            // Highlight
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

            // Badge tipo + grupo
            const badge = document.createElement('span');
            badge.style.cssText = 'font-size:11px;color:#555;margin-left:auto;flex-shrink:0;';
            badge.textContent = `${typeLabels[item.searchType] || ''} · ${item.group || ''}`;
            li.appendChild(badge);

            li.onclick = () => {
                if (item.searchType === 'series' && item.seriesId) {
                    XtreamApp.loadSeriesEpisodes(item.seriesId, item.name);
                } else if (item.url) {
                    XtreamApp.playChannel(item, index);
                }
            };

            list.appendChild(li);
        });

        // Mostra quantos resultados ocultos
        if (results.length > 200) {
            const more = document.createElement('li');
            more.className = 'no-results';
            more.textContent = `... e mais ${results.length - 200} resultados. Refine sua busca.`;
            list.appendChild(more);
        }

        // Botão voltar
        const backBtn = document.createElement('li');
        backBtn.className = 'channel-item back-btn';
        backBtn.textContent = '⬅️ Voltar';
        backBtn.onclick = () => {
            if (typeof XtreamApp !== 'undefined') XtreamApp.handleBack();
        };
        list.appendChild(backBtn);

        XtreamNavigation.setColumns(3);
        XtreamNavigation.setItems('#searchResultsList .channel-item', 0);
    },

    // ═══════════════════════════════════════════════════════════
    // TELA DE BUSCA
    // ═══════════════════════════════════════════════════════════

    /**
     * Mostra a tela de busca global
     */
    showSearchScreen() {
        if (typeof XtreamApp !== 'undefined') {
            XtreamApp.hideAllScreens();
            XtreamNavigation.navigateTo('search');
        }

        const screen = document.getElementById('searchScreen');
        screen.classList.remove('hidden');

        // Limpa resultados anteriores
        // (mantém o query se o usuário já digitou algo)

        // Foca no input
        setTimeout(() => {
            const input = document.getElementById('globalSearchInput');
            if (input) input.focus();
        }, 200);
    },

    /**
     * Limpa cache de busca global (chamar ao trocar de playlist)
     */
    clearCache() {
        this.globalCache = {};
        this.globalQuery = '';
        this.globalResults = [];
        console.log('🔍 Cache de busca limpo');
    },

    // ═══════════════════════════════════════════════════════════
    // FOCO NO INPUT via navegação
    // ═══════════════════════════════════════════════════════════

    /**
     * Foca no input de busca da tela atual
     * Chamado quando o usuário pressiona uma tecla de atalho
     */
    focusSearchInput() {
        const screen = XtreamNavigation.currentScreen;
        const inputIds = {
            categories: 'categorySearchInput',
            channels:   'channelSearchInput',
            series:     'seriesSearchInput',
            search:     'globalSearchInput'
        };

        const inputId = inputIds[screen];
        if (inputId) {
            const input = document.getElementById(inputId);
            if (input) {
                input.focus();
                input.select();
                return true;
            }
        }
        return false;
    },

    /**
     * Verifica se algum input de busca está focado
     */
    isSearchFocused() {
        return this._inputFocused;
    },

    // ═══════════════════════════════════════════════════════════
    // UTILIDADES
    // ═══════════════════════════════════════════════════════════

    debounce(key, fn, delay) {
        if (this._debounceTimers[key]) clearTimeout(this._debounceTimers[key]);
        this._debounceTimers[key] = setTimeout(fn, delay);
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Normaliza texto para busca (remove acentos)
     */
    normalize(text) {
        return (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }
};

// Init quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    XtreamSearch.init();
});

window.XtreamSearch = XtreamSearch;
console.log('🔍 XtreamSearch v1.0 carregado');