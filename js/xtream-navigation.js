/**
 * XtreamNavigation v1.3
 * - Compatível com controle remoto Samsung Tizen
 * - Sistema de ordenação via CH+/CH-
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

    init() {
        this.loadSortMode();
        this.registerTizenKeys();
        this.attachKeyHandler();
        console.log('✅ XtreamNavigation v1.3 | Ordenação:', this.sortMode);
    },

    loadSortMode() {
        try {
            const saved = localStorage.getItem('xtreamSortMode');
            if (saved && this.sortModes.includes(saved)) {
                this.sortMode = saved;
            }
        } catch (e) {}
    },

    saveSortMode() {
        try {
            localStorage.setItem('xtreamSortMode', this.sortMode);
        } catch (e) {}
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
            n.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.95);color:#0f0;padding:15px 30px;border-radius:8px;font-size:18px;z-index:10000;border:2px solid #0f0;pointer-events:none;';
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

    registerTizenKeys() {
        try {
            if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
                ['ChannelUp', 'ChannelDown', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'Info', '0','1','2','3','4','5','6','7','8','9'].forEach(k => {
                    try { tizen.tvinputdevice.registerKey(k); } catch(e) {}
                });
                console.log('🎮 Teclas Tizen registradas');
            }
        } catch (e) {}
    },

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
    jumpToEnd() { this.focusIndex = this.items.length - 1; this.updateFocus(); },

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

    attachKeyHandler() {
        const K = this.TIZEN_KEYS;
        
        document.addEventListener('keydown', (e) => {
            const code = e.keyCode || e.which;
            const key = e.key;

            console.log(`🎮 Key: "${key}" Code: ${code}`);

            // Previne default para teclas de navegação
            if ([K.UP, K.DOWN, K.LEFT, K.RIGHT, K.ENTER, K.OK, K.BACK, K.EXIT, K.CHANNEL_UP, K.CHANNEL_DOWN, K.RED, K.GREEN, 27, 8].includes(code)) {
                e.preventDefault();
                e.stopPropagation();
            }

            // Navegação
            if (code === K.UP || key === 'ArrowUp') return this.moveFocusVertical(-1);
            if (code === K.DOWN || key === 'ArrowDown') return this.moveFocusVertical(1);
            if (code === K.LEFT || key === 'ArrowLeft') return this.moveFocusHorizontal(-1);
            if (code === K.RIGHT || key === 'ArrowRight') return this.moveFocusHorizontal(1);

            // Seleção
            if (code === K.ENTER || code === K.OK || key === 'Enter') return this.selectCurrent();

            // Voltar
            if (code === K.BACK || code === K.EXIT || key === 'Escape' || key === 'Backspace' || code === 27 || code === 8) {
                return document.dispatchEvent(new CustomEvent('xtream:back'));
            }

            // ORDENAÇÃO - CH+ / CH-
            if (code === K.CHANNEL_UP) return this.nextSortMode();
            if (code === K.CHANNEL_DOWN) return this.prevSortMode();
            
            // Tecla S também alterna ordenação
            if (key === 's' || key === 'S') {
                e.preventDefault();
                return this.nextSortMode();
            }

            // Teclas coloridas
            if (code === K.RED) return this.jumpToStart();
            if (code === K.GREEN) return this.jumpToEnd();
            if (code === K.YELLOW) return document.dispatchEvent(new CustomEvent('xtream:yellow'));
            if (code === K.BLUE) return document.dispatchEvent(new CustomEvent('xtream:blue'));

            // Números - pula para %
            if (code >= K.NUM_0 && code <= K.NUM_9) {
                const num = code - K.NUM_0;
                const pct = num === 0 ? 1 : num / 10;
                this.focusIndex = Math.floor((this.items.length - 1) * pct);
                this.updateFocus();
            }
        }, true);
    }
};

document.addEventListener('DOMContentLoaded', () => XtreamNavigation.init());
window.XtreamNavigation = XtreamNavigation;
console.log('✅ XtreamNavigation v1.3 carregado');