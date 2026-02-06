// ======================================================
// search.js - Busca integrada visível (v5.1 - CORRIGIDO)
// ======================================================
// - Corrigido: restauração do overlay após retorno do player
// - Corrigido: salvamento de estado antes de abrir player
// - Navegação completa por setas
// - Compatível com Smart TV Tizen
// ======================================================

var SearchModule = {
    channelContainer: null,
    searchListItem: null,
    overlayChannels: [],
    overlayFocusIndex: 0,
    lastFocusIndexBeforePlayer: 0,
    isVisible: false,
    isPromptOpen: false,
    wasOpenBeforePlayer: false,
    lastSearchQuery: '',
    lastSearchResults: [], // 🆕 Guardar resultados da busca
    
    // Elementos do diálogo navegável
    dialogElements: [],
    dialogFocusIndex: 0,

    // ======================================================
    // 🔧 Inicialização
    // ======================================================
    init: function() {
        console.log('✅ SearchModule v5.1 inicializado');
        this.channelContainer = document.getElementById('channelList');
        this.createSearchDialog();
    },

    // ======================================================
    // 🆕 CRIAR DIÁLOGO DE BUSCA CUSTOMIZADO (NAVEGÁVEL)
    // ======================================================
    createSearchDialog: function() {
        var self = this;
        
        // Evitar duplicação
        if (document.getElementById('searchDialog')) return;

        var dialog = document.createElement('div');
        dialog.id = 'searchDialog';
        dialog.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:10000;justify-content:center;align-items:center;';

        dialog.innerHTML = '<div style="background:#1a1a1a;border:3px solid #00e676;border-radius:15px;padding:30px;width:90%;max-width:500px;text-align:center;">' +
            '<h2 style="color:#00e676;margin-bottom:20px;">🔍 Buscar Canais</h2>' +
            '<input type="text" id="searchDialogInput" placeholder="Digite o nome do canal..." tabindex="1" style="width:100%;padding:15px;font-size:18px;border:3px solid #444;border-radius:8px;background:#2a2a2a;color:white;outline:none;box-sizing:border-box;transition:all 0.3s;"/>' +
            '<div style="margin-top:25px;display:flex;gap:15px;justify-content:center;">' +
                '<button id="searchDialogOk" tabindex="2" style="background:#00e676;color:#000;border:3px solid transparent;padding:15px 40px;border-radius:8px;font-size:18px;font-weight:bold;cursor:pointer;transition:all 0.3s;min-width:140px;">✓ Buscar</button>' +
                '<button id="searchDialogCancel" tabindex="3" style="background:#ff4444;color:white;border:3px solid transparent;padding:15px 40px;border-radius:8px;font-size:18px;cursor:pointer;transition:all 0.3s;min-width:140px;">✕ Cancelar</button>' +
            '</div>' +
            '<p style="color:#888;margin-top:20px;font-size:14px;">⬆️⬇️ Navegar | OK para confirmar | BACK para cancelar</p>' +
        '</div>';

        document.body.appendChild(dialog);

        // Elementos navegáveis
        var input = document.getElementById('searchDialogInput');
        var okBtn = document.getElementById('searchDialogOk');
        var cancelBtn = document.getElementById('searchDialogCancel');

        this.dialogElements = [input, okBtn, cancelBtn];
        this.dialogFocusIndex = 0;

        // ======================================================
        // 🎨 ESTILOS DE FOCO
        // ======================================================
        this.applyDialogFocusStyle = function(el) {
            if (!el) return;
            
            if (el.tagName === 'INPUT') {
                el.style.borderColor = '#00e676';
                el.style.boxShadow = '0 0 20px rgba(0, 230, 118, 0.5)';
            } else if (el.id === 'searchDialogOk') {
                el.style.borderColor = '#fff';
                el.style.boxShadow = '0 0 20px rgba(0, 230, 118, 0.7)';
                el.style.transform = 'scale(1.1)';
            } else if (el.id === 'searchDialogCancel') {
                el.style.borderColor = '#fff';
                el.style.boxShadow = '0 0 20px rgba(255, 68, 68, 0.7)';
                el.style.transform = 'scale(1.1)';
            }
        };

        this.removeDialogFocusStyle = function(el) {
            if (!el) return;
            
            if (el.tagName === 'INPUT') {
                el.style.borderColor = '#444';
                el.style.boxShadow = 'none';
            } else {
                el.style.borderColor = 'transparent';
                el.style.boxShadow = 'none';
                el.style.transform = 'scale(1)';
            }
        };

        // Aplicar listeners de foco visual
        this.dialogElements.forEach(function(el) {
            el.addEventListener('focus', function() {
                self.applyDialogFocusStyle(el);
            });
            el.addEventListener('blur', function() {
                self.removeDialogFocusStyle(el);
            });
        });

        // ======================================================
        // 🎮 NAVEGAÇÃO NO DIÁLOGO
        // ======================================================
        this.navigateDialog = function(direction) {
            var currentEl = self.dialogElements[self.dialogFocusIndex];
            self.removeDialogFocusStyle(currentEl);

            if (direction === 'next') {
                self.dialogFocusIndex = (self.dialogFocusIndex + 1) % self.dialogElements.length;
            } else if (direction === 'prev') {
                self.dialogFocusIndex = (self.dialogFocusIndex - 1 + self.dialogElements.length) % self.dialogElements.length;
            }

            var nextEl = self.dialogElements[self.dialogFocusIndex];
            nextEl.focus();
            self.applyDialogFocusStyle(nextEl);
            
            console.log('🎯 Foco no diálogo:', self.dialogFocusIndex, nextEl.id || nextEl.tagName);
        };

        // ======================================================
        // ⌨️ HANDLER DE TECLADO DO DIÁLOGO
        // ======================================================
        var dialogKeyHandler = function(e) {
            var key = e.key;
            var keyCode = e.keyCode;
            
            // Navegação para baixo/direita
            if (key === 'ArrowDown' || keyCode === 40 || key === 'ArrowRight' || keyCode === 39) {
                if ((key === 'ArrowRight' || keyCode === 39) && 
                    document.activeElement === input && 
                    input.selectionStart < input.value.length) {
                    return;
                }
                
                e.preventDefault();
                e.stopPropagation();
                self.navigateDialog('next');
                return;
            }
            
            // Navegação para cima/esquerda
            if (key === 'ArrowUp' || keyCode === 38 || key === 'ArrowLeft' || keyCode === 37) {
                if ((key === 'ArrowLeft' || keyCode === 37) && 
                    document.activeElement === input && 
                    input.selectionStart > 0) {
                    return;
                }
                
                e.preventDefault();
                e.stopPropagation();
                self.navigateDialog('prev');
                return;
            }

            // Enter - confirmar ação
            if (key === 'Enter' || keyCode === 13) {
                e.preventDefault();
                e.stopPropagation();
                
                var focused = self.dialogElements[self.dialogFocusIndex];
                
                if (focused === input || focused === okBtn) {
                    self.submitSearchDialog();
                } else if (focused === cancelBtn) {
                    self.closeSearchDialog();
                }
                return;
            }

            // Back/Escape - cancelar
            if (key === 'Escape' || keyCode === 27 || keyCode === 10009 || keyCode === 461) {
                e.preventDefault();
                e.stopPropagation();
                self.closeSearchDialog();
                return;
            }
            
            // Backspace - só fecha se input vazio E não está no input
            if (key === 'Backspace' || keyCode === 8) {
                if (document.activeElement === input && input.value.length > 0) {
                    return;
                }
                
                if (document.activeElement !== input) {
                    e.preventDefault();
                    e.stopPropagation();
                    self.closeSearchDialog();
                }
                return;
            }
        };

        // Registrar handler no diálogo
        dialog.addEventListener('keydown', dialogKeyHandler);

        // Click nos botões
        okBtn.addEventListener('click', function() {
            self.submitSearchDialog();
        });
        cancelBtn.addEventListener('click', function() {
            self.closeSearchDialog();
        });

        console.log('✅ Diálogo de busca navegável criado');
    },

    // ======================================================
    // 🆕 ABRIR DIÁLOGO
    // ======================================================
    openSearchDialog: function() {
        var self = this;
        
        if (this.isPromptOpen) {
            console.log('⚠️ Diálogo já está aberto');
            return;
        }

        console.log('⌨️ Abrindo diálogo de busca...');
        
        this.isPromptOpen = true;
        
        // Garantir que diálogo existe
        if (!document.getElementById('searchDialog')) {
            this.createSearchDialog();
        }
        
        var dialog = document.getElementById('searchDialog');
        var input = document.getElementById('searchDialogInput');
        
        if (!dialog || !input) {
            console.error('❌ Elementos do diálogo não encontrados');
            this.isPromptOpen = false;
            return;
        }

        // Preparar input
        input.value = this.lastSearchQuery || '';
        
        // Mostrar diálogo
        dialog.style.display = 'flex';
        
        // Resetar e focar
        this.dialogFocusIndex = 0;
        
        setTimeout(function() {
            input.focus();
            input.select();
            self.applyDialogFocusStyle(input);
        }, 150);

        // Marcar view
        if (typeof AppState !== 'undefined') {
            AppState.currentView = 'search-dialog';
        }
        
        console.log('✅ Diálogo aberto');
    },

    // ======================================================
    // 🆕 SUBMETER BUSCA
    // ======================================================
    submitSearchDialog: function() {
        var input = document.getElementById('searchDialogInput');
        var query = input ? input.value.trim() : '';

        this.closeSearchDialog();

        if (!query) {
            console.warn('❌ Busca vazia');
            if (typeof ChannelModule !== 'undefined') {
                ChannelModule.showMessage('⚠️ Digite algo para buscar', 2000);
            }
            return;
        }

        this.lastSearchQuery = query;
        this.performSearch(query);
    },

    // ======================================================
    // 🆕 FECHAR DIÁLOGO
    // ======================================================
    closeSearchDialog: function() {
        var self = this;
        
        console.log('🔒 Fechando diálogo de busca...');
        
        var dialog = document.getElementById('searchDialog');
        if (dialog) {
            dialog.style.display = 'none';
        }
        
        // Limpar estilos de foco
        this.dialogElements.forEach(function(el) {
            self.removeDialogFocusStyle(el);
        });
        
        this.isPromptOpen = false;
        this.dialogFocusIndex = 0;
        
        // Restaurar view anterior
        if (typeof AppState !== 'undefined') {
            if (AppState.currentPlaylist && AppState.currentPlaylist.length > 0) {
                AppState.currentView = 'channels';
                
                setTimeout(function() {
                    if (self.searchListItem && self.searchListItem.parentElement) {
                        self.searchListItem.focus();
                        console.log('🔙 Foco restaurado no botão de busca');
                    }
                }, 100);
            } else {
                AppState.currentView = 'playlists';
            }
        }
    },

    // ======================================================
    // 👁️ Mostrar botão de busca
    // ======================================================
    show: function() {
        var self = this;
        
        try {
            if (typeof AppState !== 'undefined' && AppState.returningFromSubcategory) {
                console.log('🔒 SearchModule: foco ignorado (retorno de subcategoria)');
                return;
            }

            this.channelContainer = document.getElementById('channelList');
            if (!this.channelContainer) {
                console.warn('⚠️ Container #channelList não encontrado');
                return;
            }

            // Remove botão duplicado
            var oldSearch = document.getElementById('searchCategoryItem');
            if (oldSearch && oldSearch.parentElement !== this.channelContainer) {
                oldSearch.remove();
            }

            // Evita duplicar
            if (this.channelContainer.querySelector('#searchCategoryItem')) {
                this.isVisible = true;
                return;
            }

            // Cria o botão
            var li = document.createElement('li');
            li.id = 'searchCategoryItem';
            li.className = 'category-header navigable search-category';
            li.tabIndex = 0;
            li.setAttribute('role', 'button');
            li.innerHTML = '<span>🔍 Buscar Canais</span>';

            li.style.cssText = 'color:rgb(0,230,118);padding:15px 10px;cursor:pointer;background:linear-gradient(45deg,rgb(26,26,26),rgb(42,42,42));border-radius:5px;margin-bottom:5px;border:2px solid transparent;transition:0.3s;display:flex;align-items:center;gap:10px;list-style:none;';

            li.addEventListener('focus', function() {
                li.style.borderColor = '#00e676';
                li.style.background = 'linear-gradient(45deg, #1a3a1a, #0a2a0a)';
                li.style.boxShadow = '0 0 15px rgba(0, 230, 118, 0.3)';
            });

            li.addEventListener('blur', function() {
                li.style.borderColor = 'transparent';
                li.style.background = 'linear-gradient(45deg, #1a1a1a, #2a2a2a)';
                li.style.boxShadow = 'none';
            });

            li.addEventListener('click', function() {
                self.openSearchDialog();
            });
            
            li.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.keyCode === 13) {
                    e.preventDefault();
                    self.openSearchDialog();
                }
            });

            this.channelContainer.prepend(li);
            this.searchListItem = li;
            this.isVisible = true;

            console.log('✅ Botão de busca adicionado');
        } catch (error) {
            console.error('❌ Erro ao exibir busca:', error);
        }
    },

    // ======================================================
    // 🚫 Ocultar botão
    // ======================================================
    hide: function() {
        var li = document.getElementById('searchCategoryItem');
        if (li) li.remove();
        this.isVisible = false;
    },

    // ======================================================
    // 🔍 Executar busca
    // ======================================================
    performSearch: function(query) {
        var self = this;
        
        if (typeof AppState === 'undefined' || !AppState.currentPlaylist || AppState.currentPlaylist.length === 0) {
            if (typeof ChannelModule !== 'undefined') {
                ChannelModule.showMessage('❌ Nenhuma playlist carregada', 3000);
            }
            return;
        }

        console.log('🔍 Buscando por:', query);
        var normalized = query.toLowerCase();

        var filtered = AppState.currentPlaylist.filter(function(ch) {
            var name = (ch.name || '').toLowerCase();
            var group = (ch.group || '').toLowerCase();
            var desc = (ch.description || '').toLowerCase();
            return name.indexOf(normalized) !== -1 || 
                   group.indexOf(normalized) !== -1 || 
                   desc.indexOf(normalized) !== -1;
        });

        if (filtered.length === 0) {
            if (typeof ChannelModule !== 'undefined') {
                ChannelModule.showMessage('❌ Nenhum canal encontrado para "' + query + '"', 3000);
            }
            return;
        }

        // 🆕 Salvar resultados para restauração posterior
        this.lastSearchResults = filtered;
        this.lastSearchQuery = query;

        this.showSearchOverlay(query, filtered);

        if (typeof ChannelModule !== 'undefined') {
            ChannelModule.showMessage('🔍 ' + filtered.length + ' canal(is) encontrado(s)', 2000);
        }
    },

    // ======================================================
    // 📺 Exibir overlay de resultados
    // ======================================================
    showSearchOverlay: function(query, channels) {
        var self = this;
        
        console.log('📺 Overlay de busca: "' + query + '" (' + channels.length + ' resultados)');

        var overlay = this.createOverlayElement();
        var title = document.getElementById('searchOverlayTitle');
        var grid = document.getElementById('searchOverlayChannelGrid');

        title.textContent = '🔍 Resultados para "' + query + '" (' + channels.length + ')';
        grid.innerHTML = '';
        
        this.overlayChannels = [];
        this.overlayFocusIndex = 0;
        this.wasOpenBeforePlayer = false;

        channels.forEach(function(channel, index) {
            var div = self.createChannelCard(channel, index);
            grid.appendChild(div);
            self.overlayChannels.push(div);
        });

        overlay.style.display = 'block';
        overlay.style.zIndex = '9000'; // Garantir z-index alto
        
        if (typeof AppState !== 'undefined') {
            AppState.currentView = 'search-overlay';
        }

        // Focar primeiro item
        if (this.overlayChannels.length > 0) {
            setTimeout(function() {
                self.setOverlayFocus(0);
            }, 150);
        }
    },

    // ======================================================
    // 🎴 Criar card de canal
    // ======================================================
    createChannelCard: function(channel, index) {
        var self = this;
        var div = document.createElement('div');
        div.className = 'search-channel-item navigable';
        div.tabIndex = 0;
        div.dataset.url = channel.url;
        div.dataset.name = channel.name;
        div.dataset.index = index;

        div.style.cssText = 'background:#2a2a2a;border:3px solid #444;border-radius:10px;padding:15px;cursor:pointer;color:white;transition:all 0.3s ease;display:flex;flex-direction:column;gap:8px;';

        div.innerHTML = '<div style="font-weight:bold;font-size:1.1em;color:#6bff6b;">▶️ ' + channel.name + '</div>' +
            '<div style="font-size:0.85em;color:#aaa;">📂 ' + (channel.group || 'Outros') + '</div>';

        div.addEventListener('click', function() {
            self.openChannel(channel, index);
        });
        
        div.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.keyCode === 13) {
                e.preventDefault();
                self.openChannel(channel, index);
            }
        });

        return div;
    },

    // ======================================================
    // 🎯 Controle de foco no overlay
    // ======================================================
    setOverlayFocus: function(index) {
        if (!this.overlayChannels || !this.overlayChannels.length) return;
        
        index = Math.max(0, Math.min(index, this.overlayChannels.length - 1));
        
        // Remover foco de todos
        this.overlayChannels.forEach(function(el) {
            el.classList.remove('focused');
            el.style.borderColor = '#444';
            el.style.background = '#2a2a2a';
            el.style.transform = 'scale(1)';
        });
        
        // Aplicar foco
        var el = this.overlayChannels[index];
        el.classList.add('focused');
        el.style.borderColor = '#00e676';
        el.style.background = '#1a3a1a';
        el.style.transform = 'scale(1.02)';
        
        el.focus();
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        this.overlayFocusIndex = index;
        
        console.log('🎯 Foco no canal:', index, el.dataset.name);
    },

    // ======================================================
    // ⬆️⬇️ Movimentação de foco
    // ======================================================
    moveOverlayFocus: function(delta) {
        if (!this.overlayChannels) return;
        var len = this.overlayChannels.length;
        if (len === 0) return;
        
        var next = this.overlayFocusIndex + delta;
        
        // Limitar aos bounds
        if (next < 0) next = 0;
        if (next >= len) next = len - 1;
        
        this.setOverlayFocus(next);
    },

    // ======================================================
    // 🎬 Abrir canal (CORRIGIDO - SALVA ESTADO)
    // ======================================================
    openChannel: function(channel, index) {
        console.log('╔═══════════════════════════════════════╗');
        console.log('🎬 SearchModule.openChannel()');
        console.log('   Canal:', channel.name);
        console.log('   Índice no overlay:', index);
        console.log('╚═══════════════════════════════════════╝');
        
        // 🆕 SALVAR ESTADO COMPLETO ANTES DE ABRIR PLAYER
        this.wasOpenBeforePlayer = true;
        this.lastFocusIndexBeforePlayer = this.overlayFocusIndex;
        
        // Salvar no AppState também para redundância
        if (typeof AppState !== 'undefined') {
            AppState.lastViewBeforePlayer = 'search-overlay';
            AppState.searchOverlayWasOpen = true;
            AppState.searchOverlayFocusIndex = this.overlayFocusIndex;
        }
        
        console.log('💾 Estado salvo:');
        console.log('   wasOpenBeforePlayer:', this.wasOpenBeforePlayer);
        console.log('   lastFocusIndexBeforePlayer:', this.lastFocusIndexBeforePlayer);
        console.log('   lastSearchQuery:', this.lastSearchQuery);
        console.log('   lastSearchResults:', this.lastSearchResults.length, 'canais');
        
        // Mover overlay para trás do player (mas não esconder)
        var overlay = document.getElementById('searchOverlay');
        if (overlay) {
            overlay.style.zIndex = '1000'; // Player fica em 10000
        }

        // Encontrar índice na playlist original
        var playlistIndex = -1;
        if (typeof AppState !== 'undefined' && AppState.currentPlaylist) {
            for (var i = 0; i < AppState.currentPlaylist.length; i++) {
                if (AppState.currentPlaylist[i].url === channel.url) {
                    playlistIndex = i;
                    break;
                }
            }
            AppState.setCurrentChannel(channel, playlistIndex);
        }
        
        if (typeof PlayerModule !== 'undefined') {
            PlayerModule.open(channel.url, channel.name, playlistIndex);
        }
    },

    // ======================================================
    // 🔙 Restaurar após player (CORRIGIDO)
    // ======================================================
    restoreAfterPlayer: function() {
        var self = this;
        
        console.log('╔═══════════════════════════════════════╗');
        console.log('🔙 SearchModule.restoreAfterPlayer()');
        console.log('   wasOpenBeforePlayer:', this.wasOpenBeforePlayer);
        console.log('   lastFocusIndex:', this.lastFocusIndexBeforePlayer);
        console.log('   lastSearchQuery:', this.lastSearchQuery);
        console.log('   lastSearchResults:', this.lastSearchResults ? this.lastSearchResults.length : 0);
        console.log('╚═══════════════════════════════════════╝');
        
        // Verificar se overlay estava aberto
        if (!this.wasOpenBeforePlayer) {
            console.log('⚠️ Overlay de busca não estava aberto antes do player');
            return false;
        }

        var overlay = document.getElementById('searchOverlay');
        
        // Se overlay ainda existe e tem resultados, apenas restaurar
        if (overlay && this.overlayChannels && this.overlayChannels.length > 0) {
            console.log('✅ Overlay ainda existe, restaurando visibilidade...');
            
            overlay.style.display = 'block';
            overlay.style.zIndex = '9000';
            
            if (typeof AppState !== 'undefined') {
                AppState.currentView = 'search-overlay';
            }
            
            // Restaurar foco
            setTimeout(function() {
                var focusIndex = self.lastFocusIndexBeforePlayer;
                if (focusIndex < 0 || focusIndex >= self.overlayChannels.length) {
                    focusIndex = 0;
                }
                
                console.log('🎯 Restaurando foco no índice:', focusIndex);
                self.setOverlayFocus(focusIndex);
            }, 150);

            this.wasOpenBeforePlayer = false;
            
            console.log('✅ Overlay de busca restaurado');
            return true;
        }
        
        // Se overlay foi destruído mas temos os resultados, recriar
        if (this.lastSearchResults && this.lastSearchResults.length > 0 && this.lastSearchQuery) {
            console.log('🔄 Recriando overlay de busca com resultados salvos...');
            
            var savedFocusIndex = this.lastFocusIndexBeforePlayer;
            
            this.showSearchOverlay(this.lastSearchQuery, this.lastSearchResults);
            
            // Restaurar foco após recriar
            setTimeout(function() {
                if (savedFocusIndex >= 0 && savedFocusIndex < self.overlayChannels.length) {
                    self.setOverlayFocus(savedFocusIndex);
                }
            }, 200);

            this.wasOpenBeforePlayer = false;
            
            console.log('✅ Overlay de busca recriado');
            return true;
        }
        
        console.log('⚠️ Não foi possível restaurar overlay de busca');
        this.wasOpenBeforePlayer = false;
        return false;
    },

    // ======================================================
    // 🧱 Criar overlay
    // ======================================================
    createOverlayElement: function() {
        var self = this;
        var overlay = document.getElementById('searchOverlay');
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = 'searchOverlay';
        overlay.tabIndex = -1;
        overlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:9000;overflow-y:auto;padding:20px;box-sizing:border-box;';

        overlay.innerHTML = '<div style="max-width:1400px;margin:0 auto;background:#1a1a1a;border-radius:15px;padding:25px;border:3px solid #00e676;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:15px;border-bottom:2px solid #333;flex-wrap:wrap;gap:10px;">' +
                '<h2 id="searchOverlayTitle" style="color:#00e676;margin:0;font-size:1.3em;"></h2>' +
                '<div style="display:flex;gap:10px;">' +
                    '<button id="searchOverlayNewSearch" tabindex="0" style="background:#667eea;color:white;border:3px solid transparent;padding:12px 20px;border-radius:8px;cursor:pointer;font-size:14px;transition:all 0.3s;">🔍 Nova Busca</button>' +
                    '<button id="searchOverlayCloseBtn" tabindex="0" style="background:#ff4444;color:white;border:3px solid transparent;padding:12px 20px;border-radius:8px;cursor:pointer;font-size:14px;transition:all 0.3s;">✕ Fechar</button>' +
                '</div>' +
            '</div>' +
            '<div id="searchOverlayChannelGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:15px;max-height:65vh;overflow-y:auto;padding:10px;"></div>' +
        '</div>';

        document.body.appendChild(overlay);
        
        // Botões do overlay
        var closeBtn = overlay.querySelector('#searchOverlayCloseBtn');
        var newSearchBtn = overlay.querySelector('#searchOverlayNewSearch');
        
        closeBtn.addEventListener('click', function() {
            self.hideOverlay();
        });
        
        newSearchBtn.addEventListener('click', function() {
            self.hideOverlay();
            setTimeout(function() {
                self.openSearchDialog();
            }, 200);
        });
        
        // Estilos de foco nos botões
        [closeBtn, newSearchBtn].forEach(function(btn) {
            btn.addEventListener('focus', function() {
                btn.style.borderColor = '#fff';
                btn.style.transform = 'scale(1.05)';
            });
            btn.addEventListener('blur', function() {
                btn.style.borderColor = 'transparent';
                btn.style.transform = 'scale(1)';
            });
        });
        
        return overlay;
    },

    // ======================================================
    // 🔒 Fechar overlay
    // ======================================================
    hideOverlay: function() {
        var self = this;
        
        console.log('🔒 Fechando overlay de busca...');
        
        var overlay = document.getElementById('searchOverlay');
        if (overlay) {
            overlay.style.display = 'none';
            overlay.style.zIndex = '9000';
        }
        
        // 🆕 NÃO limpar resultados - manter para possível restauração
        // this.lastSearchResults = []; // Comentado para manter
        // this.lastSearchQuery = ''; // Comentado para manter
        
        this.overlayChannels = [];
        this.overlayFocusIndex = 0;
        this.wasOpenBeforePlayer = false;
        
        // Determinar para onde voltar
        var hasPlaylist = typeof AppState !== 'undefined' && 
                          AppState.currentPlaylist && 
                          AppState.currentPlaylist.length > 0;
        
        if (hasPlaylist) {
            console.log('📂 Retornando para categorias');
            
            AppState.returningFromSubcategory = true;
            AppState.currentView = 'channels';
            
            setTimeout(function() {
                var searchBtn = document.getElementById('searchCategoryItem');
                var headers = document.querySelectorAll('.category-header');
                
                if (searchBtn && searchBtn.parentElement) {
                    searchBtn.focus();
                    if (typeof NavigationModule !== 'undefined') {
                        NavigationModule.setFocusElement(searchBtn);
                    }
                } else if (headers.length > 0) {
                    headers[0].focus();
                    if (typeof NavigationModule !== 'undefined') {
                        NavigationModule.setFocusElement(headers[0]);
                    }
                }
                
                setTimeout(function() {
                    AppState.returningFromSubcategory = false;
                }, 150);
            }, 100);
            
        } else if (typeof AppState !== 'undefined') {
            AppState.currentView = 'playlists';
            
            if (typeof PlaylistModule !== 'undefined') {
                setTimeout(function() {
                    PlaylistModule.focusFirstPlaylist();
                }, 100);
            }
        }
        
        console.log('✅ Overlay fechado');
    },

    // ======================================================
    // 👀 Observador de mudanças
    // ======================================================
    observeListChanges: function() {
        var self = this;
        
        try {
            var listContainer = document.getElementById('channelList');
            if (!listContainer) return;

            if (this._observer) {
                this._observer.disconnect();
            }

            this._observer = new MutationObserver(function(mutations) {
                if (typeof AppState !== 'undefined' && AppState.returningFromSubcategory) return;
                
                for (var i = 0; i < mutations.length; i++) {
                    if (mutations[i].type === 'childList') {
                        if (!document.getElementById('searchCategoryItem')) {
                            setTimeout(function() {
                                self.show();
                            }, 150);
                        }
                    }
                }
            });

            this._observer.observe(listContainer, {
                childList: true,
                subtree: false
            });

            console.log('👁️ Observador ativado');
        } catch (err) {
            console.error('❌ Erro no observador:', err);
        }
    }
};

// ======================================================
// 🎮 NAVEGAÇÃO POR TECLADO NO OVERLAY
// ======================================================
document.addEventListener('keydown', function(e) {
    // Ignorar se estiver no diálogo
    if (typeof AppState !== 'undefined' && AppState.currentView === 'search-dialog') {
        return;
    }
    
    // Só processar overlay de busca
    if (typeof AppState === 'undefined' || AppState.currentView !== 'search-overlay') return;
    
    var overlay = document.getElementById('searchOverlay');
    if (!overlay || overlay.style.display === 'none') return;

    switch (e.key) {
        case 'ArrowUp':
            e.preventDefault();
            e.stopPropagation();
            SearchModule.moveOverlayFocus(-3);
            break;
        case 'ArrowLeft':
            e.preventDefault();
            e.stopPropagation();
            SearchModule.moveOverlayFocus(-1);
            break;
        case 'ArrowDown':
            e.preventDefault();
            e.stopPropagation();
            SearchModule.moveOverlayFocus(3);
            break;
        case 'ArrowRight':
            e.preventDefault();
            e.stopPropagation();
            SearchModule.moveOverlayFocus(1);
            break;
        case 'Backspace':
        case 'Escape':
        case 'BrowserBack':
            e.preventDefault();
            e.stopPropagation();
            SearchModule.hideOverlay();
            break;
        default:
            // Tizen BACK
            if (e.keyCode === 10009 || e.keyCode === 461) {
                e.preventDefault();
                e.stopPropagation();
                SearchModule.hideOverlay();
            }
            break;
    }
});

// ======================================================
// 🔄 LISTENER PARA RETORNO DO PLAYER (CORRIGIDO)
// ======================================================
window.addEventListener('player-closed', function() {
    console.log('╔═══════════════════════════════════════╗');
    console.log('📺 SearchModule: Evento player-closed recebido');
    console.log('╚═══════════════════════════════════════╝');
    
    // Verificar se o SearchModule estava aberto
    var shouldRestore = false;
    
    // Verificar flag local
    if (SearchModule.wasOpenBeforePlayer) {
        console.log('✅ Flag wasOpenBeforePlayer está ativa');
        shouldRestore = true;
    }
    
    // Verificar AppState como backup
    if (typeof AppState !== 'undefined') {
        console.log('   AppState.lastViewBeforePlayer:', AppState.lastViewBeforePlayer);
        console.log('   AppState.searchOverlayWasOpen:', AppState.searchOverlayWasOpen);
        
        if (AppState.lastViewBeforePlayer === 'search-overlay' || AppState.searchOverlayWasOpen) {
            shouldRestore = true;
        }
    }
    
    if (shouldRestore) {
        console.log('🔄 Tentando restaurar overlay de busca...');
        var restored = SearchModule.restoreAfterPlayer();
        
        if (restored && typeof AppState !== 'undefined') {
            // Limpar flags do AppState
            AppState.lastViewBeforePlayer = null;
            AppState.searchOverlayWasOpen = false;
            AppState.searchOverlayFocusIndex = 0;
        }
    } else {
        console.log('ℹ️ Overlay de busca não precisa ser restaurado');
    }
});

// ======================================================
// 🔄 Inicialização
// ======================================================
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        if (typeof SearchModule !== 'undefined') {
            SearchModule.init();
        }
    }, 400);
});

console.log('✅ SearchModule v5.1 carregado (Restauração de overlay corrigida)');
