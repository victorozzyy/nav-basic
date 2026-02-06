// channels.js - Gerenciamento de canais COM INTEGRAÇÃO LocalPlaylistLoader
// Versão 7.2 - Subcategorias com 1 canal vão direto para o player

var ChannelModule = {
    channelList: null,
    messageArea: null,
    messageTimeout: null,

    MAX_PER_SUBCATEGORY: 1000,
    MIN_CHANNELS_FOR_SUBCATEGORY: 2, // 🆕 Mínimo de canais para criar subcategoria

    // 🆕 Verificar se está usando índice
    isUsingIndex: false,
    currentIndex: null,

    // ========================================
    // 🔤 UTILITÁRIOS DE ORDENAÇÃO
    // ========================================
    sortAlpha: function(list, key) {
        if (key === undefined) key = null;
        return list.sort(function(a, b) {
            var A = key ? a[key] : a;
            var B = key ? b[key] : b;
            return String(A).localeCompare(String(B), 'pt-BR', { sensitivity: 'base' });
        });
    },

    sortByEpisode: function(channels) {
        return channels.sort(function(a, b) {
            var epA = a.name.match(/S(\d+)E(\d+)/i);
            var epB = b.name.match(/S(\d+)E(\d+)/i);

            if (!epA && !epB) return 0;
            if (!epA) return 1;
            if (!epB) return -1;

            var seasonDiff = Number(epA[1]) - Number(epB[1]);
            if (seasonDiff !== 0) return seasonDiff;

            return Number(epA[2]) - Number(epB[2]);
        });
    },

    // ========================================
    // 🔧 UTILITÁRIOS PARA AGRUPAMENTO
    // ========================================

    normalizeGroupKey: function(str) {
        if (!str) return 'OUTROS';
        
        var result = str.toUpperCase().trim();
        
        var accents = 'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÇçÑñ';
        var noAccents = 'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOOooooooUUUUuuuuCcNn';
        
        for (var i = 0; i < accents.length; i++) {
            result = result.split(accents[i]).join(noAccents[i]);
        }
        
        result = result.replace(/[^A-Z0-9\s]/g, '').trim();
        
        return result || 'OUTROS';
    },

    createTVSortKey: function(tvInfo) {
        var key = '';
        
        if (tvInfo.variant) {
            var num = parseInt(tvInfo.variant, 10);
            key += (num < 10 ? '00' : (num < 100 ? '0' : '')) + num;
        } else {
            key += '000';
        }
        
        var suffixOrder = ['HD', 'FHD', '4K', 'UHD', 'F', 'H265', 'HEVC', 'H264', 'SD', 'BACKUP', 'ALT', 'EXTRA', 'PLUS', 'PREMIUM'];
        var suffixPriority = '0';
        
        if (tvInfo.suffixes && tvInfo.suffixes.length > 0) {
            suffixPriority = '9';
            for (var i = 0; i < suffixOrder.length; i++) {
                for (var j = 0; j < tvInfo.suffixes.length; j++) {
                    if (tvInfo.suffixes[j].toUpperCase() === suffixOrder[i]) {
                        suffixPriority = String(i + 1);
                        break;
                    }
                }
            }
        }
        
        key += '_' + suffixPriority;
        key += '_' + (tvInfo.displayName || '');
        
        return key;
    },

    // ========================================
    // 📺 EXTRAIR INFORMAÇÕES DE CANAL DE TV
    // ========================================
    extractTVInfo: function(name) {
        if (!name) return null;
        
        var original = name.trim();
        var baseName = original;
        
        var suffixesToRemove = [
            'FULL HD', 'INTERNACIONAL', 'ALTERNATIVO',
            'H.265', 'H.264', 'HEVC', 'H265', 'H264',
            'PREMIUM', 'BACKUP', 'BRASIL', 'ULTRA',
            'EXTRA', 'PLUS', 'FHD', '4K', 'UHD', 'HD', 'SD',
            'MAX', 'BKP', 'ALT', 'INT', 'BR', 'PT', 'US', 'USA', 'F'
        ];
        
        var foundSuffixes = [];
        var changed = true;
        var iterations = 0;
        var maxIterations = 20;
        
        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;
            
            for (var i = 0; i < suffixesToRemove.length; i++) {
                var suffix = suffixesToRemove[i];
                var escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                var regex = new RegExp('[\\s\\-_]+' + escapedSuffix + '\\s*$', 'i');
                
                if (regex.test(baseName)) {
                    foundSuffixes.push(suffix);
                    baseName = baseName.replace(regex, '').trim();
                    changed = true;
                    break;
                }
                
                var regexNoSpace = new RegExp(escapedSuffix + '$', 'i');
                if (regexNoSpace.test(baseName) && baseName.length > suffix.length) {
                    var beforeSuffix = baseName.substring(0, baseName.length - suffix.length);
                    if (/[\d\s\-_]$/.test(beforeSuffix) || beforeSuffix.length <= 2) {
                        foundSuffixes.push(suffix);
                        baseName = beforeSuffix.trim();
                        changed = true;
                        break;
                    }
                }
            }
        }
        
        var variant = '';
        var variantMatch = baseName.match(/^(.+?)\s+(\d+)$/);
        if (variantMatch) {
            baseName = variantMatch[1].trim();
            variant = variantMatch[2];
        }
        
        baseName = baseName.replace(/[\s\-_]+$/, '').trim();
        
        if (baseName.length < 2) {
            baseName = original.replace(/\s*\d+\s*$/, '').trim();
            if (baseName.length < 2) {
                baseName = original;
            }
        }
        
        return {
            baseName: baseName,
            variant: variant,
            suffixes: foundSuffixes,
            displayName: original
        };
    },

    // ========================================
    // 🎬 EXTRAIR INFORMAÇÕES DE SÉRIE
    // ========================================
    extractSeriesInfo: function(name) {
        if (!name) return null;
        
        var patterns = [
            { regex: /^(.+?)\s*S(\d+)\s*E(\d+)/i, type: 'full' },
            { regex: /^(.+?)\s*(\d+)x(\d+)/i, type: 'full' },
            { regex: /^(.+?)\s*T(\d+)\s*E(\d+)/i, type: 'full' },
            { regex: /^(.+?)\s*[-–]\s*Temporada\s*(\d+)\s*[-–]?\s*Epis[oó]dio\s*(\d+)/i, type: 'full' },
            { regex: /^(.+?)\s*EP\.?\s*(\d+)/i, type: 'episode_only' },
            { regex: /^(.+?)\s*[-–]\s*EP\.?\s*(\d+)/i, type: 'episode_only' }
        ];
        
        for (var i = 0; i < patterns.length; i++) {
            var pattern = patterns[i];
            var match = name.match(pattern.regex);
            
            if (match) {
                var seriesName = match[1].trim();
                var season, episode;
                
                if (pattern.type === 'episode_only') {
                    season = 1;
                    episode = parseInt(match[2], 10);
                } else {
                    season = parseInt(match[2], 10);
                    episode = parseInt(match[3], 10);
                }
                
                seriesName = seriesName.replace(/[\s\-–_]+$/, '').trim();
                
                if (seriesName.length < 2) continue;
                
                return {
                    name: seriesName,
                    season: season,
                    episode: episode,
                    seasonKey: 'T' + (season < 10 ? '0' : '') + season,
                    episodeKey: 'E' + (episode < 10 ? '00' : (episode < 100 ? '0' : '')) + episode
                };
            }
        }
        
        return null;
    },

    // ========================================
    // 🧠 AGRUPAMENTO INTELIGENTE DE CANAIS
    // ========================================
    groupChannelsIntoSubcategoriesIntelligent: function(channels, categoryName) {
        var self = this;
        console.log('📊 Agrupamento inteligente para:', categoryName);
        console.log('   Total de canais:', channels.length);
        
        var tvGroups = {};
        var seriesWithSeasons = {};
        
        channels.forEach(function(ch) {
            var name = ch.name || '';
            
            var seriesInfo = self.extractSeriesInfo(name);
            
            if (seriesInfo) {
                var seriesKey = self.normalizeGroupKey(seriesInfo.name);
                
                if (!seriesWithSeasons[seriesKey]) {
                    seriesWithSeasons[seriesKey] = {
                        displayName: seriesInfo.name,
                        seasons: {}
                    };
                }
                
                var seasonKey = seriesInfo.seasonKey;
                if (!seriesWithSeasons[seriesKey].seasons[seasonKey]) {
                    seriesWithSeasons[seriesKey].seasons[seasonKey] = [];
                }
                
                seriesWithSeasons[seriesKey].seasons[seasonKey].push({
                    channel: ch,
                    episode: seriesInfo.episode,
                    seasonNum: seriesInfo.season
                });
                
                return;
            }
            
            var tvInfo = self.extractTVInfo(name);
            
            if (tvInfo && tvInfo.baseName) {
                var groupKey = self.normalizeGroupKey(tvInfo.baseName);
                
                if (!tvGroups[groupKey]) {
                    tvGroups[groupKey] = {
                        displayName: tvInfo.baseName,
                        channels: []
                    };
                }
                
                tvGroups[groupKey].channels.push({
                    channel: ch,
                    variant: tvInfo.variant,
                    suffixes: tvInfo.suffixes,
                    sortKey: self.createTVSortKey(tvInfo)
                });
            }
        });
        
        var result = [];
        
        // Processar SÉRIES
        var seriesKeys = Object.keys(seriesWithSeasons);
        self.sortAlpha(seriesKeys).forEach(function(seriesKey) {
            var seriesData = seriesWithSeasons[seriesKey];
            var seasons = seriesData.seasons;
            var seasonKeys = Object.keys(seasons).sort();
            
            if (seasonKeys.length === 1) {
                var seasonKey = seasonKeys[0];
                var episodes = seasons[seasonKey];
                
                episodes.sort(function(a, b) { return a.episode - b.episode; });
                
                result.push({
                    name: seriesData.displayName,
                    type: 'series',
                    channels: episodes.map(function(e) { return e.channel; })
                });
            } else {
                seasonKeys.forEach(function(seasonKey) {
                    var episodes = seasons[seasonKey];
                    var seasonNum = episodes[0].seasonNum;
                    
                    episodes.sort(function(a, b) { return a.episode - b.episode; });
                    
                    result.push({
                        name: seriesData.displayName + ' - Temporada ' + seasonNum,
                        type: 'series-season',
                        seriesName: seriesData.displayName,
                        season: seasonNum,
                        channels: episodes.map(function(e) { return e.channel; })
                    });
                });
            }
        });
        
        // Processar CANAIS DE TV
        var tvKeys = Object.keys(tvGroups);
        self.sortAlpha(tvKeys).forEach(function(key) {
            var group = tvGroups[key];
            
            group.channels.sort(function(a, b) {
                return a.sortKey.localeCompare(b.sortKey);
            });
            
            result.push({
                name: group.displayName,
                type: 'tv',
                channels: group.channels.map(function(c) { return c.channel; })
            });
        });
        
        // Ordenar resultado final
        result.sort(function(a, b) {
            return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
        });
        
        // Dividir grupos muito grandes
        var finalResult = [];
        result.forEach(function(group) {
            if (group.channels.length > self.MAX_PER_SUBCATEGORY) {
                var part = 1;
                for (var i = 0; i < group.channels.length; i += self.MAX_PER_SUBCATEGORY) {
                    finalResult.push({
                        name: group.name + ' - Parte ' + part,
                        type: group.type,
                        channels: group.channels.slice(i, i + self.MAX_PER_SUBCATEGORY)
                    });
                    part++;
                }
            } else {
                finalResult.push(group);
            }
        });
        
        console.log('✅ ' + finalResult.length + ' subcategorias criadas');
        
        return finalResult;
    },

    // ========================================
    // 🧠 AGRUPAMENTO COM SUBCATEGORIAS (MODO TRADICIONAL)
    // ========================================
    groupWithSubcategories: function(channels) {
        var self = this;
        var categories = {};

        channels.forEach(function(ch) {
            var cat = ch.group || 'Outros';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(ch);
        });

        var result = {};

        Object.keys(categories).forEach(function(cat) {
            result[cat] = self.groupChannelsIntoSubcategoriesIntelligent(categories[cat], cat);
        });

        return result;
    },

    // ========================================
    // 🔧 INICIALIZAÇÃO
    // ========================================
    init: function() {
        var self = this;
        this.channelList = document.getElementById('channelList');
        
        window.addEventListener("player-closed", function() {
            self.handleReturnFromPlayer();
        });

        this.messageArea = document.getElementById('messageArea');

        if (typeof SearchModule !== 'undefined') {
            SearchModule.init();
        }

        console.log('✅ ChannelModule inicializado (v7.2 - Canal único vai direto)');
    },
    
    showMessage: function(text, duration) {
        if (duration === undefined) duration = 3000;
        var self = this;
        
        if (!this.messageArea) {
            this.messageArea = document.getElementById('messageArea');
        }

        if (!this.messageArea) {
            console.warn('messageArea não encontrada');
            return;
        }

        this.messageArea.textContent = text;
        this.messageArea.style.display = 'block';

        clearTimeout(this.messageTimeout);
        this.messageTimeout = setTimeout(function() {
            self.messageArea.style.display = 'none';
        }, duration);
    },

    showLoading: function(text) {
        if (text === undefined) text = 'Carregando...';
        var el = document.getElementById('globalLoading');
        if (!el) {
            el = document.createElement('div');
            el.id = 'globalLoading';
            el.style.cssText = 'position:fixed;top:20px;right:20px;background:rgba(0,0,0,0.85);color:#6bff6b;padding:10px 16px;border-radius:6px;font-size:14px;z-index:20000;';
            document.body.appendChild(el);
        }
        el.textContent = '⏳ ' + text;
        el.style.display = 'block';
    },

    hideLoading: function() {
        var el = document.getElementById('globalLoading');
        if (el) el.style.display = 'none';
    },

    // ========================================
    // 📺 ATUALIZAR LISTA DE CANAIS
    // ========================================
    updateChannelList: function() {
        console.log('╔═══════════════════════════════════════╗');
        console.log('📺 ChannelModule.updateChannelList()');
        console.log('   Usando índice?', !!AppState.playlistIndex);
        console.log('   Canais carregados?', AppState.currentPlaylist ? AppState.currentPlaylist.length : 0);
        console.log('╚═══════════════════════════════════════╝');

        if (AppState.playlistIndex) {
            console.log('✅ Usando sistema de ÍNDICE (playlist grande)');
            this.isUsingIndex = true;
            this.currentIndex = AppState.playlistIndex;
            this.updateChannelListFromIndex();
            return;
        }

        console.log('✅ Usando playlist COMPLETA (tradicional)');
        this.isUsingIndex = false;
        this.currentIndex = null;
        
        var playlist = AppState.currentPlaylist || [];

        if (!playlist.length) {
            this.channelList.innerHTML = '<li class="no-channels">Nenhuma playlist carregada</li>';
            if (typeof SearchModule !== 'undefined') SearchModule.hide();
            return;
        }

        var grouped = this.groupWithSubcategories(playlist);
        var fragment = document.createDocumentFragment();

        if (AppState.currentPlaylistName) {
            var header = document.createElement('li');
            header.textContent = '📂 Playlist: ' + AppState.currentPlaylistName;
            header.style.cssText = 'color:#00e676;padding:15px;font-weight:bold;list-style:none;';
            fragment.appendChild(header);
        }

        var self = this;
        this.sortAlpha(Object.keys(grouped)).forEach(function(category) {
            var subs = grouped[category];
            var total = subs.reduce(function(a, b) { return a + b.channels.length; }, 0);
            var headerEl = self.createCategoryHeader(category, total, subs);
            fragment.appendChild(headerEl);
        });

        this.channelList.innerHTML = '';
        this.channelList.appendChild(fragment);

        AppState.currentView = 'channels';
        AppState.channelItems = Array.from(document.querySelectorAll('.category-header'));

        if (typeof SearchModule !== 'undefined') SearchModule.show();
        
        if (AppState.channelItems.length > 0) {
            NavigationModule.setFocusElement(AppState.channelItems[0]);
        }
    },

    // ========================================
    // 🆕 ATUALIZAR LISTA A PARTIR DO ÍNDICE
    // ========================================
    updateChannelListFromIndex: function() {
        console.log('📊 updateChannelListFromIndex()');
        
        if (!this.currentIndex || typeof LocalPlaylistLoader === 'undefined') {
            console.error('❌ Índice ou LocalPlaylistLoader não disponível');
            this.channelList.innerHTML = '<li class="no-channels">Erro: Sistema de índice não disponível</li>';
            return;
        }

        var categories = LocalPlaylistLoader.getCategories(this.currentIndex);
        
        if (!categories.length) {
            this.channelList.innerHTML = '<li class="no-channels">Nenhuma categoria encontrada</li>';
            return;
        }

        var fragment = document.createDocumentFragment();

        if (AppState.currentPlaylistName) {
            var header = document.createElement('li');
            header.textContent = '📂 Playlist: ' + AppState.currentPlaylistName;
            header.style.cssText = 'color:#00e676;padding:15px;font-weight:bold;list-style:none;';
            fragment.appendChild(header);
        }

        var self = this;
        this.sortAlpha(categories, 'name').forEach(function(category) {
            var headerEl = self.createCategoryHeaderFromIndex(category.name, category.count);
            fragment.appendChild(headerEl);
        });

        this.channelList.innerHTML = '';
        this.channelList.appendChild(fragment);

        AppState.currentView = 'channels';
        AppState.channelItems = Array.from(document.querySelectorAll('.category-header'));

        if (typeof SearchModule !== 'undefined') SearchModule.show();
        
        if (AppState.channelItems.length > 0) {
            NavigationModule.setFocusElement(AppState.channelItems[0]);
        }

        console.log('✅ ' + categories.length + ' categorias exibidas do índice');
    },

    // ========================================
    // 📋 CRIAR HEADER DE CATEGORIA
    // ========================================
    createCategoryHeader: function(name, count, subcategories) {
        var self = this;
        var li = document.createElement('li');
        li.className = 'category-header';
        li.tabIndex = 0;
        li.dataset.group = name;

        var emoji = name === 'Todos os Canais' ? '📺' : '📁';
        
        li.innerHTML = '<strong>' + emoji + ' ' + name + ' (' + count + ' canais)</strong>';
        
        li.style.cssText = 'color:#6bff6b;padding:15px 10px;border-bottom:2px solid #333;cursor:pointer;background:linear-gradient(45deg,#1a1a1a,#2a2a2a);border-radius:5px;margin-bottom:5px;list-style:none;';

        li.onclick = function() {
            if (AppState.channelItems) {
                AppState.lastCategoryIndex = AppState.channelItems.indexOf(li);
            }
            self.showSubcategoryOverlay(name, subcategories);
        };

        li.onkeydown = function(e) {
            if (e.key === 'Enter') li.click();
        };

        return li;
    },

    // ========================================
    // 🆕 CRIAR HEADER DE CATEGORIA (DO ÍNDICE)
    // ========================================
    createCategoryHeaderFromIndex: function(name, count) {
        var self = this;
        var li = document.createElement('li');
        li.className = 'category-header';
        li.tabIndex = 0;
        li.dataset.group = name;

        var emoji = name === 'Todos os Canais' ? '📺' : '📁';
        
        li.innerHTML = '<strong>' + emoji + ' ' + name + ' (' + count + ' canais)</strong>';
        
        li.style.cssText = 'color:#6bff6b;padding:15px 10px;border-bottom:2px solid #333;cursor:pointer;background:linear-gradient(45deg,#1a1a1a,#2a2a2a);border-radius:5px;margin-bottom:5px;list-style:none;';

        li.onclick = function() {
            console.log('🔍 Clicou na categoria:', name);
            
            if (AppState.channelItems) {
                AppState.lastCategoryIndex = AppState.channelItems.indexOf(li);
            }
            
            self.loadAndShowCategoryFromIndex(name);
        };

        li.onkeydown = function(e) {
            if (e.key === 'Enter') li.click();
        };

        return li;
    },

    // ========================================
    // 🆕 CARREGAR E MOSTRAR CATEGORIA DO ÍNDICE
    // ========================================
    loadAndShowCategoryFromIndex: function(categoryName) {
        var self = this;
        
        console.log('╔═══════════════════════════════════════╗');
        console.log('📺 loadAndShowCategoryFromIndex()');
        console.log('   Categoria:', categoryName);
        console.log('╚═══════════════════════════════════════╝');

        if (!this.currentIndex || typeof LocalPlaylistLoader === 'undefined') {
            this.showMessage('❌ Erro: Sistema de índice não disponível', 3000);
            return;
        }

        try {
            this.showLoading('Carregando "' + categoryName + '"');

            var channels = LocalPlaylistLoader.getCategoryChannels(
                this.currentIndex,
                categoryName,
                this.MAX_PER_SUBCATEGORY
            );

            console.log('✅ ' + channels.length + ' canais carregados');

            if (!channels.length) {
                this.hideLoading();
                this.showMessage('⚠️ Nenhum canal encontrado nesta categoria', 3000);
                return;
            }

            this.hideLoading();

            var subcategories = this.groupChannelsIntoSubcategoriesIntelligent(channels, categoryName);
            this.showSubcategoryOverlay(categoryName, subcategories);

        } catch (error) {
            console.error('❌ Erro ao carregar categoria:', error);
            this.hideLoading();
            this.showMessage('❌ Erro ao carregar categoria', 3000);
        }
    },

    // ========================================
    // 📂 OVERLAY DE SUBCATEGORIAS (NÍVEL 2) - CORRIGIDO
    // ========================================
    showSubcategoryOverlay: function(categoryName, subcategories) {
        var self = this;
        var overlay = this.createOverlayElement();
        var title = document.getElementById('overlayTitle');
        var grid = document.getElementById('overlayChannelGrid');
        var breadcrumb = document.getElementById('overlayBreadcrumb');
        var backBtn = document.getElementById('overlayBackBtn');

        breadcrumb.innerHTML = '<span style="color:#aaa;">📁 ' + categoryName + '</span>';
        backBtn.style.display = 'none';

        title.textContent = '📂 ' + categoryName + ' - Selecione';
        grid.innerHTML = '';
        AppState.overlayChannels = [];
        AppState.currentCategory = categoryName;
        AppState.currentSubcategories = subcategories;

        // 🆕 Separar subcategorias normais e canais únicos
        var normalSubcategories = [];
        var singleChannels = [];

        subcategories.forEach(function(sub) {
            if (sub.channels.length < self.MIN_CHANNELS_FOR_SUBCATEGORY) {
                // Canal único - vai direto na lista
                sub.channels.forEach(function(ch) {
                    singleChannels.push({
                        channel: ch,
                        originalSubName: sub.name,
                        type: sub.type
                    });
                });
            } else {
                // Subcategoria normal
                normalSubcategories.push(sub);
            }
        });

        console.log('📊 Subcategorias normais:', normalSubcategories.length);
        console.log('📊 Canais únicos (direto):', singleChannels.length);

        var index = 0;

        // Primeiro: Subcategorias normais (2+ canais)
        normalSubcategories.forEach(function(sub) {
            var card = self.createSubcategoryCard(sub, index);
            grid.appendChild(card);
            AppState.overlayChannels.push(card);
            index++;
        });

        // Depois: Canais únicos (aparecem como canais direto)
        singleChannels.forEach(function(item) {
            var card = self.createDirectChannelCard(item.channel, index, item.originalSubName);
            grid.appendChild(card);
            AppState.overlayChannels.push(card);
            index++;
        });

        // 🆕 Guardar informações para navegação
        AppState.normalSubcategoriesCount = normalSubcategories.length;
        AppState.singleChannelsInOverlay = singleChannels;

        overlay.style.display = 'block';
        AppState.currentView = 'overlay-subcategory';
        
        var restoreIndex = typeof AppState.lastSubCategoryIndex === 'number' ? AppState.lastSubCategoryIndex : 0;
        if (restoreIndex >= AppState.overlayChannels.length) restoreIndex = 0;
        this.setOverlayFocus(restoreIndex);

        var totalItems = normalSubcategories.length + singleChannels.length;
        this.showMessage('📂 ' + totalItems + ' itens em "' + categoryName + '"', 2000);
    },

    // ========================================
    // 🆕 CRIAR CARD DE CANAL DIRETO (para subcategorias com 1 canal)
    // ========================================
    createDirectChannelCard: function(channel, index, originalSubName) {
        var self = this;
        var div = document.createElement('div');
        div.className = 'overlay-channel-item direct-channel-card';
        div.tabIndex = 0;
        div.dataset.index = index;
        div.dataset.url = channel.url;
        div.dataset.isDirect = 'true'; // 🆕 Marca como canal direto

        var isMP4 = channel.url && channel.url.toLowerCase().indexOf('.mp4') !== -1;
        var mp4Badge = isMP4 ? '<span style="background:#ffeb3b;color:#000;padding:2px 6px;border-radius:3px;font-size:0.7em;margin-left:8px;">MP4</span>' : '';

        div.style.cssText = 'background:linear-gradient(135deg,#1a2a1a 0%,#0a1a0a 100%);border:2px solid #4a4;border-radius:10px;padding:20px;cursor:pointer;transition:all 0.3s ease;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:120px;';

        div.innerHTML = '<div style="font-size:1.8em;margin-bottom:10px;">▶️</div>' +
            '<div style="font-weight:bold;font-size:1em;color:#6bff6b;text-align:center;margin-bottom:4px;">' + channel.name + mp4Badge + '</div>' +
            '<div style="font-size:0.8em;color:#888;text-align:center;">' + (channel.group || originalSubName || 'Canal') + '</div>';

        // 🆕 Ao clicar, abre o canal DIRETO (sem overlay de canais)
        div.onclick = function() {
            AppState.lastSubCategoryIndex = index;
            console.log('▶️ Abrindo canal direto:', channel.name);
            self.openChannel(channel);
        };

        div.onkeydown = function(e) {
            if (e.key === 'Enter') {
                AppState.lastSubCategoryIndex = index;
                self.openChannel(channel);
            }
        };

        div.onmouseenter = function() {
            div.style.borderColor = '#6f6';
            div.style.background = 'linear-gradient(135deg,#2a3a2a 0%,#1a2a1a 100%)';
            div.style.transform = 'scale(1.05)';
        };

        div.onmouseleave = function() {
            if (!div.classList.contains('focused')) {
                div.style.borderColor = '#4a4';
                div.style.background = 'linear-gradient(135deg,#1a2a1a 0%,#0a1a0a 100%)';
                div.style.transform = 'scale(1)';
            }
        };

        return div;
    },

    // ========================================
    // 🎴 CRIAR CARD DE SUBCATEGORIA
    // ========================================
    createSubcategoryCard: function(subcategory, index) {
        var self = this;
        var div = document.createElement('div');
        div.className = 'overlay-channel-item subcategory-card';
        div.tabIndex = 0;
        div.dataset.subIndex = index;
        div.dataset.isDirect = 'false';

        var emoji = '📂';
        if (subcategory.type === 'series' || subcategory.type === 'series-season') {
            emoji = '🎬';
        } else if (subcategory.type === 'tv') {
            emoji = '📺';
        }

        div.style.cssText = 'background:linear-gradient(135deg,#2a2a2a 0%,#1a1a1a 100%);border:2px solid #444;border-radius:10px;padding:20px;cursor:pointer;transition:all 0.3s ease;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:120px;';

        div.innerHTML = '<div style="font-size:2em;margin-bottom:10px;">' + emoji + '</div>' +
            '<div style="font-weight:bold;font-size:1.1em;color:#6bff6b;text-align:center;margin-bottom:8px;">' + subcategory.name + '</div>' +
            '<div style="font-size:0.9em;color:#aaa;">' + subcategory.channels.length + ' ' + (subcategory.channels.length === 1 ? 'canal' : 'canais') + '</div>';

        div.onclick = function() {
            AppState.lastSubCategoryIndex = index;
            self.showChannelsOverlay(subcategory, index);
        };

        div.onkeydown = function(e) {
            if (e.key === 'Enter') {
                AppState.lastSubCategoryIndex = index;
                self.showChannelsOverlay(subcategory, index);
            }
        };

        div.onmouseenter = function() {
            div.style.borderColor = '#6bff6b';
            div.style.background = 'linear-gradient(135deg,#333 0%,#2a2a2a 100%)';
            div.style.transform = 'scale(1.05)';
        };

        div.onmouseleave = function() {
            if (!div.classList.contains('focused')) {
                div.style.borderColor = '#444';
                div.style.background = 'linear-gradient(135deg,#2a2a2a 0%,#1a1a1a 100%)';
                div.style.transform = 'scale(1)';
            }
        };

        return div;
    },

    // ========================================
    // 📺 OVERLAY DE CANAIS (NÍVEL 3)
    // ========================================
    showChannelsOverlay: function(subcategory, subIndex) {
        var self = this;
        var grid = document.getElementById('overlayChannelGrid');
        var title = document.getElementById('overlayTitle');
        var breadcrumb = document.getElementById('overlayBreadcrumb');
        var backBtn = document.getElementById('overlayBackBtn');

        breadcrumb.innerHTML = '<span style="color:#aaa;cursor:pointer;" id="breadcrumbCategory">📁 ' + AppState.currentCategory + '</span>' +
            '<span style="color:#666;margin:0 8px;">›</span>' +
            '<span style="color:#6bff6b;">📂 ' + subcategory.name + '</span>';

        document.getElementById('breadcrumbCategory').onclick = function() {
            self.showSubcategoryOverlay(AppState.currentCategory, AppState.currentSubcategories);
        };

        backBtn.style.display = 'inline-block';
        backBtn.onclick = function() {
            self.showSubcategoryOverlay(AppState.currentCategory, AppState.currentSubcategories);
        };

        title.textContent = '📺 ' + subcategory.name;
        grid.innerHTML = '';
        AppState.overlayChannels = [];
        AppState.currentSubCategoryIndex = subIndex;

        var channelsToShow = subcategory.channels.slice();
        if (subcategory.type === 'series' || subcategory.type === 'series-season') {
            channelsToShow = this.sortByEpisode(channelsToShow);
        }

        channelsToShow.forEach(function(channel, chIndex) {
            var el = self.createChannelItem(channel, subIndex, chIndex);
            grid.appendChild(el);
            AppState.overlayChannels.push(el);
        });

        AppState.currentView = 'overlay-channels';
        
        var restoreIndex = typeof AppState.lastChannelIndex === 'number' ? AppState.lastChannelIndex : 0;
        if (restoreIndex >= channelsToShow.length) restoreIndex = 0;
        this.setOverlayFocus(restoreIndex);

        this.showMessage('📺 ' + channelsToShow.length + ' canais em "' + subcategory.name + '"', 2000);
    },

    // ========================================
    // 🎬 ITEM DE CANAL
    // ========================================
    createChannelItem: function(channel, subIndex, chIndex) {
        var self = this;
        var div = document.createElement('div');
        div.className = 'overlay-channel-item channel-card';
        div.tabIndex = 0;

        div.dataset.sub = subIndex;
        div.dataset.pos = chIndex;
        div.dataset.url = channel.url;

        var isMP4 = channel.url && channel.url.toLowerCase().indexOf('.mp4') !== -1;
        var mp4Badge = isMP4 ? '<span style="background:#ffeb3b;color:#000;padding:2px 6px;border-radius:3px;font-size:0.7em;margin-left:8px;">MP4</span>' : '';

        div.style.cssText = 'background:#2a2a2a;border:2px solid #444;border-radius:8px;padding:15px;cursor:pointer;transition:all 0.3s ease;color:white;';

        div.innerHTML = '<div style="font-weight:bold;margin-bottom:5px;color:#6bff6b;display:flex;align-items:center;">▶️ ' + channel.name + ' ' + mp4Badge + '</div>' +
            '<div style="font-size:0.8em;color:#aaa;">' + (channel.group || 'Sem categoria') + '</div>';

        div.onclick = function() {
            AppState.lastChannelIndex = chIndex;
            self.openChannel(channel);
        };
        
        div.onkeydown = function(e) {
            if (e.key === 'Enter') {
                AppState.lastChannelIndex = chIndex;
                self.openChannel(channel);
            }
        };

        div.onmouseenter = function() {
            div.style.borderColor = '#6bff6b';
            div.style.background = '#333';
        };

        div.onmouseleave = function() {
            if (!div.classList.contains('focused')) {
                div.style.borderColor = '#444';
                div.style.background = '#2a2a2a';
            }
        };

        return div;
    },

    // ========================================
    // ▶️ ABRIR CANAL NO PLAYER
    // ========================================
    openChannel: function(channel) {
        var index = -1;
        
        if (this.isUsingIndex) {
            console.log('⚠️ Modo índice: usando índice relativo');
            index = 0;
        } else if (AppState.currentPlaylist) {
            for (var i = 0; i < AppState.currentPlaylist.length; i++) {
                if (AppState.currentPlaylist[i].url === channel.url) {
                    index = i;
                    break;
                }
            }
        }
        
        AppState.setCurrentChannel(channel, index);

        AppState.lastOverlayFocusIndex = AppState.overlayFocusIndex;
        console.log('💾 Salvando posição do overlay:', AppState.lastOverlayFocusIndex);

        var overlay = document.getElementById('channelOverlay');
        if (overlay) {
            overlay.style.zIndex = '5000';
        }

        AppState.currentView = 'player';

        if (typeof PlayerModule !== 'undefined') {
            PlayerModule.open(channel.url, channel.name, index);
        } else {
            this.showMessage('❌ Erro: PlayerModule não disponível', 3000);
        }
    },

    // ========================================
    // 🔙 RESTAURAR OVERLAY APÓS FECHAR PLAYER
    // ========================================
    restoreOverlayAfterPlayer: function() {
        var self = this;
        console.log('🔙 restoreOverlayAfterPlayer chamado');
        
        var overlay = document.getElementById('channelOverlay');
        if (overlay && overlay.style.display !== 'none') {
            console.log('✅ Overlay ainda está aberto, restaurando...');
            
            overlay.style.zIndex = '9999';
            
            // 🆕 Verificar se estava no nível de subcategorias ou canais
            var focusIndex = AppState.lastOverlayFocusIndex >= 0 ? AppState.lastOverlayFocusIndex : AppState.overlayFocusIndex;
            
            // Se veio de canal direto, volta para subcategorias
            if (AppState.currentView === 'player' && AppState.overlayChannels && AppState.overlayChannels.length > 0) {
                var focusedEl = AppState.overlayChannels[focusIndex];
                if (focusedEl && focusedEl.dataset.isDirect === 'true') {
                    AppState.currentView = 'overlay-subcategory';
                } else {
                    AppState.currentView = 'overlay-channels';
                }
            }
                
            console.log('🎯 Restaurando foco no índice:', focusIndex);
            
            if (focusIndex >= 0 && AppState.overlayChannels && AppState.overlayChannels.length > 0) {
                setTimeout(function() {
                    self.setOverlayFocus(focusIndex);

                    var overlayEl = document.getElementById('channelOverlay');
                    if (overlayEl && overlayEl.focus) {
                        overlayEl.focus();
                    }

                    console.log('✅ Foco e navegação restaurados');
                }, 100);
            }
        } else {
            console.log('⚠️ Overlay não está visível, voltando para lista de categorias');
            AppState.currentView = 'channels';
        }
    },

    // ========================================
    // 🎯 FOCO NO OVERLAY
    // ========================================
    setOverlayFocus: function(index) {
        if (!AppState.overlayChannels || !AppState.overlayChannels.length) return;
        
        index = Math.max(0, Math.min(index, AppState.overlayChannels.length - 1));
        
        AppState.overlayChannels.forEach(function(el) {
            el.classList.remove('focused');
            el.style.borderColor = '#444';
            
            if (el.classList.contains('subcategory-card')) {
                el.style.background = 'linear-gradient(135deg,#2a2a2a 0%,#1a1a1a 100%)';
                el.style.transform = 'scale(1)';
            } else if (el.classList.contains('direct-channel-card')) {
                el.style.borderColor = '#87CEFA';
                el.style.background = 'linear-gradient(135deg,blue 0%,#0a1a0a 100%)';
                el.style.transform = 'scale(1)';
            } else {
                el.style.background = '#2a2a2a';
            }
        });
        
        var el = AppState.overlayChannels[index];
        el.classList.add('focused');
        
        if (el.classList.contains('subcategory-card')) {
            el.style.borderColor = '#6bff6b';
            el.style.background = 'linear-gradient(135deg,#333 0%,#2a2a2a 100%)';
            el.style.transform = 'scale(1.05)';
        } else if (el.classList.contains('direct-channel-card')) {
            el.style.borderColor = '#6f6';
            el.style.background = 'linear-gradient(135deg,#2a3a2a 0%,#1a2a1a 100%)';
            el.style.transform = 'scale(1.05)';
        } else {
            el.style.borderColor = '#6bff6b';
            el.style.background = '#333';
        }
        
        el.focus();
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        AppState.overlayFocusIndex = index;
    },

    moveOverlayFocus: function(delta) {
        if (!AppState.overlayChannels) return;
        var len = AppState.overlayChannels.length;
        if (len === 0) return;
        
        var next = (AppState.overlayFocusIndex + delta + len) % len;
        this.setOverlayFocus(next);
    },

    // ========================================
    // 🖼️ CRIAR OVERLAY
    // ========================================
    createOverlayElement: function() {
        var self = this;
        var o = document.getElementById('channelOverlay');
        if (o) return o;

        o = document.createElement('div');
        o.id = 'channelOverlay';
        o.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:9999;overflow-y:auto;padding:20px;box-sizing:border-box;';

        o.innerHTML = '<div style="max-width:1200px;margin:0 auto;background:#1a1a1a;border-radius:12px;padding:25px;border:2px solid #333;">' +
            '<div id="overlayBreadcrumb" style="font-size:0.9em;margin-bottom:15px;padding-bottom:10px;border-bottom:1px solid #333;"></div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:15px;border-bottom:2px solid #333;">' +
                '<h2 id="overlayTitle" style="color:#6bff6b;margin:0;font-size:1.5em;"></h2>' +
                '<div style="display:flex;gap:10px;">' +
                    '<button id="overlayBackBtn" style="background:#667eea;color:white;border:none;padding:8px 16px;border-radius:5px;cursor:pointer;font-size:14px;display:none;">⬅️ Voltar</button>' +
                    '<button id="overlayCloseBtn" tabindex="0" style="background:#ff4444;color:white;border:none;padding:8px 16px;border-radius:5px;cursor:pointer;font-size:14px;">✕ Fechar</button>' +
                '</div>' +
            '</div>' +
            '<div id="overlayChannelGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:15px;max-height:65vh;overflow-y:auto;padding:10px;"></div>' +
        '</div>';

        document.body.appendChild(o);
        
        document.getElementById('overlayCloseBtn').onclick = function() {
            self.hideOverlay();
        };
        
        return o;
    },

    // ========================================
    // 🚪 FECHAR OVERLAY
    // ========================================
    hideOverlay: function() {
        var self = this;
        console.log('🚪 hideOverlay chamado');
        
        var overlay = document.getElementById('channelOverlay');
        if (overlay) {
            overlay.style.display = 'none';
            overlay.style.zIndex = '9999';
        }
        
        AppState.returningFromSubcategory = true;
        
        AppState.overlayChannels = [];
        AppState.overlayFocusIndex = 0;
        AppState.lastOverlayFocusIndex = -1;
        
        setTimeout(function() {
            var headers = document.querySelectorAll('.category-header');
            
            console.log('🔍 Tentando restaurar foco');
            console.log('   Total de headers:', headers.length);
            console.log('   Último índice salvo:', AppState.lastCategoryIndex);

            if (headers.length > 0 && typeof AppState.lastCategoryIndex === 'number' && 
                AppState.lastCategoryIndex >= 0 && AppState.lastCategoryIndex < headers.length) {
                var targetHeader = headers[AppState.lastCategoryIndex];
                console.log('🎯 Restaurando foco para:', targetHeader.textContent);
                
                AppState.currentView = 'channels';
                NavigationModule.setFocusElement(targetHeader);
                
                console.log('✅ Foco restaurado com sucesso');
            } else {
                console.warn('⚠️ Não foi possível restaurar foco - usando fallback');
                AppState.currentView = 'channels';
                if (headers.length > 0) {
                    NavigationModule.setFocusElement(headers[0]);
                }
            }

            setTimeout(function() {
                AppState.returningFromSubcategory = false;
                console.log('🔓 Flag returningFromSubcategory liberada');
            }, 100);
        }, 150);
    },

    // ========================================
    // ⬅️ VOLTAR NO OVERLAY
    // ========================================
    handleOverlayBack: function() {
        if (AppState.currentView === 'overlay-channels') {
            this.showSubcategoryOverlay(AppState.currentCategory, AppState.currentSubcategories);
        } else if (AppState.currentView === 'overlay-subcategory') {
            AppState.returningFromSubcategory = true;
            this.hideOverlay();
        }
    },

    // ========================================
    // 🔙 RETORNO DO PLAYER (ORQUESTRADOR)
    // ========================================
    handleReturnFromPlayer: function() {
        console.log('🔙 handleReturnFromPlayer');

        var overlay = document.getElementById('channelOverlay');

        if (overlay && overlay.style.display !== 'none' && AppState.lastOverlayFocusIndex >= 0) {
            this.restoreOverlayAfterPlayer();
            return;
        }

        this.updateChannelList();
    }
};

// ========================================
// 🎮 NAVEGAÇÃO POR TECLADO
// ========================================
document.addEventListener('keydown', function(e) {
    if (!AppState.currentView || AppState.currentView.indexOf('overlay') === -1) return;

    switch (e.key) {
        case 'ArrowUp':
            e.preventDefault();
            ChannelModule.moveOverlayFocus(-3);
            break;
        case 'ArrowLeft':
            e.preventDefault();
            ChannelModule.moveOverlayFocus(-1);
            break;
        case 'ArrowDown':
            e.preventDefault();
            ChannelModule.moveOverlayFocus(3);
            break;
        case 'ArrowRight':
            e.preventDefault();
            ChannelModule.moveOverlayFocus(1);
            break;
        case 'Backspace':
        case 'Escape':
        case 'BrowserBack':
            e.preventDefault();
            ChannelModule.handleOverlayBack();
            break;
        case 'Enter':
            break;
        default:
            if (e.keyCode === 10009) {
                e.preventDefault();
                ChannelModule.handleOverlayBack();
            }
            break;
    }
});

console.log('✅ ChannelModule v7.2 carregado - Canal único vai direto para player');
