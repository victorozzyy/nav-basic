// channels.js - Gerenciamento de canais COM INTEGRAÇÃO LocalPlaylistLoader
// Versão 7.6 - Com Favoritos, "Continue Assistindo" e Agrupamento por Ano

var ChannelModule = {
    channelList: null,
    messageArea: null,
    messageTimeout: null,

    MAX_PER_SUBCATEGORY: 500,
    MIN_CHANNELS_FOR_SUBCATEGORY: 2,

    isUsingIndex: false,
    currentIndex: null,

    // Configurações de ordenação
    sortMode: 'none', // 'none' (padrão), 'alphabetical' ou 'year'
    sortModes: ['none', 'alphabetical', 'year'],

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

    sortByYear: function(list, key) {
        var self = this;
        if (key === undefined) key = null;
        return list.sort(function(a, b) {
            var nameA = key ? a[key] : (a.name || a);
            var nameB = key ? b[key] : (b.name || b);
            
            var yearA = self.extractYear(nameA);
            var yearB = self.extractYear(nameB);
            
            if (yearA && yearB) {
                if (yearB !== yearA) return yearB - yearA;
                return String(nameA).localeCompare(String(nameB), 'pt-BR', { sensitivity: 'base' });
            }
            if (yearA) return -1;
            if (yearB) return 1;
            
            return String(nameA).localeCompare(String(nameB), 'pt-BR', { sensitivity: 'base' });
        });
    },

    // ========================================
    // 🆕 EXTRAIR ANO DO NOME
    // ========================================
    extractYear: function(name) {
        if (!name) return null;
        
        var patterns = [
            /\((\d{4})\)/,
            /\[(\d{4})\]/,
            /\s(\d{4})\s*$/,
            /\s(\d{4})\s*[-–]/,
            /\.(\d{4})\./,
            /\s(\d{4})\s+(?:720|1080|2160|4K|HD|FHD|UHD)/i,
        ];
        
        for (var i = 0; i < patterns.length; i++) {
            var match = name.match(patterns[i]);
            if (match) {
                var year = parseInt(match[1], 10);
                if (year >= 1900 && year <= 2099) {
                    return year;
                }
            }
        }
        
        return null;
    },

    extractNameWithoutYear: function(name) {
        if (!name) return name;
        
        var cleaned = name
            .replace(/\s*\(\d{4}\)\s*/g, ' ')
            .replace(/\s*\[\d{4}\]\s*/g, ' ')
            .replace(/\s+\d{4}\s*$/g, '')
            .replace(/\s+\d{4}\s*[-–]/g, ' -')
            .replace(/\.\d{4}\./g, '.')
            .trim();
        
        return cleaned || name;
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
    // DETECTAR SE CATEGORIA TEM CONTEÚDO COM ANO
    // ========================================
    detectYearContent: function(channels) {
        if (!channels || channels.length === 0) return false;
        
        var withYear = 0;
        var sampleSize = Math.min(channels.length, 50);
        
        for (var i = 0; i < sampleSize; i++) {
            if (this.extractYear(channels[i].name)) {
                withYear++;
            }
        }
        
        return (withYear / sampleSize) >= 0.3;
    },

    // ========================================
    // AGRUPAR POR ANO
    // ========================================
    groupByYear: function(channels) {
        var self = this;
        var yearGroups = {};
        var noYear = [];
        
        channels.forEach(function(ch) {
            var year = self.extractYear(ch.name);
            if (year) {
                if (!yearGroups[year]) {
                    yearGroups[year] = [];
                }
                yearGroups[year].push(ch);
            } else {
                noYear.push(ch);
            }
        });
        
        var sortedYears = Object.keys(yearGroups).sort(function(a, b) {
            return parseInt(b, 10) - parseInt(a, 10);
        });
        
        var result = [];
        
        sortedYears.forEach(function(year) {
            var yearChannels = yearGroups[year];
            self.sortAlpha(yearChannels, 'name');
            
            result.push({
                name: '📅 ' + year,
                type: 'year-group',
                year: parseInt(year, 10),
                channels: yearChannels
            });
        });
        
        if (noYear.length > 0) {
            self.sortAlpha(noYear, 'name');
            result.push({
                name: '📁 Sem ano definido',
                type: 'year-group',
                year: 0,
                channels: noYear
            });
        }
        
        return result;
    },

    // ========================================
    // 🧠 AGRUPAMENTO INTELIGENTE DE CANAIS
    // ========================================
    groupChannelsIntoSubcategoriesIntelligent: function(channels, categoryName) {
        var self = this;
        console.log('📊 Agrupamento inteligente para:', categoryName);
        console.log('   Total de canais:', channels.length);
        console.log('   Modo de ordenação:', this.sortMode);
        
        if (this.sortMode === 'none') {
            console.log('📋 Usando ordenação PADRÃO (ordem original)');
            return this.groupChannelsWithoutSorting(channels, categoryName);
        }
        
        var hasYearContent = this.detectYearContent(channels);
        console.log('   Conteúdo com ano detectado:', hasYearContent);
        
        if (this.sortMode === 'year' && hasYearContent) {
            console.log('📅 Usando agrupamento por ANO');
            return this.groupByYear(channels);
        }
        
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
                        channels: [],
                        year: self.extractYear(name)
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
        
        var tvKeys = Object.keys(tvGroups);
        
        if (this.sortMode === 'year') {
            tvKeys.sort(function(a, b) {
                var yearA = tvGroups[a].year || 0;
                var yearB = tvGroups[b].year || 0;
                if (yearB !== yearA) return yearB - yearA;
                return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
            });
        } else {
            self.sortAlpha(tvKeys);
        }
        
        tvKeys.forEach(function(key) {
            var group = tvGroups[key];
            
            group.channels.sort(function(a, b) {
                return a.sortKey.localeCompare(b.sortKey);
            });
            
            var displayName = group.displayName;
            if (self.sortMode === 'year' && group.year) {
                displayName += ' (' + group.year + ')';
            }
            
            result.push({
                name: displayName,
                type: 'tv',
                year: group.year,
                channels: group.channels.map(function(c) { return c.channel; })
            });
        });
        
        if (this.sortMode === 'year') {
            result.sort(function(a, b) {
                var yearA = a.year || 0;
                var yearB = b.year || 0;
                if (yearB !== yearA) return yearB - yearA;
                return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
            });
        } else {
            result.sort(function(a, b) {
                return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
            });
        }
        
        var finalResult = [];
        result.forEach(function(group) {
            if (group.channels.length > self.MAX_PER_SUBCATEGORY) {
                var part = 1;
                for (var i = 0; i < group.channels.length; i += self.MAX_PER_SUBCATEGORY) {
                    finalResult.push({
                        name: group.name + ' - Parte ' + part,
                        type: group.type,
                        year: group.year,
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
    // AGRUPAR SEM ORDENAÇÃO (ORDEM ORIGINAL)
    // ========================================
    groupChannelsWithoutSorting: function(channels, categoryName) {
        var self = this;
        console.log('📋 Agrupando SEM ordenação para:', categoryName);
        
        var tvGroups = {};
        var seriesWithSeasons = {};
        var orderedKeys = [];
        var seriesOrderedKeys = [];
        
        channels.forEach(function(ch) {
            var name = ch.name || '';
            
            var seriesInfo = self.extractSeriesInfo(name);
            
            if (seriesInfo) {
                var seriesKey = self.normalizeGroupKey(seriesInfo.name);
                
                if (!seriesWithSeasons[seriesKey]) {
                    seriesWithSeasons[seriesKey] = {
                        displayName: seriesInfo.name,
                        seasons: {},
                        insertOrder: seriesOrderedKeys.length
                    };
                    seriesOrderedKeys.push(seriesKey);
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
                        channels: [],
                        year: self.extractYear(name),
                        insertOrder: orderedKeys.length
                    };
                    orderedKeys.push(groupKey);
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
        
        seriesOrderedKeys.forEach(function(seriesKey) {
            var seriesData = seriesWithSeasons[seriesKey];
            var seasons = seriesData.seasons;
            var seasonKeys = Object.keys(seasons).sort();
            
            if (seasonKeys.length === 1) {
                var seasonKey = seasonKeys[0];
                var episodes = seasons[seasonKey];
                
                result.push({
                    name: seriesData.displayName,
                    type: 'series',
                    insertOrder: seriesData.insertOrder,
                    channels: episodes.map(function(e) { return e.channel; })
                });
            } else {
                seasonKeys.forEach(function(seasonKey, idx) {
                    var episodes = seasons[seasonKey];
                    var seasonNum = episodes[0].seasonNum;
                    
                    result.push({
                        name: seriesData.displayName + ' - Temporada ' + seasonNum,
                        type: 'series-season',
                        seriesName: seriesData.displayName,
                        season: seasonNum,
                        insertOrder: seriesData.insertOrder + (idx * 0.01),
                        channels: episodes.map(function(e) { return e.channel; })
                    });
                });
            }
        });
        
        orderedKeys.forEach(function(key) {
            var group = tvGroups[key];
            
            result.push({
                name: group.displayName,
                type: 'tv',
                year: group.year,
                insertOrder: group.insertOrder,
                channels: group.channels.map(function(c) { return c.channel; })
            });
        });
        
        result.sort(function(a, b) {
            return a.insertOrder - b.insertOrder;
        });
        
        var finalResult = [];
        result.forEach(function(group) {
            if (group.channels.length > self.MAX_PER_SUBCATEGORY) {
                var part = 1;
                for (var i = 0; i < group.channels.length; i += self.MAX_PER_SUBCATEGORY) {
                    finalResult.push({
                        name: group.name + ' - Parte ' + part,
                        type: group.type,
                        year: group.year,
                        channels: group.channels.slice(i, i + self.MAX_PER_SUBCATEGORY)
                    });
                    part++;
                }
            } else {
                finalResult.push(group);
            }
        });
        
        console.log('✅ ' + finalResult.length + ' subcategorias criadas (ordem original)');
        
        return finalResult;
    },

    // ========================================
    // ALTERNAR MODO DE ORDENAÇÃO (CÍCLICO)
    // ========================================
    toggleSortMode: function() {
        var currentIndex = this.sortModes.indexOf(this.sortMode);
        var nextIndex = (currentIndex + 1) % this.sortModes.length;
        this.sortMode = this.sortModes[nextIndex];
        
        var modeNames = {
            'none': '📋 Ordenação PADRÃO ativada',
            'alphabetical': '🔤 Ordenação A-Z ativada',
            'year': '📅 Ordenação por ANO ativada'
        };
        
        this.showMessage(modeNames[this.sortMode], 2000);
        
        console.log('🔄 Modo de ordenação alterado para:', this.sortMode);
        
        try {
            localStorage.setItem('channelSortMode', this.sortMode);
        } catch (e) {}
        
        if (AppState.currentView === 'channels') {
            this.updateChannelList();
        }
        
        return this.sortMode;
    },

    nextSortMode: function() {
        return this.toggleSortMode();
    },

    prevSortMode: function() {
        var currentIndex = this.sortModes.indexOf(this.sortMode);
        var prevIndex = (currentIndex - 1 + this.sortModes.length) % this.sortModes.length;
        this.sortMode = this.sortModes[prevIndex];
        
        var modeNames = {
            'none': '📋 Ordenação PADRÃO ativada',
            'alphabetical': '🔤 Ordenação A-Z ativada',
            'year': '📅 Ordenação por ANO ativada'
        };
        
        this.showMessage(modeNames[this.sortMode], 2000);
        
        console.log('🔄 Modo de ordenação alterado para:', this.sortMode);
        
        try {
            localStorage.setItem('channelSortMode', this.sortMode);
        } catch (e) {}
        
        if (AppState.currentView === 'channels') {
            this.updateChannelList();
        }
        
        return this.sortMode;
    },

    setSortMode: function(mode) {
        if (this.sortModes.indexOf(mode) !== -1) {
            this.sortMode = mode;
            try {
                localStorage.setItem('channelSortMode', mode);
            } catch (e) {}
        }
    },

    getSortModeInfo: function() {
        var info = {
            'none': { icon: '📋', text: 'Padrão', fullText: 'Ordem Original' },
            'alphabetical': { icon: '🔤', text: 'A-Z', fullText: 'Alfabética' },
            'year': { icon: '📅', text: 'Ano', fullText: 'Por Ano' }
        };
        return info[this.sortMode] || info['none'];
    },

    // ========================================
    // 🧠 AGRUPAMENTO COM SUBCATEGORIAS
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
        
        try {
            var savedMode = localStorage.getItem('channelSortMode');
            if (this.sortModes.indexOf(savedMode) !== -1) {
                this.sortMode = savedMode;
            }
        } catch (e) {}
        
        window.addEventListener("player-closed", function() {
            self.handleReturnFromPlayer();
        });

        this.messageArea = document.getElementById('messageArea');

        if (typeof SearchModule !== 'undefined') {
            SearchModule.init();
        }

        if (typeof AppState !== 'undefined' && AppState.loadWatchHistory) {
            AppState.loadWatchHistory(function(history) {
                console.log('📺 Continue Assistindo carregado:', history.length, 'itens');
            });
        }

        // Inicializar módulo de favoritos
        if (typeof FavoritesModule !== 'undefined') {
            FavoritesModule.init();
        }

        console.log('✅ ChannelModule inicializado (v7.6 - Com Favoritos)');
        console.log('   Modo de ordenação:', this.sortMode);
        console.log('   Modos disponíveis:', this.sortModes.join(', '));
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
        console.log('   Modo ordenação:', this.sortMode);
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

        // Header com nome da playlist e botão de ordenação
        if (AppState.currentPlaylistName) {
            var header = document.createElement('li');
            header.style.cssText = 'color:#00e676;padding:15px;font-weight:bold;list-style:none;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;';
            
            var titleSpan = document.createElement('span');
            titleSpan.textContent = '📂 Playlist: ' + AppState.currentPlaylistName;
            header.appendChild(titleSpan);
            
            var sortBtn = this.createSortToggleButton();
            header.appendChild(sortBtn);
            
            fragment.appendChild(header);
        }

        // ⭐ FAVORITOS
        var favoritesHeader = this.createFavoritesHeader();
        if (favoritesHeader) {
            fragment.appendChild(favoritesHeader);
        }

        // CONTINUE ASSISTINDO
        var continueWatchingHeader = this.createContinueWatchingHeader();
        if (continueWatchingHeader) {
            fragment.appendChild(continueWatchingHeader);
        }

        // Criar headers de categorias
        var self = this;
        
        var categoryKeys = Object.keys(grouped);
        if (this.sortMode === 'alphabetical') {
            this.sortAlpha(categoryKeys);
        } else if (this.sortMode === 'year') {
            this.sortAlpha(categoryKeys);
        }
        
        categoryKeys.forEach(function(category) {
            var subs = grouped[category];
            var total = subs.reduce(function(a, b) { return a + b.channels.length; }, 0);
            var headerEl = self.createCategoryHeader(category, total, subs);
            fragment.appendChild(headerEl);
        });

        this.channelList.innerHTML = '';
        this.channelList.appendChild(fragment);

        AppState.currentView = 'channels';
        AppState.channelItems = Array.from(document.querySelectorAll('.category-header, #sortToggleBtn'));

        if (typeof SearchModule !== 'undefined') SearchModule.show();
        
        if (AppState.channelItems.length > 0) {
            NavigationModule.setFocusElement(AppState.channelItems[0]);
        }
    },

    // ========================================
    // CRIAR BOTÃO DE ALTERNAR ORDENAÇÃO (COM NAVEGAÇÃO)
    // ========================================
    createSortToggleButton: function() {
        var self = this;
        var container = document.createElement('div');
        container.style.cssText = 'display:flex;align-items:center;gap:0;';
        
        var prevBtn = document.createElement('button');
        prevBtn.className = 'sort-nav-btn';
        prevBtn.tabIndex = 0;
        prevBtn.style.cssText = 'background:#444;color:#fff;border:1px solid #555;padding:8px 10px;border-radius:5px 0 0 5px;cursor:pointer;font-size:14px;transition:all 0.3s ease;';
        prevBtn.innerHTML = '◀';
        prevBtn.title = 'Modo anterior';
        
        prevBtn.onclick = function(e) {
            e.stopPropagation();
            self.prevSortMode();
            self.updateSortButtonDisplay(mainBtn);
        };
        
        prevBtn.onmouseenter = function() {
            prevBtn.style.background = '#555';
            prevBtn.style.borderColor = '#6bff6b';
        };
        
        prevBtn.onmouseleave = function() {
            prevBtn.style.background = '#444';
            prevBtn.style.borderColor = '#555';
        };
        
        prevBtn.onkeydown = function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                prevBtn.click();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                self.prevSortMode();
                self.updateSortButtonDisplay(mainBtn);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                self.nextSortMode();
                self.updateSortButtonDisplay(mainBtn);
            }
        };
        
        var mainBtn = document.createElement('button');
        mainBtn.id = 'sortToggleBtn';
        mainBtn.className = 'sort-main-btn';
        mainBtn.tabIndex = 0;
        mainBtn.style.cssText = 'background:#333;color:#fff;border:1px solid #555;border-left:none;border-right:none;padding:8px 16px;cursor:pointer;font-size:12px;transition:all 0.3s ease;min-width:100px;';
        
        this.updateSortButtonDisplay(mainBtn);
        
        mainBtn.onclick = function(e) {
            e.stopPropagation();
            self.toggleSortMode();
            self.updateSortButtonDisplay(mainBtn);
        };
        
        mainBtn.onmouseenter = function() {
            mainBtn.style.background = '#444';
            mainBtn.style.borderColor = '#6bff6b';
        };
        
        mainBtn.onmouseleave = function() {
            mainBtn.style.background = '#333';
            mainBtn.style.borderColor = '#555';
        };
        
        mainBtn.onkeydown = function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                mainBtn.click();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                self.prevSortMode();
                self.updateSortButtonDisplay(mainBtn);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                self.nextSortMode();
                self.updateSortButtonDisplay(mainBtn);
            }
        };
        
        var nextBtn = document.createElement('button');
        nextBtn.className = 'sort-nav-btn';
        nextBtn.tabIndex = 0;
        nextBtn.style.cssText = 'background:#444;color:#fff;border:1px solid #555;padding:8px 10px;border-radius:0 5px 5px 0;cursor:pointer;font-size:14px;transition:all 0.3s ease;';
        nextBtn.innerHTML = '▶';
        nextBtn.title = 'Próximo modo';
        
        nextBtn.onclick = function(e) {
            e.stopPropagation();
            self.nextSortMode();
            self.updateSortButtonDisplay(mainBtn);
        };
        
        nextBtn.onmouseenter = function() {
            nextBtn.style.background = '#555';
            nextBtn.style.borderColor = '#6bff6b';
        };
        
        nextBtn.onmouseleave = function() {
            nextBtn.style.background = '#444';
            nextBtn.style.borderColor = '#555';
        };
        
        nextBtn.onkeydown = function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                nextBtn.click();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                self.prevSortMode();
                self.updateSortButtonDisplay(mainBtn);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                self.nextSortMode();
                self.updateSortButtonDisplay(mainBtn);
            }
        };
        
        container.appendChild(prevBtn);
        container.appendChild(mainBtn);
        container.appendChild(nextBtn);
        
        return container;
    },

    updateSortButtonDisplay: function(btn) {
        if (!btn) {
            btn = document.getElementById('sortToggleBtn');
        }
        if (btn) {
            var info = this.getSortModeInfo();
            btn.innerHTML = info.icon + ' ' + info.text;
            btn.title = 'Ordenação: ' + info.fullText + ' (clique para alternar)';
        }
    },

    // ========================================
    // ⭐ CRIAR HEADER DE FAVORITOS
    // ========================================
    createFavoritesHeader: function() {
        var self = this;
        
        // Obter favoritos
        var favorites = [];
        if (typeof FavoritesModule !== 'undefined') {
            favorites = FavoritesModule.getForCurrentPlaylist();
        }
        
        if (favorites.length === 0) {
            console.log('⭐ Favoritos: Nenhum favorito para esta playlist');
            return null;
        }
        
        console.log('⭐ Favoritos:', favorites.length, 'itens');
        
        var li = document.createElement('li');
        li.className = 'category-header favorites-header';
        li.tabIndex = 0;
        li.dataset.group = '__favorites__';

        li.innerHTML = '<strong>⭐ Favoritos (' + favorites.length + ')</strong>';
        
        li.style.cssText = 'color:#ffd700;padding:15px 10px;border-bottom:2px solid #ffd700;cursor:pointer;background:linear-gradient(45deg,#2a2a00,#3a3a00);border-radius:5px;margin-bottom:5px;list-style:none;';

        li.onclick = function() {
            if (AppState.channelItems) {
                AppState.lastCategoryIndex = AppState.channelItems.indexOf(li);
            }
            self.showFavoritesOverlay(favorites);
        };

        li.onkeydown = function(e) {
            if (e.key === 'Enter') li.click();
        };

        li.onmouseenter = function() {
            li.style.background = 'linear-gradient(45deg,#3a3a00,#4a4a00)';
        };
        li.onmouseleave = function() {
            li.style.background = 'linear-gradient(45deg,#2a2a00,#3a3a00)';
        };

        return li;
    },

    // ========================================
    // ⭐ OVERLAY DE FAVORITOS
    // ========================================
    showFavoritesOverlay: function(favorites) {
        var self = this;
        var overlay = this.createOverlayElement();
        var title = document.getElementById('overlayTitle');
        var grid = document.getElementById('overlayChannelGrid');
        var breadcrumb = document.getElementById('overlayBreadcrumb');
        var backBtn = document.getElementById('overlayBackBtn');

        breadcrumb.innerHTML = '<span style="color:#ffd700;">⭐ Favoritos</span>';
        backBtn.style.display = 'none';

        title.textContent = '⭐ Meus Favoritos';
        grid.innerHTML = '';
        AppState.overlayChannels = [];
        AppState.currentCategory = '__favorites__';
        AppState.currentSubcategories = null;

        if (!favorites || favorites.length === 0) {
            var emptyMsg = document.createElement('div');
            emptyMsg.style.cssText = 'grid-column:1/-1;text-align:center;padding:40px;color:#888;';
            emptyMsg.innerHTML = '<div style="font-size:3em;margin-bottom:20px;">⭐</div>' +
                '<div style="font-size:1.2em;">Nenhum favorito ainda</div>' +
                '<div style="font-size:0.9em;margin-top:10px;color:#666;">Pressione ⭐ em um canal para adicionar aos favoritos</div>';
            grid.appendChild(emptyMsg);
        } else {
            favorites.forEach(function(fav, index) {
                var card = self.createFavoriteCard(fav, index);
                grid.appendChild(card);
                AppState.overlayChannels.push(card);
            });

            // Botão para limpar favoritos
            var clearBtn = document.createElement('div');
            clearBtn.className = 'overlay-channel-item clear-favorites-btn';
            clearBtn.tabIndex = 0;
            clearBtn.style.cssText = 'background:#3a1a1a;border:2px solid #ff4444;border-radius:10px;padding:20px;cursor:pointer;transition:all 0.3s ease;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80px;';
            clearBtn.innerHTML = '<div style="font-size:1.5em;margin-bottom:10px;">🗑️</div><div style="color:#ff4444;font-weight:bold;">Limpar Favoritos</div>';
            
            clearBtn.onclick = function() {
                if (confirm('Remover todos os favoritos?')) {
                    if (typeof FavoritesModule !== 'undefined') {
                        FavoritesModule.clearAll();
                    }
                    self.hideOverlay();
                    self.updateChannelList();
                    self.showMessage('🗑️ Favoritos removidos', 2000);
                }
            };
            
            clearBtn.onkeydown = function(e) {
                if (e.key === 'Enter') clearBtn.click();
            };
            
            clearBtn.onmouseenter = function() {
                clearBtn.style.borderColor = '#ff6666';
                clearBtn.style.background = '#4a1a1a';
            };
            
            clearBtn.onmouseleave = function() {
                clearBtn.style.borderColor = '#ff4444';
                clearBtn.style.background = '#3a1a1a';
            };
            
            grid.appendChild(clearBtn);
            AppState.overlayChannels.push(clearBtn);
        }

        overlay.style.display = 'block';
        AppState.currentView = 'overlay-favorites';
        this.setOverlayFocus(0);

        this.showMessage('⭐ ' + favorites.length + ' favoritos', 2000);
    },

    // ========================================
    // ⭐ CRIAR CARD DE FAVORITO
    // ========================================
    createFavoriteCard: function(favorite, index) {
        var self = this;
        var div = document.createElement('div');
        div.className = 'overlay-channel-item favorite-card';
        div.tabIndex = 0;
        div.dataset.index = index;
        div.dataset.url = favorite.url;

        var timeAgo = this.formatTimeAgo(favorite.addedAt);

        div.style.cssText = 'background:linear-gradient(135deg,#2a2a1a 0%,#1a1a0a 100%);border:2px solid #ffd700;border-radius:10px;padding:20px;cursor:pointer;transition:all 0.3s ease;display:flex;flex-direction:column;min-height:100px;position:relative;';

        var removeBtn = '<div class="remove-fav-btn" style="position:absolute;top:10px;right:10px;width:24px;height:24px;background:#ff4444;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;opacity:0.7;transition:opacity 0.2s;" title="Remover dos favoritos">✕</div>';

        div.innerHTML = 
            removeBtn +
            '<div style="display:flex;align-items:center;margin-bottom:10px;padding-right:30px;">' +
                '<span style="font-size:1.5em;margin-right:10px;">⭐</span>' +
                '<span style="font-weight:bold;font-size:1.1em;color:#ffd700;">' + favorite.name + '</span>' +
            '</div>' +
            '<div style="font-size:0.85em;color:#888;margin-bottom:5px;">📁 ' + (favorite.group || 'Sem categoria') + '</div>' +
            (favorite.playlistName ? '<div style="font-size:0.8em;color:#666;margin-bottom:5px;">📋 ' + favorite.playlistName + '</div>' : '') +
            '<div style="font-size:0.75em;color:#555;margin-top:auto;">➕ ' + timeAgo + '</div>';

        // Evento de remover
        var removeBtnEl = div.querySelector('.remove-fav-btn');
        if (removeBtnEl) {
            removeBtnEl.onclick = function(e) {
                e.stopPropagation();
                if (typeof FavoritesModule !== 'undefined') {
                    FavoritesModule.remove(favorite.url);
                    self.showMessage('❌ Removido dos favoritos', 2000);
                    var updatedFavorites = FavoritesModule.getForCurrentPlaylist();
                    if (updatedFavorites.length === 0) {
                        self.hideOverlay();
                        self.updateChannelList();
                    } else {
                        self.showFavoritesOverlay(updatedFavorites);
                    }
                }
            };
            
            removeBtnEl.onmouseenter = function() {
                removeBtnEl.style.opacity = '1';
                removeBtnEl.style.transform = 'scale(1.1)';
            };
            
            removeBtnEl.onmouseleave = function() {
                removeBtnEl.style.opacity = '0.7';
                removeBtnEl.style.transform = 'scale(1)';
            };
        }

        // Evento de abrir canal
        div.onclick = function(e) {
            if (e.target.classList.contains('remove-fav-btn')) return;
            
            var channel = {
                url: favorite.url,
                name: favorite.name,
                group: favorite.group,
                logo: favorite.logo
            };
            
            self.openChannelWithPath(channel, {
                category: '__favorites__',
                subcategory: 'Favoritos',
                subcategoryIndex: 0,
                channelIndex: index
            });
        };

        div.onkeydown = function(e) {
            if (e.key === 'Enter') {
                div.click();
            } else if (e.key === 'Delete' || e.key === 'd' || e.key === 'D') {
                if (typeof FavoritesModule !== 'undefined') {
                    FavoritesModule.remove(favorite.url);
                    self.showMessage('❌ Removido dos favoritos', 2000);
                    var updatedFavorites = FavoritesModule.getForCurrentPlaylist();
                    if (updatedFavorites.length === 0) {
                        self.hideOverlay();
                        self.updateChannelList();
                    } else {
                        self.showFavoritesOverlay(updatedFavorites);
                    }
                }
            }
        };

        div.onmouseenter = function() {
            div.style.borderColor = '#ffe066';
            div.style.background = 'linear-gradient(135deg,#3a3a2a 0%,#2a2a1a 100%)';
            div.style.transform = 'scale(1.02)';
        };

        div.onmouseleave = function() {
            if (!div.classList.contains('focused')) {
                div.style.borderColor = '#ffd700';
                div.style.background = 'linear-gradient(135deg,#2a2a1a 0%,#1a1a0a 100%)';
                div.style.transform = 'scale(1)';
            }
        };

        return div;
    },

    // ========================================
    // ⭐ ADICIONAR/REMOVER FAVORITO DE UM CANAL
    // ========================================
    toggleFavorite: function(channel) {
        if (typeof FavoritesModule === 'undefined') {
            this.showMessage('⚠️ Sistema de favoritos não disponível', 2000);
            return false;
        }
        
        var wasFavorite = FavoritesModule.isFavorite(channel.url);
        FavoritesModule.toggle(channel);
        
        if (wasFavorite) {
            this.showMessage('❌ Removido dos favoritos: ' + channel.name, 2000);
        } else {
            this.showMessage('⭐ Adicionado aos favoritos: ' + channel.name, 2000);
        }
        
        return !wasFavorite;
    },

    // ========================================
    // CRIAR HEADER "CONTINUE ASSISTINDO"
    // ========================================
    createContinueWatchingHeader: function() {
        var self = this;
        
        var history = [];
        if (typeof AppState !== 'undefined' && AppState.getWatchHistory) {
            history = AppState.getWatchHistory();
        }
        
        var currentPlaylistUrl = AppState.currentPlaylistUrl || '';
        var currentPlaylistName = AppState.currentPlaylistName || '';
        
        var relevantHistory = history.filter(function(item) {
            if (!item.path || !item.path.playlistUrl) return true;
            return item.path.playlistUrl === currentPlaylistUrl || 
                   item.path.playlistName === currentPlaylistName;
        });
        
        if (relevantHistory.length === 0) {
            console.log('📺 Continue Assistindo: Nenhum item para esta playlist');
            return null;
        }
        
        console.log('📺 Continue Assistindo:', relevantHistory.length, 'itens');
        
        var li = document.createElement('li');
        li.className = 'category-header continue-watching-header';
        li.tabIndex = 0;
        li.dataset.group = '__continue_watching__';

        li.innerHTML = '<strong>⏯️ Continue Assistindo (' + relevantHistory.length + ')</strong>';
        
        li.style.cssText = 'color:#ff9800;padding:15px 10px;border-bottom:2px solid #ff9800;cursor:pointer;background:linear-gradient(45deg,#2a1a00,#3a2a00);border-radius:5px;margin-bottom:5px;list-style:none;';

        li.onclick = function() {
            if (AppState.channelItems) {
                AppState.lastCategoryIndex = AppState.channelItems.indexOf(li);
            }
            self.showContinueWatchingOverlay(relevantHistory);
        };

        li.onkeydown = function(e) {
            if (e.key === 'Enter') li.click();
        };

        li.onmouseenter = function() {
            li.style.background = 'linear-gradient(45deg,#3a2a00,#4a3a00)';
        };
        li.onmouseleave = function() {
            li.style.background = 'linear-gradient(45deg,#2a1a00,#3a2a00)';
        };

        return li;
    },

    // ========================================
    // OVERLAY DO "CONTINUE ASSISTINDO"
    // ========================================
    showContinueWatchingOverlay: function(historyItems) {
        var self = this;
        var overlay = this.createOverlayElement();
        var title = document.getElementById('overlayTitle');
        var grid = document.getElementById('overlayChannelGrid');
        var breadcrumb = document.getElementById('overlayBreadcrumb');
        var backBtn = document.getElementById('overlayBackBtn');

        breadcrumb.innerHTML = '<span style="color:#ff9800;">⏯️ Continue Assistindo</span>';
        backBtn.style.display = 'none';

        title.textContent = '⏯️ Continue Assistindo';
        grid.innerHTML = '';
        AppState.overlayChannels = [];
        AppState.currentCategory = '__continue_watching__';
        AppState.currentSubcategories = null;

        historyItems.forEach(function(item, index) {
            var card = self.createContinueWatchingCard(item, index);
            grid.appendChild(card);
            AppState.overlayChannels.push(card);
        });

        // Botão para limpar histórico
        var clearBtn = document.createElement('div');
        clearBtn.className = 'overlay-channel-item clear-history-btn';
        clearBtn.tabIndex = 0;
        clearBtn.style.cssText = 'background:#3a1a1a;border:2px solid #ff4444;border-radius:10px;padding:20px;cursor:pointer;transition:all 0.3s ease;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80px;';
        clearBtn.innerHTML = '<div style="font-size:1.5em;margin-bottom:10px;">🗑️</div><div style="color:#ff4444;font-weight:bold;">Limpar Histórico</div>';
        
        clearBtn.onclick = function() {
            if (confirm('Limpar todo o histórico de "Continue Assistindo"?')) {
                if (typeof AppState !== 'undefined' && AppState.clearWatchHistory) {
                    AppState.clearWatchHistory();
                }
                self.hideOverlay();
                self.updateChannelList();
                self.showMessage('🗑️ Histórico limpo', 2000);
            }
        };
        
        clearBtn.onkeydown = function(e) {
            if (e.key === 'Enter') clearBtn.click();
        };
        
        grid.appendChild(clearBtn);
        AppState.overlayChannels.push(clearBtn);

        overlay.style.display = 'block';
        AppState.currentView = 'overlay-continue-watching';
        this.setOverlayFocus(0);

        this.showMessage('⏯️ ' + historyItems.length + ' canais no histórico', 2000);
    },

    // ========================================
    // CRIAR CARD DO "CONTINUE ASSISTINDO"
    // ========================================
    createContinueWatchingCard: function(historyItem, index) {
        var self = this;
        var div = document.createElement('div');
        div.className = 'overlay-channel-item continue-watching-card';
        div.tabIndex = 0;
        div.dataset.index = index;
        div.dataset.url = historyItem.channel.url;

        var timeAgo = this.formatTimeAgo(historyItem.timestamp);
        
        var pathText = '';
        if (historyItem.path) {
            var parts = [];
            if (historyItem.path.category) parts.push(historyItem.path.category);
            if (historyItem.path.subcategory) parts.push(historyItem.path.subcategory);
            pathText = parts.join(' › ');
        }

        div.style.cssText = 'background:linear-gradient(135deg,#2a2a1a 0%,#1a1a0a 100%);border:2px solid #ff9800;border-radius:10px;padding:20px;cursor:pointer;transition:all 0.3s ease;display:flex;flex-direction:column;min-height:100px;';

        div.innerHTML = 
            '<div style="display:flex;align-items:center;margin-bottom:10px;">' +
                '<span style="font-size:1.5em;margin-right:10px;">▶️</span>' +
                '<span style="font-weight:bold;font-size:1.1em;color:#ff9800;">' + historyItem.channel.name + '</span>' +
            '</div>' +
            '<div style="font-size:0.85em;color:#888;margin-bottom:5px;">📁 ' + (historyItem.channel.group || 'Sem categoria') + '</div>' +
            (pathText ? '<div style="font-size:0.8em;color:#666;margin-bottom:5px;">📍 ' + pathText + '</div>' : '') +
            '<div style="font-size:0.75em;color:#555;margin-top:auto;">🕐 ' + timeAgo + '</div>';

        div.onclick = function() {
            self.navigateToHistoryChannel(historyItem, index);
        };

        div.onkeydown = function(e) {
            if (e.key === 'Enter') {
                self.navigateToHistoryChannel(historyItem, index);
            }
        };

        div.onmouseenter = function() {
            div.style.borderColor = '#ffb74d';
            div.style.background = 'linear-gradient(135deg,#3a3a2a 0%,#2a2a1a 100%)';
            div.style.transform = 'scale(1.02)';
        };

        div.onmouseleave = function() {
            if (!div.classList.contains('focused')) {
                div.style.borderColor = '#ff9800';
                div.style.background = 'linear-gradient(135deg,#2a2a1a 0%,#1a1a0a 100%)';
                div.style.transform = 'scale(1)';
            }
        };

        return div;
    },

    // ========================================
    // NAVEGAR ATÉ O CANAL DO HISTÓRICO
    // ========================================
    navigateToHistoryChannel: function(historyItem, index) {
        var self = this;
        
        console.log('╔═══════════════════════════════════════╗');
        console.log('📍 Navegando até canal do histórico');
        console.log('   Canal:', historyItem.channel.name);
        console.log('   Categoria:', historyItem.path ? historyItem.path.category : 'N/A');
        console.log('   Subcategoria:', historyItem.path ? historyItem.path.subcategory : 'N/A');
        console.log('╚═══════════════════════════════════════╝');

        var channel = this.findChannelInCurrentPlaylist(historyItem.channel.url);
        
        if (!channel) {
            console.log('⚠️ Canal não encontrado na playlist atual');
            this.showMessage('⚠️ Canal não encontrado nesta playlist', 3000);
            return;
        }

        var overlay = document.getElementById('channelOverlay');
        if (overlay) overlay.style.display = 'none';

        var category = historyItem.path ? historyItem.path.category : (channel.group || 'Outros');
        var subcategoryName = historyItem.path ? historyItem.path.subcategory : null;

        this.showLoading('Navegando até ' + channel.name);

        var grouped = this.groupWithSubcategories(AppState.currentPlaylist || []);
        var categorySubcategories = grouped[category];

        if (!categorySubcategories) {
            category = channel.group || 'Outros';
            categorySubcategories = grouped[category];
        }

        if (!categorySubcategories) {
            console.log('⚠️ Categoria não encontrada, abrindo canal diretamente');
            this.hideLoading();
            this.openChannelWithPath(channel, historyItem.path);
            return;
        }

        AppState.currentCategory = category;
        AppState.currentSubcategories = categorySubcategories;

        var targetSubcategory = null;
        var targetSubcategoryIndex = -1;
        var targetChannelIndex = -1;

        for (var i = 0; i < categorySubcategories.length; i++) {
            var sub = categorySubcategories[i];
            
            if (subcategoryName && sub.name === subcategoryName) {
                targetSubcategory = sub;
                targetSubcategoryIndex = i;
            }
            
            for (var j = 0; j < sub.channels.length; j++) {
                if (sub.channels[j].url === channel.url) {
                    if (!targetSubcategory) {
                        targetSubcategory = sub;
                        targetSubcategoryIndex = i;
                    }
                    targetChannelIndex = j;
                    break;
                }
            }
            
            if (targetSubcategory && targetChannelIndex >= 0) break;
        }

        this.hideLoading();

        if (!targetSubcategory) {
            console.log('⚠️ Subcategoria não encontrada, abrindo canal diretamente');
            this.openChannelWithPath(channel, historyItem.path);
            return;
        }

        this.showSubcategoryOverlay(category, categorySubcategories);

        setTimeout(function() {
            if (targetSubcategoryIndex >= 0) {
                AppState.lastSubCategoryIndex = targetSubcategoryIndex;
                
                self.showChannelsOverlay(targetSubcategory, targetSubcategoryIndex);
                
                setTimeout(function() {
                    if (targetChannelIndex >= 0) {
                        self.setOverlayFocus(targetChannelIndex);
                        AppState.lastChannelIndex = targetChannelIndex;
                        
                        setTimeout(function() {
                            self.openChannelWithPath(channel, historyItem.path);
                        }, 300);
                    }
                }, 300);
            }
        }, 300);
    },

    // ========================================
    // ENCONTRAR CANAL NA PLAYLIST ATUAL
    // ========================================
    findChannelInCurrentPlaylist: function(url) {
        if (!AppState.currentPlaylist) return null;
        
        for (var i = 0; i < AppState.currentPlaylist.length; i++) {
            if (AppState.currentPlaylist[i].url === url) {
                return AppState.currentPlaylist[i];
            }
        }
        return null;
    },

    // ========================================
    // FORMATAR TEMPO DECORRIDO
    // ========================================
    formatTimeAgo: function(timestamp) {
        if (!timestamp) return 'Desconhecido';
        
        var now = Date.now();
        var diff = now - timestamp;
        
        var seconds = Math.floor(diff / 1000);
        var minutes = Math.floor(seconds / 60);
        var hours = Math.floor(minutes / 60);
        var days = Math.floor(hours / 24);
        
        if (days > 0) return 'Há ' + days + ' dia' + (days > 1 ? 's' : '');
        if (hours > 0) return 'Há ' + hours + ' hora' + (hours > 1 ? 's' : '');
        if (minutes > 0) return 'Há ' + minutes + ' minuto' + (minutes > 1 ? 's' : '');
        return 'Agora mesmo';
    },

    // ========================================
    // ATUALIZAR LISTA A PARTIR DO ÍNDICE
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
            header.style.cssText = 'color:#00e676;padding:15px;font-weight:bold;list-style:none;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;';
            
            var titleSpan = document.createElement('span');
            titleSpan.textContent = '📂 Playlist: ' + AppState.currentPlaylistName;
            header.appendChild(titleSpan);
            
            var sortBtn = this.createSortToggleButton();
            header.appendChild(sortBtn);
            
            fragment.appendChild(header);
        }

        // ⭐ FAVORITOS
        var favoritesHeader = this.createFavoritesHeader();
        if (favoritesHeader) {
            fragment.appendChild(favoritesHeader);
        }

        // CONTINUE ASSISTINDO
        var continueWatchingHeader = this.createContinueWatchingHeader();
        if (continueWatchingHeader) {
            fragment.appendChild(continueWatchingHeader);
        }

        var self = this;
        
        var sortedCategories = categories.slice();
        if (this.sortMode === 'alphabetical') {
            this.sortAlpha(sortedCategories, 'name');
        } else if (this.sortMode === 'year') {
            this.sortAlpha(sortedCategories, 'name');
        }
        
        sortedCategories.forEach(function(category) {
            var headerEl = self.createCategoryHeaderFromIndex(category.name, category.count);
            fragment.appendChild(headerEl);
        });

        this.channelList.innerHTML = '';
        this.channelList.appendChild(fragment);

        AppState.currentView = 'channels';
        AppState.channelItems = Array.from(document.querySelectorAll('.category-header, #sortToggleBtn'));

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
    // CRIAR HEADER DE CATEGORIA (DO ÍNDICE)
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
    // CARREGAR E MOSTRAR CATEGORIA DO ÍNDICE
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
    // 📂 OVERLAY DE SUBCATEGORIAS
    // ========================================
    showSubcategoryOverlay: function(categoryName, subcategories) {
        var self = this;
        var overlay = this.createOverlayElement();
        var title = document.getElementById('overlayTitle');
        var grid = document.getElementById('overlayChannelGrid');
        var breadcrumb = document.getElementById('overlayBreadcrumb');
        var backBtn = document.getElementById('overlayBackBtn');

        var sortInfo = this.getSortModeInfo();
        breadcrumb.innerHTML = '<span style="color:#aaa;">📁 ' + categoryName + ' ' + sortInfo.icon + '</span>';
        backBtn.style.display = 'none';

        title.textContent = '📂 ' + categoryName + ' - Selecione';
        grid.innerHTML = '';
        AppState.overlayChannels = [];
        AppState.currentCategory = categoryName;
        AppState.currentSubcategories = subcategories;

        var normalSubcategories = [];
        var singleChannels = [];

        subcategories.forEach(function(sub) {
            if (sub.channels.length < self.MIN_CHANNELS_FOR_SUBCATEGORY) {
                sub.channels.forEach(function(ch) {
                    singleChannels.push({
                        channel: ch,
                        originalSubName: sub.name,
                        type: sub.type,
                        year: sub.year
                    });
                });
            } else {
                normalSubcategories.push(sub);
            }
        });

        var index = 0;

        normalSubcategories.forEach(function(sub) {
            var card = self.createSubcategoryCard(sub, index);
            grid.appendChild(card);
            AppState.overlayChannels.push(card);
            index++;
        });

        singleChannels.forEach(function(item) {
            var card = self.createDirectChannelCard(item.channel, index, item.originalSubName);
            grid.appendChild(card);
            AppState.overlayChannels.push(card);
            index++;
        });

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
    // CRIAR CARD DE CANAL DIRETO
    // ========================================
    createDirectChannelCard: function(channel, index, originalSubName) {
        var self = this;
        var div = document.createElement('div');
        div.className = 'overlay-channel-item direct-channel-card';
        div.tabIndex = 0;
        div.dataset.index = index;
        div.dataset.url = channel.url;
        div.dataset.isDirect = 'true';

        var isMP4 = channel.url && channel.url.toLowerCase().indexOf('.mp4') !== -1;
        var mp4Badge = isMP4 ? '<span style="background:#ffeb3b;color:#000;padding:2px 6px;border-radius:3px;font-size:0.7em;margin-left:8px;">MP4</span>' : '';

        var year = this.extractYear(channel.name);
        var yearBadge = year ? '<span style="background:#667eea;color:#fff;padding:2px 6px;border-radius:3px;font-size:0.7em;margin-left:8px;">' + year + '</span>' : '';

        // Verificar se é favorito
        var isFavorite = false;
        if (typeof FavoritesModule !== 'undefined') {
            isFavorite = FavoritesModule.isFavorite(channel.url);
        }
        var favIcon = isFavorite ? '⭐' : '☆';
        var favColor = isFavorite ? '#ffd700' : '#666';

        div.style.cssText = 'background:linear-gradient(135deg,#1a2a1a 0%,#0a1a0a 100%);border:2px solid #4a4;border-radius:10px;padding:20px;cursor:pointer;transition:all 0.3s ease;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:120px;position:relative;';

        div.innerHTML = '<div class="fav-toggle" style="position:absolute;top:10px;right:10px;font-size:1.3em;cursor:pointer;color:' + favColor + ';padding:5px;transition:transform 0.2s;" title="' + (isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos') + '">' + favIcon + '</div>' +
            '<div style="font-size:1.8em;margin-bottom:10px;">▶️</div>' +
            '<div style="font-weight:bold;font-size:1em;color:#6bff6b;text-align:center;margin-bottom:4px;">' + channel.name + mp4Badge + yearBadge + '</div>' +
            '<div style="font-size:0.8em;color:#888;text-align:center;">' + (channel.group || originalSubName || 'Canal') + '</div>';

        // Evento do botão de favorito
        var favToggle = div.querySelector('.fav-toggle');
        if (favToggle) {
            favToggle.onclick = function(e) {
                e.stopPropagation();
                var nowFavorite = self.toggleFavorite(channel);
                favToggle.innerHTML = nowFavorite ? '⭐' : '☆';
                favToggle.style.color = nowFavorite ? '#ffd700' : '#666';
                favToggle.title = nowFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
            };
            
            favToggle.onmouseenter = function() {
                favToggle.style.transform = 'scale(1.3)';
            };
            
            favToggle.onmouseleave = function() {
                favToggle.style.transform = 'scale(1)';
            };
        }

        div.onclick = function(e) {
            if (e.target.classList.contains('fav-toggle')) return;
            
            AppState.lastSubCategoryIndex = index;
            self.openChannelWithPath(channel, {
                category: AppState.currentCategory,
                subcategory: originalSubName,
                subcategoryIndex: index,
                channelIndex: 0
            });
        };

        div.onkeydown = function(e) {
            if (e.key === 'Enter') {
                AppState.lastSubCategoryIndex = index;
                self.openChannelWithPath(channel, {
                    category: AppState.currentCategory,
                    subcategory: originalSubName,
                    subcategoryIndex: index,
                    channelIndex: 0
                });
            } else if (e.key === 'f' || e.key === 'F') {
                var nowFavorite = self.toggleFavorite(channel);
                if (favToggle) {
                    favToggle.innerHTML = nowFavorite ? '⭐' : '☆';
                    favToggle.style.color = nowFavorite ? '#ffd700' : '#666';
                }
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
        } else if (subcategory.type === 'year-group') {
            emoji = '📅';
        }

        var yearInfo = '';
        if (subcategory.year && subcategory.type !== 'year-group') {
            yearInfo = '<div style="font-size:0.8em;color:#667eea;margin-top:5px;">📅 ' + subcategory.year + '</div>';
        }

        div.style.cssText = 'background:linear-gradient(135deg,#2a2a2a 0%,#1a1a1a 100%);border:2px solid #444;border-radius:10px;padding:20px;cursor:pointer;transition:all 0.3s ease;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:120px;';

        div.innerHTML = '<div style="font-size:2em;margin-bottom:10px;">' + emoji + '</div>' +
            '<div style="font-weight:bold;font-size:1.1em;color:#6bff6b;text-align:center;margin-bottom:8px;">' + subcategory.name + '</div>' +
            '<div style="font-size:0.9em;color:#aaa;">' + subcategory.channels.length + ' ' + (subcategory.channels.length === 1 ? 'canal' : 'canais') + '</div>' +
            yearInfo;

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
    // 📺 OVERLAY DE CANAIS
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
        AppState.currentSubcategoryName = subcategory.name;

        var channelsToShow = subcategory.channels.slice();
        
        if (subcategory.type === 'series' || subcategory.type === 'series-season') {
            channelsToShow = this.sortByEpisode(channelsToShow);
        } else if (this.sortMode === 'alphabetical') {
            this.sortAlpha(channelsToShow, 'name');
        } else if (this.sortMode === 'year') {
            this.sortByYear(channelsToShow, 'name');
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

        var year = this.extractYear(channel.name);
        var yearBadge = year ? '<span style="background:#667eea;color:#fff;padding:2px 6px;border-radius:3px;font-size:0.7em;margin-left:8px;">' + year + '</span>' : '';

        // Verificar se é favorito
        var isFavorite = false;
        if (typeof FavoritesModule !== 'undefined') {
            isFavorite = FavoritesModule.isFavorite(channel.url);
        }
        var favIcon = isFavorite ? '⭐' : '☆';
        var favColor = isFavorite ? '#ffd700' : '#666';

        div.style.cssText = 'background:#2a2a2a;border:2px solid #444;border-radius:8px;padding:15px;cursor:pointer;transition:all 0.3s ease;color:white;position:relative;';

        div.innerHTML = 
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
                '<div style="flex:1;">' +
                    '<div style="font-weight:bold;margin-bottom:5px;color:#6bff6b;display:flex;align-items:center;flex-wrap:wrap;">▶️ ' + channel.name + ' ' + mp4Badge + yearBadge + '</div>' +
                    '<div style="font-size:0.8em;color:#aaa;">' + (channel.group || 'Sem categoria') + '</div>' +
                '</div>' +
                '<div class="fav-toggle" style="font-size:1.5em;cursor:pointer;color:' + favColor + ';padding:5px;transition:transform 0.2s;" title="' + (isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos') + '">' + favIcon + '</div>' +
            '</div>';

        // Evento do botão de favorito
        var favToggle = div.querySelector('.fav-toggle');
        if (favToggle) {
            favToggle.onclick = function(e) {
                e.stopPropagation();
                var nowFavorite = self.toggleFavorite(channel);
                favToggle.innerHTML = nowFavorite ? '⭐' : '☆';
                favToggle.style.color = nowFavorite ? '#ffd700' : '#666';
                favToggle.title = nowFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
            };
            
            favToggle.onmouseenter = function() {
                favToggle.style.transform = 'scale(1.3)';
            };
            
            favToggle.onmouseleave = function() {
                favToggle.style.transform = 'scale(1)';
            };
        }

        div.onclick = function(e) {
            if (e.target.classList.contains('fav-toggle')) return;
            
            AppState.lastChannelIndex = chIndex;
            self.openChannelWithPath(channel, {
                category: AppState.currentCategory,
                subcategory: AppState.currentSubcategoryName,
                subcategoryIndex: subIndex,
                channelIndex: chIndex
            });
        };
        
        div.onkeydown = function(e) {
            if (e.key === 'Enter') {
                AppState.lastChannelIndex = chIndex;
                self.openChannelWithPath(channel, {
                    category: AppState.currentCategory,
                    subcategory: AppState.currentSubcategoryName,
                    subcategoryIndex: subIndex,
                    channelIndex: chIndex
                });
            } else if (e.key === 'f' || e.key === 'F') {
                var nowFavorite = self.toggleFavorite(channel);
                if (favToggle) {
                    favToggle.innerHTML = nowFavorite ? '⭐' : '☆';
                    favToggle.style.color = nowFavorite ? '#ffd700' : '#666';
                }
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
    // ABRIR CANAL COM CAMINHO (SALVA NO HISTÓRICO)
    // ========================================
    openChannelWithPath: function(channel, pathInfo) {
        var fullPath = {
            playlistName: AppState.currentPlaylistName || '',
            playlistUrl: AppState.currentPlaylistUrl || '',
            category: pathInfo.category || '',
            subcategory: pathInfo.subcategory || '',
            subcategoryIndex: pathInfo.subcategoryIndex || 0,
            channelIndex: pathInfo.channelIndex || 0
        };
        
        console.log('▶️ Abrindo canal com caminho:', channel.name);
        console.log('   Path:', fullPath);
        
        if (typeof AppState !== 'undefined' && AppState.addToWatchHistory) {
            AppState.addToWatchHistory(channel, fullPath);
        }
        
        this.openChannel(channel);
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
            
            var focusIndex = AppState.lastOverlayFocusIndex >= 0 ? AppState.lastOverlayFocusIndex : AppState.overlayFocusIndex;
            
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
                el.style.borderColor = '#4a4';
                el.style.background = 'linear-gradient(135deg,#1a2a1a 0%,#0a1a0a 100%)';
                el.style.transform = 'scale(1)';
            } else if (el.classList.contains('continue-watching-card')) {
                el.style.borderColor = '#ff9800';
                el.style.background = 'linear-gradient(135deg,#2a2a1a 0%,#1a1a0a 100%)';
                el.style.transform = 'scale(1)';
            } else if (el.classList.contains('favorite-card')) {
                el.style.borderColor = '#ffd700';
                el.style.background = 'linear-gradient(135deg,#2a2a1a 0%,#1a1a0a 100%)';
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
        } else if (el.classList.contains('continue-watching-card')) {
            el.style.borderColor = '#ffb74d';
            el.style.background = 'linear-gradient(135deg,#3a3a2a 0%,#2a2a1a 100%)';
            el.style.transform = 'scale(1.02)';
        } else if (el.classList.contains('favorite-card')) {
            el.style.borderColor = '#ffe066';
            el.style.background = 'linear-gradient(135deg,#3a3a2a 0%,#2a2a1a 100%)';
            el.style.transform = 'scale(1.02)';
        } else if (el.classList.contains('clear-history-btn') || el.classList.contains('clear-favorites-btn')) {
            el.style.borderColor = '#ff6666';
            el.style.background = '#4a1a1a';
            el.style.transform = 'scale(1.02)';
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
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:15px;border-bottom:2px solid #333;flex-wrap:wrap;gap:10px;">' +
                '<h2 id="overlayTitle" style="color:#6bff6b;margin:0;font-size:1.5em;"></h2>' +
                '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
                    '<div id="overlaySortContainer"></div>' +
                    '<button id="overlayBackBtn" tabindex="0" style="background:#667eea;color:white;border:none;padding:8px 16px;border-radius:5px;cursor:pointer;font-size:14px;display:none;">⬅️ Voltar</button>' +
                    '<button id="overlayCloseBtn" tabindex="0" style="background:#ff4444;color:white;border:none;padding:8px 16px;border-radius:5px;cursor:pointer;font-size:14px;">✕ Fechar</button>' +
                '</div>' +
            '</div>' +
            '<div id="overlayChannelGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:15px;max-height:65vh;overflow-y:auto;padding:10px;"></div>' +
        '</div>';

        document.body.appendChild(o);
        
        document.getElementById('overlayCloseBtn').onclick = function() {
            self.hideOverlay();
        };
        
        var sortContainer = document.getElementById('overlaySortContainer');
        var sortBtnGroup = this.createOverlaySortButton();
        sortContainer.appendChild(sortBtnGroup);
        
        return o;
    },

    // Criar botão de ordenação para o overlay (com navegação)
    createOverlaySortButton: function() {
        var self = this;
        var container = document.createElement('div');
        container.style.cssText = 'display:flex;align-items:center;gap:0;';
        
        var prevBtn = document.createElement('button');
        prevBtn.className = 'overlay-sort-nav-btn';
        prevBtn.tabIndex = 0;
        prevBtn.style.cssText = 'background:#444;color:#fff;border:1px solid #555;padding:8px 10px;border-radius:5px 0 0 5px;cursor:pointer;font-size:14px;transition:all 0.3s ease;';
        prevBtn.innerHTML = '◀';
        prevBtn.title = 'Modo anterior';
        
        prevBtn.onclick = function(e) {
            e.stopPropagation();
            self.prevSortMode();
            self.updateOverlaySortButtonDisplay(mainBtn);
            self.reloadCurrentOverlay();
        };
        
        prevBtn.onmouseenter = function() {
            prevBtn.style.background = '#555';
            prevBtn.style.borderColor = '#6bff6b';
        };
        
        prevBtn.onmouseleave = function() {
            prevBtn.style.background = '#444';
            prevBtn.style.borderColor = '#555';
        };
        
        prevBtn.onkeydown = function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                prevBtn.click();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                self.prevSortMode();
                self.updateOverlaySortButtonDisplay(mainBtn);
                self.reloadCurrentOverlay();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                self.nextSortMode();
                self.updateOverlaySortButtonDisplay(mainBtn);
                self.reloadCurrentOverlay();
            }
        };
        
        var mainBtn = document.createElement('button');
        mainBtn.id = 'overlaySortBtn';
        mainBtn.className = 'overlay-sort-main-btn';
        mainBtn.tabIndex = 0;
        mainBtn.style.cssText = 'background:#333;color:#fff;border:1px solid #555;border-left:none;border-right:none;padding:8px 16px;cursor:pointer;font-size:12px;transition:all 0.3s ease;min-width:90px;';
        
        this.updateOverlaySortButtonDisplay(mainBtn);
        
        mainBtn.onclick = function(e) {
            e.stopPropagation();
            self.toggleSortMode();
            self.updateOverlaySortButtonDisplay(mainBtn);
            self.reloadCurrentOverlay();
        };
        
        mainBtn.onmouseenter = function() {
            mainBtn.style.background = '#444';
            mainBtn.style.borderColor = '#6bff6b';
        };
        
        mainBtn.onmouseleave = function() {
            mainBtn.style.background = '#333';
            mainBtn.style.borderColor = '#555';
        };
        
        mainBtn.onkeydown = function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                mainBtn.click();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                self.prevSortMode();
                self.updateOverlaySortButtonDisplay(mainBtn);
                self.reloadCurrentOverlay();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                self.nextSortMode();
                self.updateOverlaySortButtonDisplay(mainBtn);
                self.reloadCurrentOverlay();
            }
        };
        
        var nextBtn = document.createElement('button');
        nextBtn.className = 'overlay-sort-nav-btn';
        nextBtn.tabIndex = 0;
        nextBtn.style.cssText = 'background:#444;color:#fff;border:1px solid #555;padding:8px 10px;border-radius:0 5px 5px 0;cursor:pointer;font-size:14px;transition:all 0.3s ease;';
        nextBtn.innerHTML = '▶';
        nextBtn.title = 'Próximo modo';
        
        nextBtn.onclick = function(e) {
            e.stopPropagation();
            self.nextSortMode();
            self.updateOverlaySortButtonDisplay(mainBtn);
            self.reloadCurrentOverlay();
        };
        
        nextBtn.onmouseenter = function() {
            nextBtn.style.background = '#555';
            nextBtn.style.borderColor = '#6bff6b';
        };
        
        nextBtn.onmouseleave = function() {
            nextBtn.style.background = '#444';
            nextBtn.style.borderColor = '#555';
        };
        
        nextBtn.onkeydown = function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                nextBtn.click();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                self.prevSortMode();
                self.updateOverlaySortButtonDisplay(mainBtn);
                self.reloadCurrentOverlay();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                self.nextSortMode();
                self.updateOverlaySortButtonDisplay(mainBtn);
                self.reloadCurrentOverlay();
            }
        };
        
        container.appendChild(prevBtn);
        container.appendChild(mainBtn);
        container.appendChild(nextBtn);
        
        return container;
    },

    updateOverlaySortButtonDisplay: function(btn) {
        if (!btn) {
            btn = document.getElementById('overlaySortBtn');
        }
        if (btn) {
            var info = this.getSortModeInfo();
            btn.innerHTML = info.icon + ' ' + info.text;
            btn.title = 'Ordenação: ' + info.fullText + ' (clique para alternar)';
        }
    },

    reloadCurrentOverlay: function() {
        var self = this;
        
        if (AppState.currentView === 'overlay-subcategory' && AppState.currentCategory) {
            if (this.isUsingIndex) {
                this.loadAndShowCategoryFromIndex(AppState.currentCategory);
            } else {
                var grouped = this.groupWithSubcategories(AppState.currentPlaylist || []);
                var subs = grouped[AppState.currentCategory];
                if (subs) {
                    this.showSubcategoryOverlay(AppState.currentCategory, subs);
                }
            }
        } else if (AppState.currentView === 'overlay-channels' && AppState.currentSubcategories) {
            var subIndex = AppState.currentSubCategoryIndex || 0;
            if (AppState.currentSubcategories[subIndex]) {
                this.showChannelsOverlay(AppState.currentSubcategories[subIndex], subIndex);
            }
        }
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
            
            if (headers.length > 0 && typeof AppState.lastCategoryIndex === 'number' && 
                AppState.lastCategoryIndex >= 0 && AppState.lastCategoryIndex < headers.length) {
                var targetHeader = headers[AppState.lastCategoryIndex];
                
                AppState.currentView = 'channels';
                NavigationModule.setFocusElement(targetHeader);
            } else {
                AppState.currentView = 'channels';
                if (headers.length > 0) {
                    NavigationModule.setFocusElement(headers[0]);
                }
            }

            setTimeout(function() {
                AppState.returningFromSubcategory = false;
            }, 100);
        }, 150);
    },

    // ========================================
    // ⬅️ VOLTAR NO OVERLAY
    // ========================================
    // ========================================
// ⬅️ VOLTAR NO OVERLAY
// ========================================
handleOverlayBack: function() {
    var currentView = AppState.currentView;
    
    console.log('⬅️ handleOverlayBack - view:', currentView);
    
    // Se está nos canais de uma subcategoria normal
    if (currentView === 'overlay-channels') {
        // Verificar se tem subcategorias para voltar
        if (AppState.currentSubcategories && AppState.currentSubcategories.length > 0) {
            this.showSubcategoryOverlay(AppState.currentCategory, AppState.currentSubcategories);
        } else {
            // Se não tem subcategorias, fecha o overlay
            this.hideOverlay();
        }
        return;
    }
    
    // Se está em subcategorias, favoritos ou continue assistindo - fecha o overlay
    if (currentView === 'overlay-subcategory' || 
        currentView === 'overlay-continue-watching' ||
        currentView === 'overlay-favorites') {
        AppState.returningFromSubcategory = true;
        this.hideOverlay();
        return;
    }
    
    // Qualquer outro caso de overlay - fecha
    if (currentView && currentView.includes('overlay')) {
        this.hideOverlay();
        return;
    }
},

    // ========================================
    // 🔙 RETORNO DO PLAYER
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
// 🎮 NAVEGAÇÃO POR TECLADO NO OVERLAY
// ========================================
// NOTA: Este listener APENAS trata teclas específicas que o navigation.js não cobre
// As setas e Enter são tratadas pelo NavigationModule para evitar duplicação

document.addEventListener('keydown', function(e) {
    if (!AppState.currentView) return;
    
    var isInOverlay = AppState.currentView.indexOf('overlay') !== -1;
    if (!isInOverlay) return;

    // ⚠️ NÃO tratar setas aqui - são tratadas pelo NavigationModule
    // ⚠️ NÃO tratar Enter aqui - é tratado pelo NavigationModule
    // ⚠️ NÃO tratar Backspace/Escape aqui - são tratados pelo NavigationModule

    switch (e.key) {
        // Tecla S/O para alternar ordenação
        case 's':
        case 'S':
        case 'o':
        case 'O':
            if (!e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                ChannelModule.toggleSortMode();
                ChannelModule.updateOverlaySortButtonDisplay();
                ChannelModule.reloadCurrentOverlay();
            }
            break;
            
        // Tecla F para favoritar (mantém aqui como backup, mas principal está no NavigationModule)
        case 'f':
        case 'F':
            if (!e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                var focusedEl = AppState.overlayChannels ? AppState.overlayChannels[AppState.overlayFocusIndex] : null;
                if (focusedEl && focusedEl.dataset && focusedEl.dataset.url) {
                    var channelName = 'Canal';
                    var nameEl = focusedEl.querySelector('[style*="color:#6bff6b"], [style*="color:#ffd700"], [style*="color:#ff9800"]');
                    if (nameEl) {
                        channelName = nameEl.textContent.replace('▶️ ', '').replace('⭐ ', '').trim();
                    }
                    
                    var channel = {
                        url: focusedEl.dataset.url,
                        name: channelName
                    };
                    
                    var nowFavorite = ChannelModule.toggleFavorite(channel);
                    
                    var favToggle = focusedEl.querySelector('.fav-toggle');
                    if (favToggle) {
                        favToggle.innerHTML = nowFavorite ? '⭐' : '☆';
                        favToggle.style.color = nowFavorite ? '#ffd700' : '#666';
                    }
                }
            }
            break;
            
        default:
            // Não processar outras teclas aqui
            break;
    }
});

console.log('✅ ChannelModule v7.6.1 carregado - Conflitos de teclado corrigidos');
console.log('   Modos de ordenação: Padrão (📋), A-Z (🔤), Por Ano (📅)');
console.log('   Tecla F: Adicionar/remover favorito');
