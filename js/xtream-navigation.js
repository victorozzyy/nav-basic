// js/xtream-navigation.js
/**
 * XtreamNavigation v1.5
 * - Compatível com controle remoto Samsung Tizen
 * - Sistema de ordenação via CH+/CH-
 * - Suporte a campo de busca via teclas coloridas
 * - Seta ↑ no primeiro item → foca no input de busca
 */

const XtreamNavigation = {
    // Estado
    currentScreen: 'menu',
    focusIndex: 0,
    items: [],
    columns: 3,
    history: [],

    // Ordenação
    sortMode: 'none',
    sortModes: ['none', 'alphabetical', 'year'],
    sortModeNames: {
        'none': { icon: '📋', text: 'Padrão', fullText: 'Ordem Original' },
        'alphabetical': { icon: '🔤', text: 'A-Z', fullText: 'Alfabética' },
        'year': { icon: '📅', text: 'Ano', fullText: 'Por Ano' }
    },

    // Busca
    _searchInputFocused: false,

    // Teclas Tizen
    TIZEN_KEYS: {
        UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39,
        ENTER: 13, OK: 65385,
        BACK: 10009, EXIT: 10182,
        RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,
        CHANNEL_UP: 427, CHANNEL_DOWN: 428,
        NUM_0: 48, NUM_1: 49, NUM_2: 50, NUM_3: 51, NUM_4: 52,
        NUM_5: 53, NUM_6: 54, NUM_7: 55, NUM_8: 56, NUM_9: 57,
        INFO: 457
    },

    // Telas que possuem campo de busca
    SCREENS_WITH_SEARCH: ['categories', 'channels', 'series', 'search'],

    init() {
        this.loadSortMode();
        this.registerTizenKeys();
        this.attachKeyHandler();
        console.log('✅ XtreamNavigation v1.5 | Ordenação:', this.sortMode);
    },

    // ═══════════════════════════════════════════════════════════
    // ORDENAÇÃO
    // ═══════════════════════════════════════════════════════════

    loadSortMode() {
        try {
            const saved = localStorage.getItem('xtreamSortMode');
            if (saved && this.sortModes.includes(saved)) this.sortMode = saved;
        } catch (e) {}
    },

    saveSortMode() {
        try { localStorage.setItem('xtreamSortMode', this.sortMode); } catch (e) {}
    },

    nextSortMode() {
        const idx = this.sortModes.indexOf(this.sortMode);
        this.sortMode = this.sortModes[(idx + 1) % this.sortModes.length];
        this.saveSortMode();
        this.showSortNotification();
        document.dispatchEvent(new CustomEvent('xtream:sortChanged', { detail: { mode: this.sortMode } }));
        return this.sortMode;
    },

    prevSortMode() {
        const idx = this.sortModes.indexOf(this.sortMode);
        this.sortMode = this.sortModes[(idx - 1 + this.sortModes.length) % this.sortModes.length];
        this.saveSortMode();
        this.showSortNotification();
        document.dispatchEvent(new CustomEvent('xtream:sortChanged', { detail: { mode: this.sortMode } }));
        return this.sortMode;
    },

    getSortModeInfo() {
        return this.sortModeNames[this.sortMode] || this.sortModeNames['none'];
    },

    showSortNotification() {
        let n = document.getElementById('sortNotification');
        if (!n) {
            n = document.createElement('div');
            n.id = 'sortNotification';
            n.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);' +
                'background:rgba(0,0,0,0.95);color:#0f0;padding:15px 30px;border-radius:8px;' +
                'font-size:18px;z-index:10000;border:2px solid #0f0;pointer-events:none;';
            document.body.appendChild(n);
        }
        const info = this.getSortModeInfo();
        n.textContent = `${info.icon} ${info.fullText}`;
        n.style.opacity = '1';
        n.style.display = 'block';
        clearTimeout(this._sortTimeout);
        this._sortTimeout = setTimeout(() => {
            n.style.opacity = '0';
            setTimeout(() => n.style.display = 'none', 300);
        }, 2000);
    },

    // ═══════════════════════════════════════════════════════════
    // TIZEN KEYS
    // ═══════════════════════════════════════════════════════════

    registerTizenKeys() {
        try {
            if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
                ['ChannelUp', 'ChannelDown',
                 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
                 'Info', 'Search',
                 '0','1','2','3','4','5','6','7','8','9'].forEach(k => {
                    try { tizen.tvinputdevice.registerKey(k); } catch(e) {}
                });
                console.log('🎮 Teclas Tizen registradas (incluindo Search)');
            }
        } catch (e) {}
    },

    // ═══════════════════════════════════════════════════════════
    // FOCO E NAVEGAÇÃO
    // ═══════════════════════════════════════════════════════════

    setItems(selector, startIndex = 0) {
        this.items = Array.from(document.querySelectorAll(selector));
        this.focusIndex = Math.min(Math.max(0, startIndex), this.items.length - 1);
        this.updateFocus();
    },

    setColumns(cols) { this.columns = cols; },

    updateFocus() {
        this.items.forEach(i => i.classList.remove('focused'));
        if (this.items[this.focusIndex]) {
            this.items[this.focusIndex].classList.add('focused');
            this.items[this.focusIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    moveFocusVertical(dir) {
        const newIdx = this.focusIndex + dir;
        if (newIdx >= 0 && newIdx < this.items.length) {
            this.focusIndex = newIdx;
            this.updateFocus();
        }
    },

    moveFocusHorizontal(dir) {
        let newIdx = this.focusIndex + (this.columns * dir);
        newIdx = Math.max(0, Math.min(this.items.length - 1, newIdx));
        if (newIdx !== this.focusIndex) {
            this.focusIndex = newIdx;
            this.updateFocus();
        }
    },

    jumpToStart() { this.focusIndex = 0; this.updateFocus(); },
    jumpToEnd()   { this.focusIndex = this.items.length - 1; this.updateFocus(); },

    selectCurrent() {
        if (this.items[this.focusIndex]) this.items[this.focusIndex].click();
    },

    navigateTo(screen) {
        this.history.push({ screen: this.currentScreen, focusIndex: this.focusIndex });
        this.currentScreen = screen;
        this.focusIndex = 0;
    },

    goBack() {
        if (this.history.length > 0) {
            const prev = this.history.pop();
            this.currentScreen = prev.screen;
            this.focusIndex = prev.focusIndex;
            return prev;
        }
        return null;
    },

    getSavedFocusIndex() { return this.focusIndex; },

    // ═══════════════════════════════════════════════════════════
    // BUSCA — helpers
    // ═══════════════════════════════════════════════════════════

    isSearchInputFocused() {
        if (this._searchInputFocused) return true;
        const active = document.activeElement;
        return active && active.tagName === 'INPUT' && active.type === 'text';
    },

    setSearchInputFocused(focused) {
        this._searchInputFocused = focused;
    },

    /**
     * Foca no input de busca da tela atual
     * @returns {boolean} true se focou com sucesso
     */
    focusSearchInput() {
        const inputMap = {
            'categories': 'categorySearchInput',
            'channels':   'channelSearchInput',
            'series':     'seriesSearchInput',
            'search':     'globalSearchInput'
        };

        const inputId = inputMap[this.currentScreen];
        if (inputId) {
            const input = document.getElementById(inputId);
            if (input) {
                input.focus();
                input.select();
                this.showSearchHint('Digite para filtrar...');
                return true;
            }
        }
        return false;
    },

    /**
     * Verifica se a tela atual tem campo de busca
     */
    currentScreenHasSearch() {
        return this.SCREENS_WITH_SEARCH.includes(this.currentScreen);
    },

    /**
     * Mostra dica visual de que a busca foi ativada
     */
    showSearchHint(text) {
        let hint = document.getElementById('searchHint');
        if (!hint) {
            hint = document.createElement('div');
            hint.id = 'searchHint';
            hint.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);' +
                'background:rgba(0,0,0,0.95);color:#0af;padding:12px 24px;border-radius:8px;' +
                'font-size:16px;z-index:10000;border:2px solid #0af;pointer-events:none;' +
                'transition:opacity 0.3s;';
            document.body.appendChild(hint);
        }
        hint.textContent = `🔍 ${text}`;
        hint.style.opacity = '1';
        hint.style.display = 'block';

        clearTimeout(this._searchHintTimeout);
        this._searchHintTimeout = setTimeout(() => {
            hint.style.opacity = '0';
            setTimeout(() => hint.style.display = 'none', 300);
        }, 2000);
    },

    // ═══════════════════════════════════════════════════════════
    // KEY HANDLER
    // ═══════════════════════════════════════════════════════════

    attachKeyHandler() {
        const K = this.TIZEN_KEYS;

        document.addEventListener('keydown', (e) => {
            const code = e.keyCode || e.which;
            const key = e.key;

            console.log(`🎮 Key: "${key}" Code: ${code}`);

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // INPUT DE BUSCA FOCADO — tratamento especial
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            if (this.isSearchInputFocused()) {
                // ↓ Seta para baixo → sai do input, foca na lista
                if (code === K.DOWN || key === 'ArrowDown') {
                    e.preventDefault();
                    e.stopPropagation();
                    document.activeElement.blur();
                    if (this.items.length > 0) {
                        this.focusIndex = 0;
                        this.updateFocus();
                    }
                    return;
                }
                // Enter → confirma e sai do input
                if (code === K.ENTER || code === K.OK || key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    document.activeElement.blur();
                    if (this.items.length > 0) {
                        this.focusIndex = 0;
                        this.updateFocus();
                    }
                    return;
                }
                // Escape / Back → limpa ou sai
                if (code === K.BACK || code === K.EXIT || key === 'Escape' || code === 27) {
                    e.preventDefault();
                    e.stopPropagation();
                    const input = document.activeElement;
                    if (input && input.value && input.value.length > 0) {
                        input.value = '';
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    } else {
                        input.blur();
                        document.dispatchEvent(new CustomEvent('xtream:back'));
                    }
                    return;
                }
                // Todas as outras teclas → input processa normalmente
                return;
            }

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // NAVEGAÇÃO NORMAL (input NÃO focado)
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            // Previne default para teclas de controle
            if ([K.UP, K.DOWN, K.LEFT, K.RIGHT, K.ENTER, K.OK,
                 K.BACK, K.EXIT, K.CHANNEL_UP, K.CHANNEL_DOWN,
                 K.RED, K.GREEN, K.YELLOW, K.BLUE, 27, 8].includes(code)) {
                e.preventDefault();
                e.stopPropagation();
            }

            // ──────────────────────────────────────────────────
            // 🔵 AZUL → Foca na busca LOCAL da tela atual
            // ──────────────────────────────────────────────────
            if (code === K.BLUE || key === 'ColorF3Blue') {
                if (this.currentScreenHasSearch()) {
                    const focused = this.focusSearchInput();
                    if (focused) {
                        this.showSearchHint('Busca local ativada');
                        return;
                    }
                }
                // Se não tem busca na tela atual, abre busca global
                document.dispatchEvent(new CustomEvent('xtream:openSearch'));
                return;
            }

            // ──────────────────────────────────────────────────
            // 🟡 AMARELO → Abre busca GLOBAL (de qualquer tela)
            // ──────────────────────────────────────────────────
            if (code === K.YELLOW || key === 'ColorF2Yellow') {
                document.dispatchEvent(new CustomEvent('xtream:openSearch'));
                return;
            }

            // ──────────────────────────────────────────────────
            // ↑ Seta CIMA no primeiro item → foca na busca
            // ──────────────────────────────────────────────────
            if (code === K.UP || key === 'ArrowUp') {
                // Se já está no primeiro item E a tela tem busca → foca no input
                if (this.focusIndex === 0 && this.currentScreenHasSearch()) {
                    const focused = this.focusSearchInput();
                    if (focused) return;
                }
                return this.moveFocusVertical(-1);
            }

            // Navegação normal
            if (code === K.DOWN  || key === 'ArrowDown')  return this.moveFocusVertical(1);
            if (code === K.LEFT  || key === 'ArrowLeft')  return this.moveFocusHorizontal(-1);
            if (code === K.RIGHT || key === 'ArrowRight') return this.moveFocusHorizontal(1);

            // Seleção
            if (code === K.ENTER || code === K.OK || key === 'Enter') return this.selectCurrent();

            // Voltar
            if (code === K.BACK || code === K.EXIT || key === 'Escape' ||
                key === 'Backspace' || code === 27 || code === 8) {
                return document.dispatchEvent(new CustomEvent('xtream:back'));
            }

            // ORDENAÇÃO — CH+ / CH-
            if (code === K.CHANNEL_UP)   return this.nextSortMode();
            if (code === K.CHANNEL_DOWN) return this.prevSortMode();

            // Tecla S alterna ordenação
            if (key === 's' || key === 'S') {
                e.preventDefault();
                return this.nextSortMode();
            }

            // Teclas coloridas restantes
            if (code === K.RED)   return this.jumpToStart();
            if (code === K.GREEN) return this.jumpToEnd();

            // ──────────────────────────────────────────────────
            // Tecla digitável → auto-foca na busca
            // ──────────────────────────────────────────────────
            if (key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                if (this.currentScreenHasSearch()) {
                    const focused = this.focusSearchInput();
                    if (focused) return; // Letra será digitada no input
                }
            }

            // Números — pula para % (apenas se NÃO tem busca na tela)
            if (code >= K.NUM_0 && code <= K.NUM_9) {
                if (!this.currentScreenHasSearch()) {
                    const num = code - K.NUM_0;
                    const pct = num === 0 ? 1 : num / 10;
                    this.focusIndex = Math.floor((this.items.length - 1) * pct);
                    this.updateFocus();
                }
                // Se tem busca, a tecla numérica já foi tratada acima (auto-foco)
            }
        }, true);
    }
};

document.addEventListener('DOMContentLoaded', () => XtreamNavigation.init());
window.XtreamNavigation = XtreamNavigation;
console.log('✅ XtreamNavigation v1.5 carregado');
