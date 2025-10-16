
"use strict";

// =========================================================================
// 1. CONFIGURACIÓ, ESTAT GLOBAL I CACHE D'ELEMENTS DOM
// =========================================================================

const INTERVAL_MAP = [
    { semitones: 0, name: 'Uníson', btnName: 'Uníson' },
    { semitones: 1, name: '2a menor', btnName: '2a m' },
    { semitones: 2, name: '2a major', btnName: '2a M' },
    { semitones: 3, name: '3a menor', btnName: '3a m' },
    { semitones: 4, name: '3a major', btnName: '3a M' },
    { semitones: 5, name: '4a Justa', btnName: '4a J' },
    { semitones: 6, name: 'Tritò', btnName: 'Tritò' },
    { semitones: 7, name: '5a Justa', btnName: '5a J' },
    { semitones: 8, name: '6a menor', btnName: '6a m' },
    { semitones: 9, name: '6a major', btnName: '6a M' },
    { semitones: 10, name: '7a menor', btnName: '7a m' },
    { semitones: 11, name: '7a major', btnName: '7a M' },
    { semitones: 12, name: '8a Justa', btnName: '8a J' },
];

const getIntervalInfo = (semitones) => INTERVAL_MAP.find(i => i.semitones === semitones);

const DIFFICULTY_CONFIG = {
    'inicial': { semitones: [0, 2, 4, 5, 7, 9, 11, 12], directions: ['ascendente'], name: 'Inicial' },
    'intermedio': { semitones: INTERVAL_MAP.map(i => i.semitones), directions: ['ascendente'], name: 'Intermedi' },
    'dificil': { semitones: INTERVAL_MAP.map(i => i.semitones), directions: ['ascendente', 'descendente'], name: 'Difícil' }
};

const SEMITONE_NOTE_MAP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Enhanced enharmonic mapping for proper interval calculation
const ENHARMONIC_MAP = {
    0: ['C'],
    1: ['C#', 'Db'],
    2: ['D'],
    3: ['D#', 'Eb'],
    4: ['E'],
    5: ['F'],
    6: ['F#', 'Gb'],
    7: ['G'],
    8: ['G#', 'Ab'],
    9: ['A'],
    10: ['A#', 'Bb'],
    11: ['B']
};

// Circle of fifths for determining preferred accidentals
const SHARP_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const FLAT_KEYS = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];

const MIN_NOTE_MIDI = 45; // A2
const MAX_NOTE_MIDI = 69; // A4

const PITCH_RANGE_MIDI_MIN = 33; // A1 (for safety margin)
const PITCH_RANGE_MIDI_MAX = 81; // A5 (for safety margin)

const AppState = {
    difficulty: null,
    currentIntervalSemitones: null,
    currentDirection: null,
    startNoteMIDI: null,
    selectedInterval: null,
    selectedDirection: 'ascendente',
    timer: 30,
    timerId: null,
    isChecking: false,
    totalAttempts: 0,
    correctAnswers: 0,
    isVexFlowLoaded: false,
    vexFlow: {
        renderer: null,
        stave: null,
        context: null,
    },
    lastVFNotes: null,
};

const DOM = {};

// Resolució robusta del namespace de VexFlow per compatibilitat entre versions (v3 i v4+)
function getVexFlowNamespace() {
    const globalObj = typeof window !== 'undefined' ? window : globalThis;
    if (!globalObj) return null;
    // v3 UMD habitual: window.Vex.Flow
    if (globalObj.Vex && globalObj.Vex.Flow) return globalObj.Vex.Flow;
    // v4 UMD bundler: classes directes a window.Vex
    if (globalObj.Vex && !globalObj.Vex.Flow) return globalObj.Vex;
    // Algunes builds poden exposar window.VexFlow
    if (globalObj.VexFlow) return globalObj.VexFlow;
    return null;
}

function validateVexFlow(VF) {
    if (!VF) return { ok: false, reason: 'VF namespace not found' };
    const required = ['Renderer', 'Stave', 'StaveNote', 'Voice', 'Formatter'];
    const missing = required.filter(k => typeof VF[k] === 'undefined');
    if (missing.length > 0) {
        return { ok: false, reason: `Missing exports: ${missing.join(', ')}` };
    }
    if (!VF.Renderer.Backends || typeof VF.Renderer.Backends.SVG === 'undefined') {
        return { ok: false, reason: 'Renderer.Backends.SVG not available' };
    }
    return { ok: true };
}

function cacheDOMElements() {
    DOM.startScreen = document.getElementById('start-screen');
    DOM.gameScreen = document.getElementById('game-screen');
    DOM.loadingIndicator = document.getElementById('loading-indicator');
    DOM.introContent = document.getElementById('intro-content');
    DOM.difficultyDisplay = document.getElementById('current-difficulty');
    DOM.staveContainer = document.getElementById('stave-container');
    DOM.staveDisplayContainer = document.getElementById('stave-display');
    DOM.intervalButtonsContainer = document.getElementById('interval-buttons-container');
    DOM.btnAscendente = document.getElementById('btn-ascendente');
    DOM.btnDescendente = document.getElementById('btn-descendente');
    DOM.feedbackMessage = document.getElementById('feedback-message');
    DOM.btnCheck = document.getElementById('btn-check');
    DOM.btnNext = document.getElementById('btn-next');
    DOM.timerDisplay = document.getElementById('timer-display');
    DOM.scoreCorrect = document.getElementById('score-correct');
    DOM.scoreTotal = document.getElementById('score-total');
}

// =========================================================================
// 2. FUNCIONS DE VEXFLOW I UTILITAT MUSICAL
// =========================================================================

function midiToVexFlow(midiNote) {
    const octave = Math.floor(midiNote / 12) - 1;
    const semi = midiNote % 12;
    let noteName = SEMITONE_NOTE_MAP[semi];
    let accidental = '';
    if (noteName.length > 1) {
        accidental = noteName.substring(1);
        noteName = noteName.substring(0, 1);
    }
    return { key: `${noteName.toLowerCase()}/${octave}`, accidental: accidental };
}

// Utilitats de notació diatònica
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_BASE_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function normalizeOctaveForTarget(startOctave, startLetterIdx, targetLetterIdx, ascending) {
    let octave = startOctave;
    if (ascending) {
        if (targetLetterIdx < startLetterIdx) octave += 1;
    } else {
        if (targetLetterIdx > startLetterIdx) octave -= 1;
    }
    return octave;
}

function midiToSpelling(midiNote) {
    const octave = Math.floor(midiNote / 12) - 1;
    const semi = midiNote % 12;
    // Tria la lletra natural més propera (preferim naturals si possible)
    let bestLetter = 'C';
    let bestDiff = 999;
    for (const L of LETTERS) {
        const base = LETTER_BASE_SEMITONES[L];
        const diff = Math.abs(semi - base);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestLetter = L;
        }
    }
    const accidental = semi - LETTER_BASE_SEMITONES[bestLetter]; // pot ser negatiu
    return { letter: bestLetter, accidental: accidental, octave: octave };
}

function computeLetterStepsForSemitones(semitones) {
    const map = { 0:0, 1:1, 2:1, 3:2, 4:2, 5:3, 6:3, 7:4, 8:5, 9:5, 10:6, 11:6, 12:7 };
    return map[semitones] ?? 0;
}

function spelledToMidi(spell) {
    const base = LETTER_BASE_SEMITONES[spell.letter];
    const pitchClass = (base + spell.accidental + 12) % 12;
    const midi = (spell.octave + 1) * 12 + pitchClass;
    return midi;
}

function accidentalToVexSymbol(acc) {
    if (acc === -2) return 'bb';
    if (acc === -1) return 'b';
    if (acc === 1) return '#';
    if (acc === 2) return '##';
    return '';
}

function spellingToVexKey(spell) {
    return `${spell.letter.toLowerCase()}/${spell.octave}`;
}

function bestAccidentalForBaseToPitchClass(basePitchClass, targetPitchClass) {
    const deltaMod = (targetPitchClass - basePitchClass + 12) % 12;
    const candidates = [0, 1, -1, 2, -2];
    for (const c of candidates) {
        if (((c % 12) + 12) % 12 === deltaMod) return c;
    }
    // Fallback: pick closest within +/-2
    let best = 0;
    let bestDist = 999;
    for (let c = -2; c <= 2; c++) {
        const dist = Math.min((deltaMod - ((c + 12) % 12) + 12) % 12, (((c + 12) % 12) - deltaMod + 12) % 12);
        if (dist < bestDist) { bestDist = dist; best = c; }
    }
    return best;
}

// Enhanced function to determine proper enharmonic spelling based on interval theory
function getProperEnharmonicSpelling(startSpell, intervalSemitones, direction) {
    const ascending = direction !== 'descendente';
    const steps = computeLetterStepsForSemitones(intervalSemitones);
    const startLetterIdx = LETTERS.indexOf(startSpell.letter);
    const targetLetterIdx = (startLetterIdx + (ascending ? steps : -steps) + 7) % 7;
    const targetLetter = LETTERS[targetLetterIdx];
    
    let targetOctave = normalizeOctaveForTarget(startSpell.octave, startLetterIdx, targetLetterIdx, ascending);
    
    // For octave intervals, force octave change
    if (intervalSemitones === 12) {
        targetOctave = startSpell.octave + (ascending ? 1 : -1);
    }

    const startMidi = spelledToMidi(startSpell);
    const targetMidi = startMidi + (ascending ? intervalSemitones : -intervalSemitones);
    const targetPC = ((targetMidi % 12) + 12) % 12;
    
    // Determine if we should prefer sharps or flats based on the starting note's context
    const basePC = LETTER_BASE_SEMITONES[targetLetter];
    let accidental = (targetPC - basePC + 12) % 12;
    
    // Convert to proper accidental representation
    if (accidental > 6) {
        accidental = accidental - 12; // Use flats for large positive values
    }
    
    // Ensure we don't exceed reasonable accidental limits
    if (accidental > 2) accidental = 2;
    if (accidental < -2) accidental = -2;

    return {
        letter: targetLetter,
        accidental: accidental,
        octave: targetOctave
    };
}

function getIntervalNoteRenderData(startMidi, semitones, direction, enforceNaturals) {
    const ascending = direction !== 'descendente';
    const startSpell = midiToSpelling(startMidi);
    if (enforceNaturals) startSpell.accidental = 0;

    // Use enhanced enharmonic spelling for better interval accuracy
    const endSpell = getProperEnharmonicSpelling(startSpell, semitones, direction);
    if (enforceNaturals) endSpell.accidental = 0;

    const startVF = { key: spellingToVexKey(startSpell), accidental: accidentalToVexSymbol(startSpell.accidental) };
    const endVF = { key: spellingToVexKey(endSpell), accidental: accidentalToVexSymbol(endSpell.accidental) };
    
    // Validate the generated keys
    if (!startVF.key || !endVF.key) {
        console.error('Invalid VexFlow keys generated:', { startVF, endVF, startSpell, endSpell });
        // Fallback to simple MIDI conversion
        const fallbackStart = midiToVexFlow(startMidi);
        const fallbackEnd = midiToVexFlow(startMidi + (ascending ? semitones : -semitones));
        return { startVF: fallbackStart, endVF: fallbackEnd };
    }
    
    // Store the actual spellings used for interval validation
    AppState.lastVFNotes = {
        startSpell: startSpell,
        endSpell: endSpell,
        actualInterval: semitones,
        direction: direction
    };
    
    return { startVF, endVF };
}

function isNaturalSemiIndex(semiIndex) {
    // Naturals: C(0), D(2), E(4), F(5), G(7), A(9), B(11)
    return semiIndex === 0 || semiIndex === 2 || semiIndex === 4 || semiIndex === 5 || semiIndex === 7 || semiIndex === 9 || semiIndex === 11;
}

function isNaturalMidi(midiNote) {
    const semi = midiNote % 12;
    return isNaturalSemiIndex(semi);
}

// Intenta carregar VexFlow dinàmicament si no està disponible
function injectScript(src) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-dynamic-vexflow=\"${src}\"]`);
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('Script load error')));
            return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.defer = true;
        s.setAttribute('data-dynamic-vexflow', src);
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`Failed loading ${src}`));
        document.head.appendChild(s);
    });
}

async function attemptLoadVexFlowSequential(urls) {
    for (const url of urls) {
        try {
            console.warn(`Intentant carregar VexFlow des de: ${url}`);
            await injectScript(url);
            const ns = getVexFlowNamespace();
            if (ns) {
                console.log(`VexFlow carregat des de: ${url}`);
                return ns;
            }
        } catch (e) {
            console.warn(e && (e.message || e));
        }
    }
    return null;
}

function setupVexFlowRenderer(VF) {
    try {
        const container = DOM.staveDisplayContainer;
        if (!container) {
            throw new Error('Stave container not found');
        }

        // Clean up any existing content
        container.innerHTML = '';

        const containerWidth = DOM.staveContainer && typeof DOM.staveContainer.clientWidth === 'number' ? DOM.staveContainer.clientWidth : 0;
        const innerWidth = containerWidth - 16; // Reduced padding
        const safeInnerWidth = Number.isFinite(innerWidth) ? innerWidth : 0;
        const clampedWidth = Math.max(200, Math.min(safeInnerWidth > 0 ? safeInnerWidth : 500, 700)); // Smaller default
        const width = clampedWidth;
        const height = 120; // Reduced height

        // Validate VexFlow components before using them
        if (!VF.Renderer || !VF.Renderer.Backends || !VF.Renderer.Backends.SVG) {
            throw new Error('VexFlow Renderer or SVG backend not available');
        }

        const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
        if (!renderer) {
            throw new Error('Failed to create VexFlow renderer');
        }

        renderer.resize(width, height);
        const context = renderer.getContext();
        if (!context) {
            throw new Error('Failed to get VexFlow context');
        }

        const stave = new VF.Stave(10, 0, width - 20);
        if (!stave) {
            throw new Error('Failed to create VexFlow stave');
        }

        // Add clef and time signature with error handling
        try {
            stave.addClef('treble').addTimeSignature('2/4');
            stave.setContext(context).draw();
        } catch (error) {
            console.warn('Error adding clef/time signature:', error);
            // Try without time signature
            stave.addClef('treble');
            stave.setContext(context).draw();
        }

        AppState.vexFlow = { renderer, context, stave, VF };

        // Set up responsive SVG
        const svg = container.querySelector('svg');
        if (svg) {
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            svg.style.width = '100%';
            svg.style.height = 'auto';
            svg.style.maxWidth = '100%';
        }

        // Clean up existing event listeners to prevent memory leaks
        if (AppState.vexFlow.resizeObserver) {
            AppState.vexFlow.resizeObserver.disconnect();
        }

        // Set up resize handling
        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(() => {
                try {
                    handleResize();
                } catch (error) {
                    console.warn('Error in resize observer:', error);
                }
            });
            ro.observe(DOM.staveContainer);
            AppState.vexFlow.resizeObserver = ro;
        }

        // Add orientation change handler for mobile devices
        const orientationHandler = () => {
            setTimeout(() => {
                try {
                    handleResize();
                } catch (error) {
                    console.warn('Error in orientation change handler:', error);
                }
            }, 200);
        };

        window.removeEventListener('orientationchange', orientationHandler);
        window.addEventListener('orientationchange', orientationHandler);

    } catch (error) {
        console.error('Error setting up VexFlow renderer:', error);
        AppState.isVexFlowLoaded = false;
        if (DOM.staveDisplayContainer) {
            const safeMsg = (error && (error.message || String(error))) || 'Unknown setup error';
            DOM.staveDisplayContainer.innerHTML = `<div class="p-4 text-center text-gray-800">
                <p class="font-bold text-xl text-red-600">⚠️ Error d'Inicialització VexFlow</p>
                <p class="text-sm mt-1">${safeMsg}</p>
                <button onclick="IntervallyApp.recoverFromVexFlowError()" class="mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                    Intentar Recuperar
                </button>
                <p class="text-xs mt-2">O prova de recarregar la pàgina.</p>
            </div>`;
        }
        throw error;
    }
}

function drawInterval(note1VF, note2VF) {
    const container = DOM.staveDisplayContainer;
    
    // Check if we have valid note data
    if (!note1VF || !note2VF || !note1VF.key || !note2VF.key) {
        console.error('Invalid note data:', note1VF, note2VF);
        container.innerHTML = `<div class="p-4 text-center text-gray-800"><p class="font-bold text-xl text-red-600">⚠️ Dades de notes invàlides</p></div>`;
        return;
    }
    
    if (!AppState.isVexFlowLoaded) {
        container.innerHTML = `<div class="p-4 text-center text-gray-800"><p class="font-bold text-xl text-red-600">⚠️ Error de Càrrega Musical</p><p class="text-sm mt-1">No s'ha pogut carregar VexFlow per dibuixar el pentagrama.</p><p class="text-sm">La lògica de l'interval s'ha generat internament. Prem "Comprova" amb la teva resposta.</p></div>`;
        return;
    }

    const { VF } = AppState.vexFlow;
    if (!VF) {
        console.error('VexFlow namespace not available');
        return;
    }
    
    try {
        // Clear container and create fresh renderer
        container.innerHTML = '';
        
        const containerWidth = DOM.staveContainer ? DOM.staveContainer.clientWidth : 500;
        const width = Math.max(300, Math.min(containerWidth - 20, 600));
        const height = 120;

        const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
        renderer.resize(width, height);
        const context = renderer.getContext();
        
        const stave = new VF.Stave(10, 10, width - 20);
        stave.addClef('treble');
        stave.setContext(context).draw();
        
        // Create notes
        const notes = [
            new VF.StaveNote({ clef: 'treble', keys: [note1VF.key], duration: 'q' }),
            new VF.StaveNote({ clef: 'treble', keys: [note2VF.key], duration: 'q' })
        ];

        // Add accidentals if needed
        if (note1VF.accidental) {
            notes[0].addAccidental(0, new VF.Accidental(note1VF.accidental));
        }
        if (note2VF.accidental) {
            notes[1].addAccidental(0, new VF.Accidental(note2VF.accidental));
        }

        // Create voice and add notes
        const voice = new VF.Voice({ num_beats: 2, beat_value: 4 });
        voice.setStrict(false);
        voice.addTickables(notes);

        // Format and draw
        const formatter = new VF.Formatter();
        formatter.joinVoices([voice]).format([voice], width - 60);
        voice.draw(context, stave);
        
        // Update app state
        AppState.vexFlow.renderer = renderer;
        AppState.vexFlow.context = context;
        AppState.vexFlow.stave = stave;
        
    } catch (error) {
        console.error("Error drawing interval:", error);
        const safeMsg = error.message || 'Unknown error';
        container.innerHTML = `<div class="p-4 text-center text-gray-800">
            <p class="font-bold text-xl text-red-600">⚠️ Error de Visualització</p>
            <p class="text-sm mt-1">${safeMsg}</p>
            <button onclick="IntervallyApp.recoverFromVexFlowError()" class="mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                Intentar Recuperar
            </button>
        </div>`;
    }
}

function handleResize() {
    if (!AppState.isVexFlowLoaded || !DOM.staveContainer) return;

    const container = DOM.staveContainer;
    const containerWidth = container && typeof container.clientWidth === 'number' ? container.clientWidth : 0;
    const innerWidth = containerWidth - 16; // Reduced padding
    const safeInnerWidth = Number.isFinite(innerWidth) ? innerWidth : 0;
    const clampedWidth = Math.max(200, Math.min(safeInnerWidth > 0 ? safeInnerWidth : 500, 700)); // Smaller default
    const width = clampedWidth;
    const height = 120; // Reduced height

    AppState.vexFlow.renderer.resize(width, height);
    AppState.vexFlow.stave.setWidth(width - 20);

    if (AppState.startNoteMIDI && AppState.currentIntervalSemitones !== null && AppState.currentDirection) {
        const enforceNaturals = AppState.difficulty === 'inicial';
        const { startVF, endVF } = getIntervalNoteRenderData(
            AppState.startNoteMIDI, 
            AppState.currentIntervalSemitones, 
            AppState.currentDirection, 
            enforceNaturals
        );
        drawInterval(startVF, endVF);
    }
}

// =========================================================================
// 3. LÒGICA DE JOC
// =========================================================================

function switchView(viewName) {
    DOM.startScreen.classList.add('hidden');
    DOM.gameScreen.classList.add('hidden');
    document.body.classList.remove('game-active');
    
    if (viewName === 'start') {
        DOM.startScreen.classList.remove('hidden');
        // Show header and footer on start screen
        document.getElementById('main-header').style.display = 'block';
        document.getElementById('main-footer').style.display = 'block';
    } else if (viewName === 'game') {
        DOM.gameScreen.classList.remove('hidden');
        document.body.classList.add('game-active');
        // Minimize header during game, hide footer
        document.getElementById('main-header').style.display = 'none';
        document.getElementById('main-footer').style.display = 'none';
    }
}

function updateScoreDisplay() {
    if (DOM.scoreCorrect && DOM.scoreTotal) {
        DOM.scoreCorrect.textContent = AppState.correctAnswers;
        DOM.scoreTotal.textContent = AppState.totalAttempts;
    }
}

function startGame(difficultyKey) {
    AppState.difficulty = difficultyKey;
    AppState.totalAttempts = 0;
    AppState.correctAnswers = 0;
    AppState.selectedDirection = DIFFICULTY_CONFIG[difficultyKey].directions[0];
    DOM.difficultyDisplay.textContent = DIFFICULTY_CONFIG[difficultyKey].name;
    switchView('game');
    generateButtons();
    updateScoreDisplay();
    nextInterval();
}

// Function to calculate interval from actual note spellings
function calculateActualInterval(startSpell, endSpell) {
    const startMidi = spelledToMidi(startSpell);
    const endMidi = spelledToMidi(endSpell);
    return Math.abs(endMidi - startMidi);
}

function generateInterval() {
    const config = DIFFICULTY_CONFIG[AppState.difficulty];
    const intervalSemitones = config.semitones[Math.floor(Math.random() * config.semitones.length)];
    const direction = config.directions[Math.floor(Math.random() * config.directions.length)];
    AppState.currentIntervalSemitones = intervalSemitones;
    AppState.currentDirection = direction;

    let startNoteMIDI;
    let endNoteMIDI;

    if (direction === 'descendente') {
        // For descending intervals, start note must be high enough
        const safeMinStart = MIN_NOTE_MIDI + intervalSemitones;
        const actualMin = Math.max(MIN_NOTE_MIDI, safeMinStart);
        const actualMax = MAX_NOTE_MIDI;

        if (AppState.difficulty === 'inicial') {
            // For initial difficulty, prefer natural notes
            const candidates = [];
            for (let m = actualMin; m <= actualMax; m++) {
                const end = m - intervalSemitones;
                if (end >= MIN_NOTE_MIDI && end <= MAX_NOTE_MIDI && isNaturalMidi(m) && isNaturalMidi(end)) {
                    candidates.push(m);
                }
            }
            if (candidates.length > 0) {
                startNoteMIDI = candidates[Math.floor(Math.random() * candidates.length)];
            } else {
                // Fallback to any valid note in range
                startNoteMIDI = Math.floor(Math.random() * (actualMax - actualMin + 1)) + actualMin;
            }
        } else {
            startNoteMIDI = Math.floor(Math.random() * (actualMax - actualMin + 1)) + actualMin;
        }
        endNoteMIDI = startNoteMIDI - intervalSemitones;
    } else {
        // For ascending intervals, start note must be low enough
        const safeMaxStart = MAX_NOTE_MIDI - intervalSemitones;
        const actualMin = MIN_NOTE_MIDI;
        const actualMax = Math.min(MAX_NOTE_MIDI, safeMaxStart);

        if (AppState.difficulty === 'inicial') {
            const candidates = [];
            for (let m = actualMin; m <= actualMax; m++) {
                const end = m + intervalSemitones;
                if (end >= MIN_NOTE_MIDI && end <= MAX_NOTE_MIDI && isNaturalMidi(m) && isNaturalMidi(end)) {
                    candidates.push(m);
                }
            }
            if (candidates.length > 0) {
                startNoteMIDI = candidates[Math.floor(Math.random() * candidates.length)];
            } else {
                // Fallback to any valid note in range
                startNoteMIDI = Math.floor(Math.random() * (actualMax - actualMin + 1)) + actualMin;
            }
        } else {
            startNoteMIDI = Math.floor(Math.random() * (actualMax - actualMin + 1)) + actualMin;
        }
        endNoteMIDI = startNoteMIDI + intervalSemitones;
    }

    // Ensure both notes are within the A2-A4 range
    if (endNoteMIDI < MIN_NOTE_MIDI || endNoteMIDI > MAX_NOTE_MIDI) {
        console.warn(`Generated interval out of range. Start: ${startNoteMIDI}, End: ${endNoteMIDI}, adjusting...`);
        // Retry with adjusted parameters
        if (direction === 'descendente') {
            startNoteMIDI = Math.min(MAX_NOTE_MIDI, MIN_NOTE_MIDI + intervalSemitones + Math.floor(Math.random() * 12));
            endNoteMIDI = startNoteMIDI - intervalSemitones;
        } else {
            startNoteMIDI = Math.max(MIN_NOTE_MIDI, MAX_NOTE_MIDI - intervalSemitones - Math.floor(Math.random() * 12));
            endNoteMIDI = startNoteMIDI + intervalSemitones;
        }
    }

    AppState.startNoteMIDI = startNoteMIDI;
    const enforceNaturals = AppState.difficulty === 'inicial';
    
    const { startVF, endVF } = getIntervalNoteRenderData(startNoteMIDI, intervalSemitones, direction, enforceNaturals);
    drawInterval(startVF, endVF);

    resetUI();
    startTimer();
}

function resetUI() {
    AppState.isChecking = false;
    AppState.selectedInterval = null;
    AppState.selectedDirection = DIFFICULTY_CONFIG[AppState.difficulty].directions[0];
    DOM.feedbackMessage.textContent = '';
    DOM.btnCheck.disabled = true;
    DOM.btnNext.disabled = true;
    DOM.feedbackMessage.setAttribute('aria-live', 'off');


    document.querySelectorAll('.interval-button-choice, #btn-ascendente, #btn-descendente').forEach(btn => {
        btn.disabled = false;
        btn.setAttribute('aria-pressed', 'false');
        btn.classList.remove('bg-blue-400', 'bg-green-600', 'bg-red-600', 'ring-2', 'ring-offset-2', 'ring-blue-400', 'ring-green-600', 'ring-red-600', 'direction-disabled', 'opacity-50');
        if (btn.id.startsWith('interval-')) {
            btn.classList.add('bg-gray-700', 'hover:bg-gray-600');
        } else {
            btn.classList.add('bg-gray-600', 'hover:bg-gray-500');
        }
    });
    setupDirectionButtons();
}

function nextInterval() {
    stopTimer();
    generateInterval();
}

function enableCheckButton() {
    if (!AppState.isChecking && AppState.selectedInterval !== null && AppState.selectedDirection !== null) {
        DOM.btnCheck.disabled = false;
    } else {
        DOM.btnCheck.disabled = true;
    }
}

function selectInterval(semitones) {
    if (AppState.isChecking) return;
    AppState.selectedInterval = semitones;
    document.querySelectorAll('.interval-button-choice').forEach(btn => {
        btn.setAttribute('aria-pressed', 'false');
        btn.classList.remove('bg-blue-400', 'ring-2', 'ring-offset-2', 'ring-blue-400');
        btn.classList.add('bg-gray-700', 'hover:bg-gray-600');
    });
    const selectedBtn = document.getElementById(`interval-${semitones}`);
    if (selectedBtn) {
        selectedBtn.setAttribute('aria-pressed', 'true');
        selectedBtn.classList.add('bg-blue-400', 'ring-2', 'ring-offset-2', 'ring-blue-400');
        selectedBtn.classList.remove('bg-gray-700', 'hover:bg-gray-600');
    }
    enableCheckButton();
}

function selectDirection(direction) {
    const configDirections = DIFFICULTY_CONFIG[AppState.difficulty].directions;
    if (AppState.isChecking || configDirections.length === 1) return;
    AppState.selectedDirection = direction;
    
    DOM.btnAscendente.setAttribute('aria-pressed', direction === 'ascendente');
    DOM.btnDescendente.setAttribute('aria-pressed', direction === 'descendente');

    const targetBtn = direction === 'ascendente' ? DOM.btnAscendente : DOM.btnDescendente;
    const otherBtn = direction === 'ascendente' ? DOM.btnDescendente : DOM.btnAscendente;
    targetBtn.classList.remove('bg-gray-600', 'hover:bg-gray-500');
    targetBtn.classList.add('bg-blue-400', 'ring-2', 'ring-offset-2', 'ring-blue-400');
    otherBtn.classList.remove('bg-blue-400', 'ring-2', 'ring-offset-2', 'ring-blue-400');
    otherBtn.classList.add('bg-gray-600', 'hover:bg-gray-500');
    enableCheckButton();
}

function checkAnswer() {
    if (AppState.isChecking) return;
    AppState.isChecking = true;
    stopTimer();
    AppState.totalAttempts++;

    const { currentIntervalSemitones, currentDirection, selectedInterval, selectedDirection } = AppState;
    
    // Use the actual interval from rendered notes if available
    let actualIntervalSemitones = currentIntervalSemitones;
    if (AppState.lastVFNotes && AppState.lastVFNotes.startSpell && AppState.lastVFNotes.endSpell) {
        actualIntervalSemitones = calculateActualInterval(AppState.lastVFNotes.startSpell, AppState.lastVFNotes.endSpell);
    }
    
    const { name: correctIntervalName } = getIntervalInfo(actualIntervalSemitones);
    const isDirectionChecked = DIFFICULTY_CONFIG[AppState.difficulty].directions.length > 1;
    const isIntervalCorrect = selectedInterval === actualIntervalSemitones;
    const isDirectionCorrect = !isDirectionChecked || (selectedDirection === currentDirection);
    const isCorrect = isIntervalCorrect && isDirectionCorrect;

    updateScore(isCorrect);
    displayFeedback(isCorrect, correctIntervalName, isDirectionChecked, currentDirection);
    highlightAnswers(isCorrect, selectedInterval, actualIntervalSemitones, selectedDirection, currentDirection, isDirectionChecked);
    
    DOM.btnCheck.disabled = true;
    DOM.btnNext.disabled = false;
    DOM.feedbackMessage.setAttribute('aria-live', 'assertive');
    document.querySelectorAll('.interval-button-choice, #btn-ascendente, #btn-descendente').forEach(btn => btn.disabled = true);
}

function updateScore(isCorrect) {
    if (isCorrect) {
        AppState.correctAnswers++;
    }
    updateScoreDisplay();
}

function displayFeedback(isCorrect, correctIntervalName, isDirectionChecked, correctDirection) {
    if (isCorrect) {
        DOM.feedbackMessage.textContent = "¡CORRECTE! 🥳";
        DOM.feedbackMessage.className = 'text-center h-8 font-bold text-lg text-green-500';
    } else {
        const directionText = isDirectionChecked ? `, ${correctDirection === 'ascendente' ? 'Ascendent' : 'Descendent'}`: '';
        let message = AppState.selectedInterval === null ? `TEMPS ESGOTAT. L'interval correcte era: ${correctIntervalName}${directionText}.` : `INCORRECTE. L'interval correcte era: ${correctIntervalName}${directionText}.`;
        DOM.feedbackMessage.textContent = message;
        DOM.feedbackMessage.className = 'text-center h-8 font-bold text-lg text-red-500';
    }
}

function highlightAnswers(isCorrect, selectedInterval, correctInterval, selectedDirection, correctDirection, isDirectionChecked) {
    if (isCorrect) {
        const correctBtn = document.getElementById(`interval-${correctInterval}`);
        if (correctBtn) {
            correctBtn.classList.remove('bg-blue-400', 'bg-gray-700', 'ring-blue-400');
            correctBtn.classList.add('bg-green-600');
        }
    } else {
        const correctBtn = document.getElementById(`interval-${correctInterval}`);
        if (correctBtn) {
            correctBtn.classList.remove('bg-blue-400', 'bg-gray-700', 'ring-blue-400');
            correctBtn.classList.add('bg-green-600', 'ring-green-600', 'ring-2', 'ring-offset-2');
        }

        const selectedBtn = document.getElementById(`interval-${selectedInterval}`);
        if (selectedBtn && selectedInterval !== correctInterval) {
            selectedBtn.classList.remove('bg-blue-400', 'ring-blue-400');
            selectedBtn.classList.add('bg-red-600', 'ring-red-600', 'ring-2', 'ring-offset-2');
        }

        if (isDirectionChecked) {
            document.getElementById(`btn-${correctDirection}`).classList.remove('bg-gray-600', 'bg-blue-400', 'hover:bg-gray-500');
            document.getElementById(`btn-${correctDirection}`).classList.add('bg-green-600', 'ring-green-600', 'ring-2', 'ring-offset-2');
            if (selectedDirection !== correctDirection) {
                document.getElementById(`btn-${selectedDirection}`).classList.remove('bg-blue-400', 'ring-blue-400');
                document.getElementById(`btn-${selectedDirection}`).classList.add('bg-red-600', 'ring-red-600', 'ring-2', 'ring-offset-2');
            }
        }
    }
}


// =========================================================================
// 4. LÒGICA DEL TEMPORITZADOR
// =========================================================================

function startTimer() {
    stopTimer();
    AppState.timer = 30;
    const timerEl = DOM.timerDisplay;
    timerEl.textContent = AppState.timer;
    timerEl.className = 'timer-display text-green-500';
    timerEl.setAttribute('aria-live', 'polite');
    
    AppState.timerId = setInterval(() => {
        AppState.timer--;
        timerEl.textContent = AppState.timer;
        if (AppState.timer === 15) {
            timerEl.classList.replace('text-green-500', 'text-yellow-500');
        } else if (AppState.timer === 10) {
            timerEl.classList.replace('text-yellow-500', 'text-orange-500');
        } else if (AppState.timer === 5) {
            timerEl.classList.replace('text-orange-500', 'text-red-600');
        }
        if (AppState.timer <= 0) {
            stopTimer();
            if (!AppState.isChecking) {
                AppState.selectedInterval = null;
                checkAnswer();
            }
        }
    }, 1000);
}

function stopTimer() {
    if (AppState.timerId) {
        clearInterval(AppState.timerId);
        AppState.timerId = null;
        DOM.timerDisplay.setAttribute('aria-live', 'off');
    }
}

// =========================================================================
// 5. SETUP DE LA UI
// =========================================================================

function generateButtons() {
    const container = DOM.intervalButtonsContainer;
    container.innerHTML = '';
    if (!AppState.difficulty) {
        console.error("Dificultat no seleccionada.");
        return;
    }
    const allowedSemitones = DIFFICULTY_CONFIG[AppState.difficulty].semitones;
    const allowedIntervals = INTERVAL_MAP.filter(interval => allowedSemitones.includes(interval.semitones));
    
    // Always use a compact grid layout
    DOM.intervalButtonsContainer.className = 'grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-7 gap-2';
    
    allowedIntervals.forEach(interval => {
        const btn = document.createElement('button');
        btn.id = `interval-${interval.semitones}`;
        btn.textContent = interval.btnName;
        btn.setAttribute('onclick', `IntervallyApp.selectInterval(${interval.semitones})`);
        btn.className = 'interval-button interval-button-choice interval-btn-compact p-2 rounded-lg font-semibold text-xs sm:text-sm bg-gray-700 hover:bg-gray-600 text-white transition duration-150 border-2 border-transparent focus:border-blue-400';
        btn.setAttribute('aria-pressed', 'false');
        container.appendChild(btn);
    });
}

function setupDirectionButtons() {
    const isDirectionEnabled = DIFFICULTY_CONFIG[AppState.difficulty].directions.length > 1;
    if (isDirectionEnabled) {
        DOM.btnDescendente.disabled = false;
        DOM.btnDescendente.classList.remove('direction-disabled', 'opacity-50', 'bg-gray-500');
        const selectedDirectionBtn = AppState.selectedDirection === 'ascendente' ? DOM.btnAscendente : DOM.btnDescendente;
        const otherDirectionBtn = AppState.selectedDirection === 'ascendente' ? DOM.btnDescendente : DOM.btnAscendente;
        selectedDirectionBtn.classList.remove('bg-gray-600', 'hover:bg-gray-500');
        selectedDirectionBtn.classList.add('bg-blue-400', 'ring-2', 'ring-offset-2', 'ring-blue-400');
        otherDirectionBtn.classList.remove('bg-blue-400', 'ring-2', 'ring-offset-2', 'ring-blue-400');
        otherDirectionBtn.classList.add('bg-gray-600', 'hover:bg-gray-500');
    } else {
        DOM.btnDescendente.disabled = true;
        DOM.btnDescendente.classList.add('direction-disabled', 'opacity-50', 'bg-gray-500');
        DOM.btnDescendente.classList.remove('bg-gray-600', 'hover:bg-gray-500', 'bg-blue-400', 'ring-2', 'ring-offset-2', 'ring-blue-400');
        DOM.btnAscendente.classList.remove('bg-gray-600', 'hover:bg-gray-500');
        DOM.btnAscendente.classList.add('bg-blue-400', 'ring-2', 'ring-offset-2', 'ring-blue-400');
    }
}

// =========================================================================
// 6. INICIALITZACIÓ
// =========================================================================

// Function to recover from VexFlow errors
function recoverFromVexFlowError() {
    console.log('Attempting to recover from VexFlow error...');
    try {
        AppState.isVexFlowLoaded = false;
        if (AppState.vexFlow.resizeObserver) {
            AppState.vexFlow.resizeObserver.disconnect();
        }
        AppState.vexFlow = { renderer: null, stave: null, context: null };
        
        // Try to reinitialize
        const VF = getVexFlowNamespace();
        if (VF) {
            setupVexFlowRenderer(VF);
            AppState.isVexFlowLoaded = true;
            console.log('VexFlow recovery successful');
            
            // Redraw current interval if one exists
            if (AppState.startNoteMIDI && AppState.currentIntervalSemitones !== null && AppState.currentDirection) {
                const enforceNaturals = AppState.difficulty === 'inicial';
                const { startVF, endVF } = getIntervalNoteRenderData(
                    AppState.startNoteMIDI, 
                    AppState.currentIntervalSemitones, 
                    AppState.currentDirection, 
                    enforceNaturals
                );
                drawInterval(startVF, endVF);
            }
            
            return true;
        }
    } catch (error) {
        console.error('VexFlow recovery failed:', error);
        if (DOM.staveDisplayContainer) {
            DOM.staveDisplayContainer.innerHTML = `<div class="p-4 text-center text-gray-800">
                <p class="font-bold text-xl text-red-600">⚠️ No s'ha pogut recuperar</p>
                <p class="text-sm mt-1">Prova de recarregar la pàgina completament.</p>
                <p class="text-xs mt-2">L'interval es pot validar sense la visualització.</p>
            </div>`;
        }
    }
    return false;
}

function returnToMenu() {
    stopTimer();
    switchView('start');
}

const IntervallyApp = {
    startGame,
    nextInterval,
    checkAnswer,
    selectInterval,
    selectDirection,
    recoverFromVexFlowError,
    returnToMenu
};

function init() {
    cacheDOMElements();

    const VFNS = getVexFlowNamespace();
    if (VFNS) {
        AppState.isVexFlowLoaded = true;
        const validation = validateVexFlow(VFNS);
        if (!validation.ok) {
            console.warn(`VexFlow trobat però incomplet: ${validation.reason}`);
            AppState.isVexFlowLoaded = false;
        } else {
            console.log("VexFlow carregat correctament.");
        }

        try {
            const VF = VFNS;
            setupVexFlowRenderer(VF);
        } catch (error) {
            console.error("Error initializing VexFlow: ", error);
            AppState.isVexFlowLoaded = false;
            if (DOM.staveDisplayContainer) {
                const safeMsg = (error && (error.message || String(error))) || 'Unknown init error';
                DOM.staveDisplayContainer.innerHTML = `<div class=\"p-4 text-center text-gray-800\"><p class=\"font-bold text-xl text-red-600\">⚠️ Error d'Inicialització</p><p class=\"text-sm mt-1\">${safeMsg}</p></div>`;
            }
        }

    } else {
        AppState.isVexFlowLoaded = false;
        console.warn("VexFlow no detectat. Intentant càrrega alternativa...");
        // Prova en cascada: v4, v4 min, v3 clàssic
        const fallbacks = [
            // v4 jsDelivr
            'https://cdn.jsdelivr.net/npm/vexflow@4.2.3/build/vexflow.js',
            'https://cdn.jsdelivr.net/npm/vexflow@4.2.3/build/vexflow-min.js',
            'https://cdn.jsdelivr.net/npm/vexflow@4.2.3/build/iife/vexflow.js',
            'https://cdn.jsdelivr.net/npm/vexflow@4.2.3/build/iife/vexflow-min.js',
            // v4 unpkg
            'https://unpkg.com/vexflow@4.2.3/build/vexflow.js',
            'https://unpkg.com/vexflow@4.2.3/build/vexflow-min.js',
            'https://unpkg.com/vexflow@4.2.3/build/iife/vexflow.js',
            'https://unpkg.com/vexflow@4.2.3/build/iife/vexflow-min.js',
            // v3 classic
            'https://unpkg.com/vexflow@3.0.9/releases/vexflow-debug.js'
        ];
        attemptLoadVexFlowSequential(fallbacks).then(ns => {
            if (ns) {
                const validation = validateVexFlow(ns);
                if (!validation.ok) {
                    console.warn(`VexFlow carregat però incomplet via fallback: ${validation.reason}`);
                    return;
                }
                AppState.isVexFlowLoaded = true;
                setupVexFlowRenderer(ns);
            } else {
                console.warn('No s\'ha pogut carregar VexFlow amb els fallbacks.');
            }
        }).catch(err => {
            console.warn('Error carregant VexFlow via fallback:', err && (err.message || err));
        });
    }

    switchView('start');
}

document.addEventListener('DOMContentLoaded', init);

// Exposa l'API perquè els 'onclick' inline d'HTML funcionin en tots els navegadors
if (typeof window !== 'undefined') {
    window.IntervallyApp = IntervallyApp;
}
