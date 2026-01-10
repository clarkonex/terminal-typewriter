// ===== SOUND SYSTEM =====
class TypewriterSound {
  constructor() {
    this.audioContext = null;
    this.keyBuffers = []; // Array of different key sounds
    this.returnBuffer = null;
    this.volume = 0.5;
    this.enabled = true;
    this.lastPlayTime = 0;
    this.minInterval = 50; // Minimum ms between sounds
    this.lastKeyIndex = -1; // Track last played key to avoid repetition

    // Vintage effects
    this.vinylNoiseNode = null;
    this.vinylGain = null;
    this.convolver = null; // Reverb
    this.reverbGain = null;
    this.dryGain = null;
    this.masterGain = null;
  }

  async init() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Set up audio routing with vintage effects
    this.setupVintageEffects();

    // Load all 55 individual key sounds for variety
    const keyCount = 55;
    const keyPromises = [];

    for (let i = 1; i <= keyCount; i++) {
      // Format: typewritersound.01key.wav, typewritersound.02key.wav, etc.
      const num = i.toString().padStart(2, '0');
      const url = `/assets/sounds/keys/typewritersound.${num}key.wav`;
      keyPromises.push(fetch(url).then(r => {
        if (!r.ok) console.error(`Failed to load: ${url}`);
        return r;
      }));
    }

    // Also load the return sound
    keyPromises.push(fetch('/assets/sounds/return.wav'));

    const responses = await Promise.all(keyPromises);
    const arrayBuffers = await Promise.all(responses.map(r => r.arrayBuffer()));

    // Decode all key sounds
    for (let i = 0; i < keyCount; i++) {
      try {
        const buffer = await this.audioContext.decodeAudioData(arrayBuffers[i].slice(0));
        this.keyBuffers.push(buffer);
      } catch (e) {
        console.error(`Failed to decode key ${i + 1}:`, e);
      }
    }

    // Decode return sound (last one)
    try {
      this.returnBuffer = await this.audioContext.decodeAudioData(arrayBuffers[keyCount].slice(0));
    } catch (e) {
      console.error('Failed to decode return sound:', e);
    }

    console.log(`Loaded ${this.keyBuffers.length} key sounds`);
  }

  setupVintageEffects() {
    const ctx = this.audioContext;

    // Master gain
    this.masterGain = ctx.createGain();
    this.masterGain.connect(ctx.destination);

    // === VINYL CRACKLE/NOISE ===
    this.vinylGain = ctx.createGain();
    this.vinylGain.gain.value = 0; // Start silent, triggered with keystrokes
    this.vinylMaxGain = 0.12; // Max crackle volume
    this.vinylGain.connect(this.masterGain);

    // Create vinyl noise buffer
    const noiseLength = ctx.sampleRate * 2; // 2 seconds of noise, looped
    const noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);

    for (let i = 0; i < noiseLength; i++) {
      // Mix of white noise and random crackles
      const whitenoise = (Math.random() * 2 - 1) * 0.3;
      const crackle = Math.random() < 0.002 ? (Math.random() * 2 - 1) * 0.8 : 0;
      noiseData[i] = whitenoise + crackle;
    }

    // Low-pass filter for warmer noise
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 3000;
    noiseFilter.connect(this.vinylGain);

    // High-pass to remove rumble
    const noiseHipass = ctx.createBiquadFilter();
    noiseHipass.type = 'highpass';
    noiseHipass.frequency.value = 300;
    noiseHipass.connect(noiseFilter);

    // Start the noise loop
    this.vinylNoiseNode = ctx.createBufferSource();
    this.vinylNoiseNode.buffer = noiseBuffer;
    this.vinylNoiseNode.loop = true;
    this.vinylNoiseNode.connect(noiseHipass);
    this.vinylNoiseNode.start();

    // === REVERB (Convolver) ===
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this.createReverbImpulse(0.8, 1.5); // Short, subtle reverb

    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.25; // Reverb mix (wet)
    this.convolver.connect(this.reverbGain);
    this.reverbGain.connect(this.masterGain);

    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 0.85; // Dry signal
    this.dryGain.connect(this.masterGain);

    // Lo-fi filter on the main signal
    this.lofiFilter = ctx.createBiquadFilter();
    this.lofiFilter.type = 'lowpass';
    this.lofiFilter.frequency.value = 6000; // Slightly muffled, vintage feel
    this.lofiFilter.connect(this.dryGain);
    this.lofiFilter.connect(this.convolver);
  }

  createReverbImpulse(decay, duration) {
    const ctx = this.audioContext;
    const length = ctx.sampleRate * duration;
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        // Exponential decay with some randomness for natural sound
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  play(isReturn = false) {
    if (!this.enabled || !this.audioContext) return;

    const now = Date.now();
    if (now - this.lastPlayTime < this.minInterval) return;
    this.lastPlayTime = now;

    // Resume audio context if suspended (required by browsers)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    let buffer;

    if (isReturn) {
      buffer = this.returnBuffer;
    } else {
      // Pick a random key sound, but avoid repeating the same one twice
      let keyIndex;
      do {
        keyIndex = Math.floor(Math.random() * this.keyBuffers.length);
      } while (keyIndex === this.lastKeyIndex && this.keyBuffers.length > 1);

      this.lastKeyIndex = keyIndex;
      buffer = this.keyBuffers[keyIndex];
    }

    if (!buffer) return;

    const source = this.audioContext.createBufferSource();
    const gainNode = this.audioContext.createGain();

    source.buffer = buffer;

    // Add slight pitch variation for even more natural feel
    if (!isReturn) {
      source.playbackRate.value = 0.92 + Math.random() * 0.16; // 0.92 - 1.08
    }

    // Volume control
    gainNode.gain.value = this.volume;

    // Route through vintage effects chain
    source.connect(gainNode);
    gainNode.connect(this.lofiFilter);
    source.start(0);

    // Trigger vinyl crackle with keystroke
    this.triggerVinylCrackle();
  }

  triggerVinylCrackle() {
    if (!this.vinylGain || !this.enabled) return;

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const gain = this.vinylGain.gain;

    // Cancel any scheduled changes
    gain.cancelScheduledValues(now);

    // Quick fade in, slow fade out (like the sound lingers)
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(this.vinylMaxGain * this.volume, now + 0.02); // 20ms attack
    gain.linearRampToValueAtTime(0, now + 0.4); // 400ms decay
  }

  setVolume(value) {
    this.volume = value;
  }

  toggle() {
    this.enabled = !this.enabled;
    // Mute vinyl noise when disabled
    if (this.vinylGain && !this.enabled) {
      this.vinylGain.gain.cancelScheduledValues(this.audioContext.currentTime);
      this.vinylGain.gain.value = 0;
    }
    return this.enabled;
  }
}

// ===== APP STATE =====
const state = {
  theme: 'vintage-brown',
  font: 'special-elite',
  sound: new TypewriterSound()
};

// ===== DOM ELEMENTS =====
let editor, themeSelect, fontSelect, volumeSlider, soundToggle;
let charCount, wordCount, saveBtn, exportPngBtn, exitBtn;

// ===== INITIALIZATION =====
async function init() {
  // Get DOM elements
  editor = document.getElementById('editor');
  themeSelect = document.getElementById('theme-select');
  fontSelect = document.getElementById('font-select');
  volumeSlider = document.getElementById('volume-slider');
  soundToggle = document.getElementById('sound-toggle');
  charCount = document.getElementById('char-count');
  wordCount = document.getElementById('word-count');
  saveBtn = document.getElementById('save-btn');
  exportPngBtn = document.getElementById('export-png-btn');
  exitBtn = document.getElementById('exit-btn');

  // Initialize sound system
  try {
    await state.sound.init();
  } catch (e) {
    console.warn('Could not initialize audio:', e);
  }

  // Set up event listeners
  setupEventListeners();

  // Load saved preferences
  loadPreferences();

  // Focus editor
  editor.focus();
}

function setupEventListeners() {
  // Typing sounds and line handling
  editor.addEventListener('keydown', handleKeyDown);

  // Update character/word count
  editor.addEventListener('input', updateCounts);

  // Theme selection
  themeSelect.addEventListener('change', (e) => {
    setTheme(e.target.value);
  });

  // Font selection - changes font of current line
  fontSelect.addEventListener('change', (e) => {
    setFont(e.target.value);
    // Update current line's font
    const currentLine = document.querySelector('.line:focus');
    if (currentLine) {
      currentLine.dataset.font = e.target.value;
    }
  });

  // Volume control
  volumeSlider.addEventListener('input', (e) => {
    state.sound.setVolume(e.target.value / 100);
    savePreferences();
  });

  // Sound toggle
  soundToggle.addEventListener('click', () => {
    const enabled = state.sound.toggle();
    soundToggle.querySelector('.sound-on').style.display = enabled ? 'inline' : 'none';
    soundToggle.querySelector('.sound-off').style.display = enabled ? 'none' : 'inline';
    savePreferences();
  });

  // Initialize audio on first interaction (browser requirement)
  document.addEventListener('click', () => {
    if (state.sound.audioContext?.state === 'suspended') {
      state.sound.audioContext.resume();
    }
  }, { once: true });

  // Save button
  saveBtn.addEventListener('click', saveText);

  // Export PNG button
  exportPngBtn.addEventListener('click', savePNG);

  // Exit button
  exitBtn.addEventListener('click', exitApp);

  // Focus first line
  const firstLine = editor.querySelector('.line');
  if (firstLine) {
    firstLine.focus();
  }
}

// ===== FILE OPERATIONS =====
function getEditorText() {
  const lines = editor.querySelectorAll('.line');
  let text = '';
  lines.forEach(line => {
    text += line.textContent + '\n';
  });
  return text.trimEnd();
}

async function saveText() {
  const text = getEditorText();
  if (!text.trim()) {
    return;
  }

  try {
    // Use Tauri's native save dialog
    const filePath = await window.__TAURI__.dialog.save({
      defaultPath: 'dokument.txt',
      filters: [{
        name: 'Text Dateien',
        extensions: ['txt']
      }]
    });

    if (filePath) {
      // Write the file
      await window.__TAURI__.fs.writeTextFile(filePath, text);
      console.log('Gespeichert:', filePath);
    }
  } catch (e) {
    console.error('Speichern fehlgeschlagen:', e);

    // Fallback: Browser download
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dokument.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

async function savePNG() {
  const text = getEditorText();
  if (!text.trim()) {
    return;
  }

  try {
    // Capture the entire CRT screen as PNG
    const crtScreen = document.querySelector('.crt-screen');
    const canvas = await html2canvas(crtScreen, {
      backgroundColor: null,
      scale: 2, // Higher quality
      logging: false
    });

    // Convert canvas to blob
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

    // Use Tauri's native save dialog
    const filePath = await window.__TAURI__.dialog.save({
      defaultPath: 'dokument.png',
      filters: [{
        name: 'PNG Bild',
        extensions: ['png']
      }]
    });

    if (filePath) {
      // Convert blob to array buffer
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Write the file (using writeFile for binary data in Tauri v2)
      await window.__TAURI__.fs.writeFile(filePath, uint8Array);
      console.log('PNG gespeichert:', filePath);
    }
  } catch (e) {
    console.error('PNG Speichern fehlgeschlagen:', e);

    // Fallback: Browser download
    try {
      const crtScreen = document.querySelector('.crt-screen');
      const canvas = await html2canvas(crtScreen, {
        backgroundColor: null,
        scale: 2,
        logging: false
      });

      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'dokument.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (fallbackError) {
      console.error('Fallback PNG speichern fehlgeschlagen:', fallbackError);
    }
  }
}

async function exitApp() {
  try {
    await window.__TAURI__.core.invoke('exit_app');
  } catch (e) {
    console.error('Exit failed:', e);
  }
}

function handleKeyDown(e) {
  // Ignore modifier keys alone
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
    return;
  }

  // Handle Enter - create new line with current font
  if (e.key === 'Enter') {
    e.preventDefault();
    state.sound.play(true);
    createNewLine();
    return;
  }

  // Handle Backspace at beginning of line - merge with previous
  if (e.key === 'Backspace') {
    const currentLine = document.activeElement;
    if (currentLine.classList.contains('line')) {
      const selection = window.getSelection();
      if (selection.anchorOffset === 0 && currentLine.previousElementSibling) {
        e.preventDefault();
        const prevLine = currentLine.previousElementSibling;
        const prevLength = prevLine.textContent.length;
        prevLine.textContent += currentLine.textContent;
        currentLine.remove();

        // Set cursor at merge point
        const range = document.createRange();
        const sel = window.getSelection();
        if (prevLine.firstChild) {
          range.setStart(prevLine.firstChild, prevLength);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        prevLine.focus();
        updateCounts();
        state.sound.play(false);
        return;
      }
    }
  }

  // Play typewriter sound for other keys
  if (e.key.length === 1 || ['Backspace', 'Delete', 'Tab', 'Space'].includes(e.key)) {
    state.sound.play(false);
  }
}

function createNewLine() {
  const currentLine = document.activeElement;
  const newLine = document.createElement('div');
  newLine.className = 'line';
  newLine.contentEditable = 'true';
  newLine.dataset.font = state.font;

  // If cursor is in middle of line, split the text
  if (currentLine.classList.contains('line')) {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);

    // Get text after cursor
    const afterCursor = range.extractContents();
    newLine.appendChild(afterCursor);

    // Insert new line after current
    currentLine.after(newLine);
  } else {
    editor.appendChild(newLine);
  }

  newLine.focus();
  updateCounts();
}

function updateCounts() {
  const lines = editor.querySelectorAll('.line');
  let text = '';
  lines.forEach(line => {
    text += line.textContent + '\n';
  });
  text = text.trim();

  const chars = text.length;
  const words = text === '' ? 0 : text.split(/\s+/).length;

  charCount.textContent = `${chars} Zeichen`;
  wordCount.textContent = `${words} ${words === 1 ? 'Wort' : 'Wörter'}`;
}

// ===== THEME & FONT =====
function setTheme(theme) {
  state.theme = theme;
  document.body.dataset.theme = theme;
  savePreferences();
}

function setFont(font) {
  state.font = font;
  document.body.className = `font-${font}`;
  savePreferences();
}

// ===== PREFERENCES =====
function savePreferences() {
  const prefs = {
    theme: state.theme,
    font: state.font,
    volume: volumeSlider.value,
    soundEnabled: state.sound.enabled
  };
  localStorage.setItem('typewriter-prefs', JSON.stringify(prefs));
}

function loadPreferences() {
  try {
    const saved = localStorage.getItem('typewriter-prefs');
    if (saved) {
      const prefs = JSON.parse(saved);

      // Apply theme
      if (prefs.theme) {
        state.theme = prefs.theme;
        themeSelect.value = prefs.theme;
        document.body.dataset.theme = prefs.theme;
      }

      // Apply font
      if (prefs.font) {
        state.font = prefs.font;
        fontSelect.value = prefs.font;
        document.body.className = `font-${prefs.font}`;
      }

      // Apply volume
      if (prefs.volume !== undefined) {
        volumeSlider.value = prefs.volume;
        state.sound.setVolume(prefs.volume / 100);
      }

      // Apply sound toggle
      if (prefs.soundEnabled === false) {
        state.sound.enabled = false;
        soundToggle.querySelector('.sound-on').style.display = 'none';
        soundToggle.querySelector('.sound-off').style.display = 'inline';
      }
    }
  } catch (e) {
    console.warn('Could not load preferences:', e);
  }
}

// ===== START =====
document.addEventListener('DOMContentLoaded', init);
