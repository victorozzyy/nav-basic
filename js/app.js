// ======================================================
// app.js - Versão 4.2 - COM RESTAURAÇÃO COMPLETA DE PLAYLIST
// ======================================================

// 🧩 Helper: Event listeners seguros
function safeAddEventListener(elementId, event, callback) {
    const element = document.getElementById(elementId);
    if (element) {
        element.addEventListener(event, callback);
        return true;
    }
    console.warn(`⚠️ Elemento "${elementId}" não encontrado`);
    return false;
}

// ======================================================
// 🔙 VERIFICAR E RESTAURAR APÓS VOLTAR DO PLAYER
// ======================================================
async function checkReturnFromPlayer() {
    try {
        console.log('╔═══════════════════════════════════════╗');
        console.log('🔍 VERIFICANDO RETORNO DO PLAYER');
        console.log('╚═══════════════════════════════════════╝');

        if (typeof StateManager === 'undefined') {
            console.error('❌ StateManager não disponível!');
            return false;
        }

        const isReturning = StateManager.isReturningFromPlayer();
        
        if (!isReturning) {
            console.log('ℹ️ Não está retornando do player');
            return false;
        }

        console.log('✅ CONFIRMADO: Retornando do player');

        // 1. Restaurar estado do player (canal que estava assistindo)
        const playerState = StateManager.restorePlayerState();
        
        if (!playerState) {
            console.warn('⚠️ Estado do player não encontrado');
            StateManager.clearReturnFlags();
            return false;
        }

        console.log('📦 Estado do player restaurado:');
        console.log('   Canal:', playerState.name);
        console.log('   Índice:', playerState.index);

        // 2. Restaurar contexto da playlist
        const playlistContext = StateManager.restorePlaylistContext();
        
        if (!playlistContext) {
            console.warn('⚠️ Contexto da playlist não encontrado');
            StateManager.clearReturnFlags();
            return false;
        }

        console.log('📂 Contexto da playlist restaurado:');
        console.log('   Nome:', playlistContext.playlistName);
        console.log('   Tipo:', playlistContext.playlistType);
        console.log('   Categoria:', playlistContext.category);

        // 3. Recarregar a playlist baseado no tipo
        if (playlistContext.playlistType === 'remote') {
            await restoreRemotePlaylist(playlistContext, playerState);
        } else if (playlistContext.playlistType === 'local') {
            await restoreLocalPlaylist(playlistContext, playerState);
        } else {
            console.warn('⚠️ Tipo de playlist desconhecido:', playlistContext.playlistType);
            StateManager.clearReturnFlags();
            return false;
        }

        return true;
        
    } catch (error) {
        console.error('❌ ERRO ao verificar retorno:', error);
        console.error('Stack:', error.stack);
        
        if (StateManager) {
            StateManager.clearReturnFlags();
        }
        
        return false;
    }
}

// ======================================================
// 📡 RESTAURAR PLAYLIST REMOTA
// ======================================================
async function restoreRemotePlaylist(context, playerState) {
    try {
        console.log('📡 Restaurando playlist remota:', context.playlistName);
        
        if (typeof ChannelModule !== 'undefined') {
            ChannelModule.showMessage('📡 Restaurando playlist...', 'loading');
        }

        // Buscar configuração da playlist
        const allPlaylists = [
            ...(PlaylistConfig.remotePlaylistsConfig || []),
            ...(PlaylistConfig.minhasListasConfig || [])
        ];
        
        const playlistConfig = allPlaylists.find(p => p.name === context.playlistName);
        
        if (!playlistConfig) {
            console.error('❌ Configuração da playlist não encontrada:', context.playlistName);
            throw new Error('Playlist não encontrada no config');
        }

        console.log('✅ Config encontrado:', playlistConfig.url);

        // Verificar cache
        let playlist = AppState.getCachedPlaylist(playlistConfig.url);
        
        if (playlist) {
            console.log('📦 Usando playlist em cache:', playlist.length, 'canais');
        } else {
            console.log('📥 Baixando playlist...');
            
            // Baixar playlist
            const needsCors = playlistConfig.needsCors || false;
            
            let response;
            if (needsCors) {
                response = await PlaylistModule.fetchWithCorsProxy(playlistConfig.url);
            } else {
                response = await fetch(playlistConfig.url);
            }
            
            if (!response.ok) {
                throw new Error(`Erro HTTP ${response.status}`);
            }
            
            const data = await response.text();
            playlist = await PlaylistModule.parsePlaylistAsync(data);
            
            // Salvar no cache
            AppState.cachePlaylist(playlistConfig.url, playlist);
            
            console.log('✅ Playlist baixada:', playlist.length, 'canais');
        }

        // Definir playlist no AppState
        AppState.setPlaylist(playlist, context.playlistName, 'remote');
        AppState.currentCategory = context.category;
        AppState.currentChannelIndex = playerState.index;

        // Atualizar UI
        ChannelModule.updateChannelList();

        // Aguardar renderização e restaurar foco
        setTimeout(() => {
            finishRestore(context, playerState, playlist.length);
        }, 500);

    } catch (error) {
        console.error('❌ Erro ao restaurar playlist remota:', error);
        
        if (typeof ChannelModule !== 'undefined') {
            ChannelModule.showMessage('❌ Erro ao restaurar playlist', 'error');
        }
        
        StateManager.clearReturnFlags();
        initializeNormal();
    }
}

// ======================================================
// 📁 RESTAURAR PLAYLIST LOCAL
// ======================================================
// ======================================================
// 📁 RESTAURAR PLAYLIST LOCAL (PATCH UNIFICADO)
// ======================================================
async function restoreLocalPlaylist(context, playerState) {
    try {
        console.log('📁 Restaurando playlist local (patch unificado):', context.playlistName);

        if (typeof ChannelModule !== 'undefined') {
            ChannelModule.showMessage('📁 Restaurando playlist local...', 'loading');
        }

        // Buscar arquivo da playlist no config
        const localConfig = (PlaylistConfig.availablePlaylists || [])
            .find(p => p.name === context.playlistName);

        if (!localConfig) {
            throw new Error('Playlist local não encontrada no config: ' + context.playlistName);
        }

        console.log('✅ Arquivo local encontrado:', localConfig.filename);

        // Detectar se existe loader otimizado/indexado (compatibilidade com versões antigas)
        const useOptimizedLoader = typeof PlaylistModuleLocal !== 'undefined' &&
                                   typeof LocalPlaylistLoader !== 'undefined' &&
                                   typeof LocalPlaylistLoader.getAllChannels === 'function';

        if (useOptimizedLoader) {
            console.log('⚡ Usando loader otimizado para playlist local (compatibilidade)');

            // Carregar índice (se disponível) e armazenar index no AppState
            if (LocalPlaylistLoader.getIndex) {
                try {
                    const index = await LocalPlaylistLoader.getIndex(localConfig.filename);
                    if (index) {
                        AppState.playlistIndex = index;
                        console.log('✅ Índice local carregado (size):', (index?.channels?.length || 'N/A'));
                    }
                } catch (e) {
                    console.warn('⚠️ Falha ao carregar index otimizado (continuando):', e);
                }
            }

            // Sempre setar a playlist "completa" no AppState quando possível (para evitar índices inválidos)
            let fullPlaylist = null;
            try {
                // se existir função para obter todos os canais via loader otimizado, use-a
                if (LocalPlaylistLoader.getAllChannels) {
                    fullPlaylist = await LocalPlaylistLoader.getAllChannels(AppState.playlistIndex || {}, 5000);
                }
            } catch (e) {
                console.warn('⚠️ Falha ao obter fullPlaylist via loader otimizado:', e);
            }

            // Se obtivemos a playlist completa, definimos no AppState (sem sobrescrever mais tarde)
            if (Array.isArray(fullPlaylist) && fullPlaylist.length > 0) {
                AppState.setPlaylist
                    ? AppState.setPlaylist(fullPlaylist, context.playlistName, 'local')
                    : (AppState.currentPlaylist = fullPlaylist);

                console.log('✅ AppState.currentPlaylist definido com playlist completa (otimizado):', fullPlaylist.length);
            } else {
                // fallback: manter apenas o índice — não sobrescrever currentPlaylist se não recuperamos tudo
                console.log('ℹ️ Não foi possível obter playlist completa, manteremos index para carregamento por demanda');
            }

            // Agora, se há uma categoria a abrir, carregamos apenas os canais visíveis no overlay
            if (context.category) {
                console.log('📂 Abrir categoria (overlay):', context.category);

                const index = AppState.playlistIndex || null;
                let channels = [];

                try {
                    channels = context.category === 'Todos os Canais'
                        ? (LocalPlaylistLoader.getAllChannels ? await LocalPlaylistLoader.getAllChannels(index, 5000) : [])
                        : (LocalPlaylistLoader.getCategoryChannels ? await LocalPlaylistLoader.getCategoryChannels(index, context.category, 5000) : []);
                } catch (e) {
                    console.warn('⚠️ Erro ao carregar canais da categoria (continuando):', e);
                    channels = [];
                }

                if (channels && channels.length > 0) {
                    // NÃO sobrescrever AppState.currentPlaylist (isso quebra índices).
                    // Em vez disso, armazenamos a lista que o overlay deve usar.
                    AppState.overlayChannels = channels;
                    console.log('✅ AppState.overlayChannels definido com', channels.length, 'canais');

                    // Abrir overlay com os canais da categoria
                    if (typeof ChannelModule !== 'undefined' && ChannelModule.showCategoryOverlay) {
                        ChannelModule.showCategoryOverlay(context.category, channels);
                    }

                    // Aguardar renderização do overlay
                    await new Promise(resolve => setTimeout(resolve, 300));

                    // Tentar focar no canal dentro do overlay pelo url/nome
                    const channelInCategory = channels.findIndex(ch => {
                        return (playerState.url && ch.url === playerState.url) ||
                               (playerState.name && ch.name === playerState.name);
                    });

                    if (channelInCategory >= 0) {
                        console.log('🎯 Focando no canal dentro do overlay:', channelInCategory);
                        if (typeof ChannelModule !== 'undefined' && ChannelModule.setOverlayFocus) {
                            ChannelModule.setOverlayFocus(channelInCategory);
                        }
                        if (typeof ChannelModule !== 'undefined' && ChannelModule.showMessage) {
                            ChannelModule.showMessage(`✅ Voltou para: ${playerState.name}`, 'success');
                        }
                        // Limpar flags e sair
                        if (StateManager && StateManager.clearReturnFlags) StateManager.clearReturnFlags();
                        return;
                    } else {
                        console.warn('⚠️ Canal não encontrado no overlay (category). Iremos tentar restaurar pelo índice global.');
                        // continue para fallback de restauração por índice
                    }
                } else {
                    console.warn('⚠️ Não foram encontrados canais para a categoria no loader otimizado.');
                }
            }

            // Se chegamos aqui, tentamos finalizar restauração usando o índice global (se disponível)
            if (typeof AppState.currentPlaylist !== 'undefined' && AppState.currentPlaylist.length > 0) {
                // Definir índice atual e chamar finishRestore para reutilizar lógica existente
                AppState.currentCategory = context.category || AppState.currentCategory;
                AppState.currentChannelIndex = (typeof playerState.index === 'number') ? playerState.index : AppState.currentChannelIndex || 0;

                // Atualizar UI com a playlist completa (se ChannelModule tiver essa função)
                if (typeof ChannelModule !== 'undefined' && ChannelModule.updateChannelList) {
                    ChannelModule.updateChannelList();
                }

                // Aguardar renderização e usar finishRestore (mesma lógica usada no resto)
                setTimeout(() => {
                    finishRestore(context, playerState, AppState.currentPlaylist.length || 0);
                }, 400);

                // Limpar flags
                if (StateManager && StateManager.clearReturnFlags) StateManager.clearReturnFlags();
                return;
            }

            // Se não temos playlist completa nem overlay, tentar fallback de leitura do arquivo
            console.log('ℹ️ Tentando fallback: leitura direta do arquivo de playlist local');
            // deixar cair para o fallback abaixo (fetching file)
        }

        // FALLBACK: sistema normal (parsing completo do arquivo local)
        console.log('📄 Usando loader normal para playlist local (fallback)');

        const response = await fetch(`/playlists/${localConfig.filename}`);
        if (!response.ok) {
            throw new Error('Arquivo não encontrado: ' + localConfig.filename);
        }

        const content = await response.text();
        const playlist = await PlaylistModule.parsePlaylistAsync(content);

        console.log('✅ Playlist carregada (fallback):', playlist.length, 'canais');

        // Definir playlist no AppState (garante comportamento consistente com remote)
        AppState.setPlaylist
            ? AppState.setPlaylist(playlist, context.playlistName, 'local')
            : (AppState.currentPlaylist = playlist);

        AppState.currentCategory = context.category || null;
        AppState.currentChannelIndex = (typeof playerState.index === 'number') ? playerState.index : 0;

        // Atualizar UI
        if (typeof ChannelModule !== 'undefined' && ChannelModule.updateChannelList) {
            ChannelModule.updateChannelList();
        }

        // Aguardar render e finalizar restauração
        setTimeout(() => {
            finishRestore(context, playerState, playlist.length);
        }, 400);

        // Limpar flags
        if (StateManager && StateManager.clearReturnFlags) StateManager.clearReturnFlags();

    } catch (error) {
        console.error('❌ Erro ao restaurar playlist local (patch):', error);
        if (typeof ChannelModule !== 'undefined') {
            ChannelModule.showMessage('❌ Erro ao restaurar playlist local', 'error');
        }
        if (StateManager && StateManager.clearReturnFlags) StateManager.clearReturnFlags();
        initializeNormal();
    }
}


// ======================================================
// ✅ FINALIZAR RESTAURAÇÃO
// ======================================================
function finishRestore(context, playerState, playlistSize) {
    console.log('✅ Finalizando restauração...');
    
    const channelIndex = playerState.index;
    
    if (channelIndex >= 0 && channelIndex < playlistSize) {
        console.log('🎯 Restaurando foco no canal:', channelIndex);
        
        // Tentar focar no canal específico
        if (typeof ChannelModule !== 'undefined' && ChannelModule.focusChannel) {
            const restored = ChannelModule.focusChannel(channelIndex);
            
            if (restored) {
                console.log('✅ Foco restaurado com sucesso!');
                ChannelModule.showMessage(
                    `✅ Voltou para: ${playerState.name}`,
                    'success'
                );
            } else {
                console.warn('⚠️ Não foi possível restaurar foco, abrindo categoria');
                
                // Fallback: abrir categoria
                if (context.category) {
                    const grouped = ChannelModule.groupByCategory(AppState.currentPlaylist);
                    const categoryChannels = grouped[context.category] || [];
                    
                    if (categoryChannels.length > 0) {
                        ChannelModule.showCategoryOverlay(context.category, categoryChannels);
                        
                        ChannelModule.showMessage(
                            `✅ ${context.playlistName} restaurada - Categoria: ${context.category}`,
                            'success'
                        );
                    }
                }
            }
        }
    } else {
        console.warn('⚠️ Índice inválido:', channelIndex);
        
        if (typeof ChannelModule !== 'undefined') {
            ChannelModule.showMessage(
                `✅ ${context.playlistName} restaurada (${playlistSize} canais)`,
                'success'
            );
        }
    }
    
    // Limpar flags
    StateManager.clearReturnFlags();
}

// ======================================================
// 🆕 INICIALIZAÇÃO NORMAL
// ======================================================
function initializeNormal() {
    console.log('🆕 Inicialização normal');
    
    if (AppState && AppState.reset) {
        AppState.reset();
    }
    
    if (ChannelModule && ChannelModule.updateChannelList) {
        ChannelModule.updateChannelList();
    }

    const buttons = document.querySelectorAll('.navigable');
    if (buttons.length > 0) {
        AppState.focusIndex = 0;
        AppState.currentView = 'buttons';
        buttons[0].focus();
    }

    if (ChannelModule && ChannelModule.showMessage) {
        ChannelModule.showMessage('💡 Selecione uma opção acima para começar', 'success');
    }
}

// ======================================================
// 🚀 INICIALIZAÇÃO PRINCIPAL
// ======================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('╔═══════════════════════════════════════╗');
    console.log('🚀 M3U8 PLAYER v4.2 - COM RESTAURAÇÃO');
    console.log('╚═══════════════════════════════════════╝');

    // ------------------------------------------------------
    // 🔧 Verificar módulos essenciais
    // ------------------------------------------------------
    const requiredModules = {
        'AppState': typeof AppState !== 'undefined',
        'StateManager': typeof StateManager !== 'undefined',
        'ChannelModule': typeof ChannelModule !== 'undefined',
        'PlaylistModule': typeof PlaylistModule !== 'undefined',
        'NavigationModule': typeof NavigationModule !== 'undefined',
        'PlayerModule': typeof PlayerModule !== 'undefined'
    };

    const missing = Object.entries(requiredModules)
        .filter(([_, ok]) => !ok)
        .map(([n]) => n);
    
    if (missing.length) {
        const errorMsg = `❌ Erro crítico!\n\nMódulos ausentes: ${missing.join(', ')}\n\nAbra o console (F12) para detalhes.`;
        alert(errorMsg);
        console.error('❌ Módulos não carregados:', missing);
        return;
    }

    console.log('✅ Todos os módulos carregados');

    // ------------------------------------------------------
    // ⚙️ Inicializar módulos
    // ------------------------------------------------------
    const initModules = [
        { name: 'ChannelModule', fn: () => ChannelModule.init?.() },
        { name: 'PlaylistModule', fn: () => PlaylistModule.init?.() },
        { name: 'NavigationModule', fn: () => NavigationModule.setupKeyboardControls?.() }
    ];

    for (const module of initModules) {
        try {
            module.fn();
            console.log(`✅ ${module.name} inicializado`);
        } catch (e) {
            console.error(`❌ Erro ao inicializar ${module.name}:`, e);
        }
    }

    // ------------------------------------------------------
    // 🎛️ Configurar botões
    // ------------------------------------------------------
    console.log('🔧 Configurando botões...');
    setupMainButtons();

    // ------------------------------------------------------
    // 🔄 VERIFICAR RETORNO DO PLAYER (PRINCIPAL)
    // ------------------------------------------------------
    const wasRestored = await checkReturnFromPlayer();
    
    if (!wasRestored) {
        console.log('📋 Inicialização normal (não estava no player)');
        initializeNormal();
    } else {
        console.log('✅ Restauração concluída com sucesso!');
    }

    console.log('╚═══════════════════════════════════════╝');
    console.log('✅ App inicializado');
});

// ======================================================
// ⚙️ Configurar botões principais
// ======================================================
function setupMainButtons() {
    const buttonConfig = [
        { id: 'btnUSB', handler: () => {
            if (PlaylistModule.scanUSBPlaylists) {
                PlaylistModule.scanUSBPlaylists();
            } else {
                console.warn('⚠️ scanUSBPlaylists não disponível');
            }
        }},
        { id: 'btnMinhasListas', handler: () => {
            console.log('🔥 Botão Minhas Listas clicado');
            if (typeof PlaylistModule !== 'undefined' && PlaylistModule.showMinhasListasSelector) {
                PlaylistModule.showMinhasListasSelector();
            } else {
                console.error('❌ PlaylistModule.showMinhasListasSelector não disponível');
            }
        }},
        { id: 'btnLoadPlaylist', handler: () => {
            if (PlaylistModule.showRemotePlaylistSelector) {
                PlaylistModule.showRemotePlaylistSelector();
            }
        }},
        { id: 'btnLocal', handler: () => {
            if (PlaylistModule.showPlaylistSelector) {
                PlaylistModule.showPlaylistSelector();
            }
        }},
        { id: 'btnUrl', handler: () => {
            if (PlaylistModule.loadFromUrl) {
                PlaylistModule.loadFromUrl();
            }
        }},
        { id: 'btnSingle', handler: () => {
            if (PlaylistModule.loadSingleChannel) {
                PlaylistModule.loadSingleChannel();
            }
        }},
        { id: 'btnUpload', handler: () => {
            if (PlaylistModule.handleFileUpload) {
                PlaylistModule.handleFileUpload();
            }
        }},
        { id: 'btnBackFromRemote', handler: () => {
            if (NavigationModule.backToButtons) {
                NavigationModule.backToButtons();
            }
        }},
        { id: 'btnBackFromLocal', handler: () => {
            if (NavigationModule.backToButtons) {
                NavigationModule.backToButtons();
            }
        }}
    ];

    buttonConfig.forEach(({ id, handler }) => {
        const success = safeAddEventListener(id, 'click', handler);
        if (success) console.log(`✅ Botão configurado: ${id}`);
    });
}

// ======================================================
// 🧪 Diagnóstico manual (Ctrl+Shift+D)
// ======================================================
document.addEventListener('keydown', async (e) => {
    if ((e.key === 'D' || e.key === 'd') && e.ctrlKey && e.shiftKey) {
        console.log('╔═══════════════════════════════════════╗');
        console.log('🔍 DIAGNÓSTICO COMPLETO');
        console.log('╚═══════════════════════════════════════╝');
        
        console.log('📊 AppState:', {
            playlist: AppState.currentPlaylist?.length || 0,
            playlistName: AppState.currentPlaylistName,
            currentChannel: AppState.currentChannelIndex,
            category: AppState.currentCategory,
            view: AppState.currentView
        });
        
        if (typeof StateManager !== 'undefined') {
            StateManager.diagnose();
        }
        
        console.log('╚═══════════════════════════════════════╝');
    }
});

// ======================================================
// 🔄 Tratamento de erros globais
// ======================================================
window.addEventListener('error', (e) => {
    console.error('❌ Erro global:', {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        error: e.error
    });
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('❌ Promise rejeitada:', e.reason);
});

console.log('✅ app.js v4.2 carregado (COM RESTAURAÇÃO COMPLETA)');
