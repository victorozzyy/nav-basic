/**
 * XtreamClient v1.0
 * Cliente para API Xtream Codes
 * Compatível com Smart TV Tizen
 */

const XtreamClient = {
    // Configurações
    config: {
        host: '',
        username: '',
        password: '',
        apiUrl: ''
    },
    
    // Cache de dados
    cache: {
        categories: { live: null, vod: null, series: null },
        streams: {},
        seriesInfo: {}
    },
    
    // Estado
    isAuthenticated: false,
    userInfo: null,
    serverInfo: null,

    /**
     * Configura o cliente
     */
    configure(host, username, password) {
        this.config.host = host.replace(/\/+$/, '');
        this.config.username = username;
        this.config.password = password;
        this.config.apiUrl = `${this.config.host}/player_api.php`;
        
        this.clearCache();
        this.isAuthenticated = false;
        
        console.log('🔧 XtreamClient configurado:', this.config.host);
    },

    /**
     * Configura a partir de URL M3U
     */
    configureFromM3U(m3uUrl) {
        try {
            const url = new URL(m3uUrl);
            const username = url.searchParams.get('username');
            const password = url.searchParams.get('password');
            
            if (!username || !password) {
                console.warn('⚠️ URL não contém credenciais Xtream');
                return false;
            }
            
            const host = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
            this.configure(host, username, password);
            
            return true;
        } catch (error) {
            console.error('❌ Erro ao extrair credenciais:', error);
            return false;
        }
    },

    /**
     * Limpa cache
     */
    clearCache() {
        this.cache = {
            categories: { live: null, vod: null, series: null },
            streams: {},
            seriesInfo: {}
        };
    },

    /**
     * Requisição à API
     */
    async request(params = {}) {
        if (!this.config.username || !this.config.password) {
            throw new Error('XtreamClient não configurado');
        }

        // Monta URL com parâmetros GET (mais compatível)
        const queryParams = new URLSearchParams({
            username: this.config.username,
            password: this.config.password,
            ...params
        });

        const url = `${this.config.apiUrl}?${queryParams.toString()}`;

        try {
            // Tenta requisição direta
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
            
        } catch (error) {
            console.warn('⚠️ Requisição direta falhou, tentando proxy...');
            return await this.requestWithProxy(params);
        }
    },

    /**
     * Requisição via proxy CORS
     */
    async requestWithProxy(params = {}) {
        const proxies = [
            'https://api.codetabs.com/v1/proxy?quest=',
            'https://corsproxy.io/?',
            'https://api.allorigins.win/raw?url='
        ];

        const queryParams = new URLSearchParams({
            username: this.config.username,
            password: this.config.password,
            ...params
        });

        const fullUrl = `${this.config.apiUrl}?${queryParams.toString()}`;

        for (let i = 0; i < proxies.length; i++) {
            try {
                console.log(`🔄 Proxy ${i + 1}/${proxies.length}...`);
                
                const proxyUrl = proxies[i] + encodeURIComponent(fullUrl);
                const response = await fetch(proxyUrl);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log(`✅ Sucesso com proxy ${i + 1}`);
                    return data;
                }
            } catch (e) {
                console.warn(`❌ Proxy ${i + 1} falhou`);
            }
        }

        throw new Error('Todos os proxies falharam');
    },

    // ==================== AUTENTICAÇÃO ====================

    async authenticate() {
        try {
            const data = await this.request();
            
            if (data.user_info && data.user_info.auth === 1) {
                this.isAuthenticated = true;
                this.userInfo = data.user_info;
                this.serverInfo = data.server_info;
                
                console.log('✅ Autenticado:', this.userInfo.username);
                return { success: true, data };
            } else {
                this.isAuthenticated = false;
                return { success: false, error: 'Credenciais inválidas' };
            }
        } catch (error) {
            this.isAuthenticated = false;
            return { success: false, error: error.message };
        }
    },

    // ==================== CANAIS AO VIVO ====================

    async getLiveCategories(useCache = true) {
        if (useCache && this.cache.categories.live) {
            return this.cache.categories.live;
        }
        const data = await this.request({ action: 'get_live_categories' });
        this.cache.categories.live = data;
        return data;
    },

    async getLiveStreams(categoryId, useCache = true) {
        const cacheKey = `live_${categoryId || 'all'}`;
        
        if (useCache && this.cache.streams[cacheKey]) {
            return this.cache.streams[cacheKey];
        }

        const params = { action: 'get_live_streams' };
        if (categoryId) params.category_id = categoryId;
        
        const data = await this.request(params);
        this.cache.streams[cacheKey] = data;
        return data;
    },

    getLiveStreamUrl(streamId) {
        return `${this.config.host}/live/${this.config.username}/${this.config.password}/${streamId}.ts`;
    },

    // ==================== VOD (FILMES) ====================

    async getVodCategories(useCache = true) {
        if (useCache && this.cache.categories.vod) {
            return this.cache.categories.vod;
        }
        const data = await this.request({ action: 'get_vod_categories' });
        this.cache.categories.vod = data;
        return data;
    },

    async getVodStreams(categoryId, useCache = true) {
        const cacheKey = `vod_${categoryId || 'all'}`;
        
        if (useCache && this.cache.streams[cacheKey]) {
            return this.cache.streams[cacheKey];
        }

        const params = { action: 'get_vod_streams' };
        if (categoryId) params.category_id = categoryId;
        
        const data = await this.request(params);
        this.cache.streams[cacheKey] = data;
        return data;
    },

    getVodStreamUrl(streamId, extension = 'mp4') {
        return `${this.config.host}/movie/${this.config.username}/${this.config.password}/${streamId}.${extension}`;
    },

    // ==================== SÉRIES ====================

    async getSeriesCategories(useCache = true) {
        if (useCache && this.cache.categories.series) {
            return this.cache.categories.series;
        }
        const data = await this.request({ action: 'get_series_categories' });
        this.cache.categories.series = data;
        return data;
    },

    async getSeriesForCategory(categoryId, useCache = true) {
        const cacheKey = `series_${categoryId || 'all'}`;
        
        if (useCache && this.cache.streams[cacheKey]) {
            return this.cache.streams[cacheKey];
        }

        const params = { action: 'get_series' };
        if (categoryId) params.category_id = categoryId;
        
        const data = await this.request(params);
        this.cache.streams[cacheKey] = data;
        return data;
    },

    async getSeriesInfo(seriesId, useCache = true) {
        const cacheKey = `info_${seriesId}`;
        
        if (useCache && this.cache.seriesInfo[cacheKey]) {
            return this.cache.seriesInfo[cacheKey];
        }

        const data = await this.request({ 
            action: 'get_series_info', 
            series_id: seriesId 
        });
        
        this.cache.seriesInfo[cacheKey] = data;
        return data;
    },

    getSeriesEpisodeUrl(episodeId, extension = 'mp4') {
        return `${this.config.host}/series/${this.config.username}/${this.config.password}/${episodeId}.${extension}`;
    },

    // ==================== CONVERSÃO PARA M3U ====================

    convertLiveToM3UFormat(streams, categories = []) {
        const categoryMap = {};
        categories.forEach(cat => {
            categoryMap[cat.category_id] = cat.category_name;
        });

        return streams.map(stream => ({
            name: stream.name,
            url: this.getLiveStreamUrl(stream.stream_id),
            group: categoryMap[stream.category_id] || 'Sem Categoria',
            logo: stream.stream_icon || '',
            tvgId: stream.epg_channel_id || '',
            tvgName: stream.name
        }));
    },

    convertVodToM3UFormat(streams, categories = []) {
        const categoryMap = {};
        categories.forEach(cat => {
            categoryMap[cat.category_id] = cat.category_name;
        });

        return streams.map(stream => ({
            name: stream.name,
            url: this.getVodStreamUrl(stream.stream_id, stream.container_extension || 'mp4'),
            group: categoryMap[stream.category_id] || 'Filmes',
            logo: stream.stream_icon || ''
        }));
    },

    convertSeriesToM3UFormat(seriesInfo) {
        const episodes = [];
        const info = seriesInfo.info || {};

        Object.keys(seriesInfo.episodes || {}).forEach(seasonNum => {
            const seasonEpisodes = seriesInfo.episodes[seasonNum];
            
            seasonEpisodes.forEach(ep => {
                episodes.push({
                    name: `${info.name || 'Série'} - S${seasonNum.padStart(2, '0')}E${String(ep.episode_num).padStart(2, '0')} - ${ep.title}`,
                    url: this.getSeriesEpisodeUrl(ep.id, ep.container_extension || 'mp4'),
                    group: info.name || 'Séries',
                    logo: info.cover || ''
                });
            });
        });

        return episodes;
    }
};

// Expor globalmente
window.XtreamClient = XtreamClient;

console.log('✅ XtreamClient v1.0 carregado');