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
    this.convolver.buffer = this.createReverbImpulse(0.4, 0.6); // Very subtle, short reverb

    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.10; // Reverb mix (wet) - reduced for subtler effect
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
let pagesContainer, themeSelect, fontSelect, volumeSlider, soundToggle, newPageBtn;
let charCount, wordCount, saveBtn, exportPngBtn, exitBtn;
let prevPageBtn, nextPageBtn, pageIndicator;

// ===== PAGE MANAGEMENT =====
const MAX_PAGE_HEIGHT = 1200; // Maximum height in pixels before new page
let pages = [];
let currentPageIndex = 0;

// ===== INITIALIZATION =====
async function init() {
  // Get DOM elements
  pagesContainer = document.getElementById('pages-container');
  themeSelect = document.getElementById('theme-select');
  fontSelect = document.getElementById('font-select');
  volumeSlider = document.getElementById('volume-slider');
  soundToggle = document.getElementById('sound-toggle');
  charCount = document.getElementById('char-count');
  wordCount = document.getElementById('word-count');
  saveBtn = document.getElementById('save-btn');
  exportPngBtn = document.getElementById('export-png-btn');
  exitBtn = document.getElementById('exit-btn');
  newPageBtn = document.getElementById('new-page-btn');
  prevPageBtn = document.getElementById('prev-page-btn');
  nextPageBtn = document.getElementById('next-page-btn');
  pageIndicator = document.getElementById('page-indicator');

  // Initialize pages array with first page
  pages = [pagesContainer.querySelector('.page')];
  currentPageIndex = 0;

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

  // Focus first page editor
  focusCurrentPage();
}

// Get the current page's editor element
function getCurrentEditor() {
  return pages[currentPageIndex]?.querySelector('.page-editor');
}

function setupEventListeners() {
  // Use event delegation for page editors
  pagesContainer.addEventListener('keydown', handleKeyDown);
  pagesContainer.addEventListener('input', handleInput);

  // Theme selection
  themeSelect.addEventListener('change', (e) => {
    setTheme(e.target.value);
  });

  // Font selection - changes font of selected text or current line
  fontSelect.addEventListener('change', (e) => {
    const newFont = e.target.value;
    setFont(newFont);

    const selection = window.getSelection();

    // Check if there's a text selection
    if (selection && !selection.isCollapsed && selection.toString().length > 0) {
      // Wrap selected text in a span with the new font
      applyFontToSelection(selection, newFont);
    } else {
      // No selection - update current line's font (find line at cursor)
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        let currentLine = range.startContainer;
        while (currentLine && !currentLine.classList?.contains('line')) {
          currentLine = currentLine.parentElement;
        }
        if (currentLine?.classList.contains('line')) {
          currentLine.dataset.font = newFont;
        }
      }
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

  // New page button (clear all)
  newPageBtn.addEventListener('click', clearAllPages);

  // Page navigation
  prevPageBtn.addEventListener('click', () => navigateToPage(currentPageIndex - 1));
  nextPageBtn.addEventListener('click', () => navigateToPage(currentPageIndex + 1));

  // Image drag and drop (browser fallback)
  pagesContainer.addEventListener('dragover', handleDragOver);
  pagesContainer.addEventListener('dragleave', handleDragLeave);
  pagesContainer.addEventListener('drop', handleDrop);

  // Setup Tauri file drop
  setupTauriFileDrop();
}

// Handle input and check for page overflow
function handleInput(e) {
  updateCounts();
  // Small delay to let the DOM update before measuring
  requestAnimationFrame(() => {
    checkPageOverflow();
  });
}

// Check if current page has exceeded height limit
function checkPageOverflow() {
  const editor = getCurrentEditor();
  if (!editor) return;

  // Calculate actual content height by measuring all children
  const children = editor.querySelectorAll('.line, .image-line');
  let contentHeight = 0;

  children.forEach(child => {
    contentHeight += child.offsetHeight;
  });

  // Add padding (40px top + 40px bottom from CSS)
  contentHeight += 80;

  // Check if content height exceeds maximum
  if (contentHeight > MAX_PAGE_HEIGHT) {
    const lines = editor.querySelectorAll('.line, .image-line');
    if (lines.length <= 1) return; // Need at least 2 elements to move one

    // Find the last line/element to move to next page
    const lastElement = lines[lines.length - 1];

    // Save cursor position info
    const selection = window.getSelection();
    const cursorInLastElement = selection.rangeCount > 0 &&
      lastElement.contains(selection.getRangeAt(0).startContainer);

    // Create new page if needed
    if (currentPageIndex === pages.length - 1) {
      createNewPage();
    }

    // Move last element to next page
    const nextEditor = pages[currentPageIndex + 1].querySelector('.page-editor');
    const firstLineOfNext = nextEditor.querySelector('.line');

    // If next page has an empty first line, remove it before inserting
    if (firstLineOfNext && !firstLineOfNext.textContent.trim()) {
      firstLineOfNext.remove();
    }

    // Insert at beginning of next page
    nextEditor.insertBefore(lastElement, nextEditor.firstChild);

    // Recursively check if we need to move more elements
    requestAnimationFrame(() => {
      checkPageOverflow();
    });

    // If cursor was in the moved element, navigate to next page
    if (cursorInLastElement) {
      navigateToPage(currentPageIndex + 1);

      // Focus the moved element
      const newEditor = getCurrentEditor();
      newEditor.focus();
      const range = document.createRange();
      range.selectNodeContents(lastElement);
      range.collapse(false); // End of content
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
}

// Create a new page
function createNewPage() {
  const pageNum = pages.length + 1;

  const newPage = document.createElement('div');
  newPage.className = 'page';
  newPage.dataset.page = pageNum;

  const newEditor = document.createElement('div');
  newEditor.className = 'page-editor';
  newEditor.contentEditable = 'true';
  newEditor.spellcheck = false;

  const newLine = document.createElement('div');
  newLine.className = 'line';
  newLine.dataset.font = state.font;

  newEditor.appendChild(newLine);
  newPage.appendChild(newEditor);
  pagesContainer.appendChild(newPage);

  pages.push(newPage);
  updatePageIndicator();

  return newPage;
}

// Navigate to a specific page
function navigateToPage(index) {
  if (index < 0 || index >= pages.length) return;

  // Hide current page
  pages[currentPageIndex].classList.remove('active');

  // Show new page
  currentPageIndex = index;
  pages[currentPageIndex].classList.add('active');

  updatePageIndicator();
  focusCurrentPage();
}

// Update page indicator and button states
function updatePageIndicator() {
  pageIndicator.textContent = `Seite ${currentPageIndex + 1} / ${pages.length}`;
  prevPageBtn.disabled = currentPageIndex === 0;
  nextPageBtn.disabled = currentPageIndex === pages.length - 1;
}

// Focus the current page editor
function focusCurrentPage() {
  const editor = getCurrentEditor();
  if (editor) {
    editor.focus();
    const firstLine = editor.querySelector('.line');
    if (firstLine) {
      const range = document.createRange();
      range.setStart(firstLine, 0);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
}

// Clear all pages (new document)
function clearAllPages() {
  // Remove all pages except first
  while (pages.length > 1) {
    pages[pages.length - 1].remove();
    pages.pop();
  }

  // Clear first page
  const firstEditor = pages[0].querySelector('.page-editor');
  firstEditor.innerHTML = '';

  const newLine = document.createElement('div');
  newLine.className = 'line';
  newLine.dataset.font = state.font;
  firstEditor.appendChild(newLine);

  currentPageIndex = 0;
  pages[0].classList.add('active');

  updatePageIndicator();
  focusCurrentPage();
  updateCounts();

  // Play sound
  state.sound.play(true);
}

// ===== FILE OPERATIONS =====
function getEditorText() {
  let text = '';
  // Get text from all pages
  pages.forEach((page, pageIndex) => {
    const lines = page.querySelectorAll('.line');
    lines.forEach(line => {
      text += line.textContent + '\n';
    });
    // Add page break marker if not last page
    if (pageIndex < pages.length - 1) {
      text += '\n--- Seite ' + (pageIndex + 2) + ' ---\n\n';
    }
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
  // Check how many pages have content
  const pagesWithContent = pages.filter(page => {
    const editor = page.querySelector('.page-editor');
    const text = editor?.textContent?.trim() || '';
    const images = editor?.querySelectorAll('.image-line') || [];
    return text.length > 0 || images.length > 0;
  });

  if (pagesWithContent.length === 0) return;

  try {
    if (pagesWithContent.length === 1) {
      // Single page - save as before
      const editor = pagesWithContent[0].querySelector('.page-editor');
      const canvas = await createDocumentCanvas(editor);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

      const filePath = await window.__TAURI__.dialog.save({
        defaultPath: 'dokument.png',
        filters: [{ name: 'PNG Bild', extensions: ['png'] }]
      });

      if (filePath) {
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        await window.__TAURI__.fs.writeFile(filePath, uint8Array);
        console.log('PNG gespeichert:', filePath);
      }
    } else {
      // Multiple pages - let user choose folder
      const folderPath = await window.__TAURI__.dialog.open({
        directory: true,
        title: 'Ordner für PNG-Export wählen'
      });

      if (folderPath) {
        for (let i = 0; i < pagesWithContent.length; i++) {
          const editor = pagesWithContent[i].querySelector('.page-editor');
          const canvas = await createDocumentCanvas(editor);
          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

          const fileName = `dokument_seite_${i + 1}.png`;
          const filePath = `${folderPath}/${fileName}`;

          const arrayBuffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          await window.__TAURI__.fs.writeFile(filePath, uint8Array);
          console.log(`PNG gespeichert: ${filePath}`);
        }
        console.log(`${pagesWithContent.length} Seiten exportiert`);
      }
    }
  } catch (e) {
    console.error('PNG Speichern fehlgeschlagen:', e);

    // Fallback: Browser download for all pages
    try {
      for (let i = 0; i < pagesWithContent.length; i++) {
        const editor = pagesWithContent[i].querySelector('.page-editor');
        const canvas = await createDocumentCanvas(editor);

        await new Promise(resolve => {
          canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = pagesWithContent.length === 1 ? 'dokument.png' : `dokument_seite_${i + 1}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            resolve();
          }, 'image/png');
        });

        // Small delay between downloads
        if (i < pagesWithContent.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    } catch (fallbackError) {
      console.error('Fallback PNG speichern fehlgeschlagen:', fallbackError);
    }
  }
}

// Font mapping for canvas rendering
const fontMap = {
  'special-elite': { family: 'Special Elite', size: 18 },
  'american-typewriter': { family: 'American Typewriter', size: 17 },
  'adler': { family: 'Adler', size: 22 },
  'remington': { family: 'Remington', size: 20 },
  '1942': { family: '1942', size: 20 },
  'berlin-email': { family: 'Berlin Email', size: 18 },
  'cutmeout': { family: 'CutMeOut', size: 20 },
  'facets': { family: 'Facets', size: 20 },
  'hofstaetten': { family: 'Hofstaetten', size: 18 },
  'zent': { family: 'Zent', size: 20 }
};

async function createDocumentCanvas(editor) {
  const scale = 2; // High DPI
  const pageWidth = 800;
  const marginX = 60;
  const marginTop = 80;
  const marginBottom = 80;
  const lineHeight = 32;
  const borderWidth = 10;
  const innerBorderWidth = 2;
  const borderPadding = 25;

  // Calculate the actual text area width
  const maxWidth = pageWidth - marginX * 2;

  // Create a temporary canvas to measure text
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');

  // First pass: calculate all wrapped lines and total height
  const renderData = [];
  let totalContentHeight = 0;

  // Get all children (lines and images)
  const children = editor.querySelectorAll('.line, .image-line');

  children.forEach(child => {
    if (child.classList.contains('image-line')) {
      // Image element
      const img = child.querySelector('img');
      if (img) {
        // Calculate scaled image dimensions
        const imgMaxWidth = maxWidth - 40;
        const imgMaxHeight = 300;
        let imgWidth = img.naturalWidth || img.width || 200;
        let imgHeight = img.naturalHeight || img.height || 150;

        // Scale to fit
        const scale = Math.min(imgMaxWidth / imgWidth, imgMaxHeight / imgHeight, 1);
        imgWidth *= scale;
        imgHeight *= scale;

        // Check if newspaper filter is applied
        const hasNewspaperFilter = img.classList.contains('newspaper-filter');

        renderData.push({
          type: 'image',
          img: img,
          width: imgWidth,
          height: imgHeight,
          hasNewspaperFilter: hasNewspaperFilter
        });
        totalContentHeight += imgHeight + 24; // Image + margin
      }
    } else {
      // Text line
      const fontKey = child.dataset.font || 'special-elite';
      const fontInfo = fontMap[fontKey] || fontMap['special-elite'];
      const text = child.textContent || '';

      tempCtx.font = `${fontInfo.size}px "${fontInfo.family}", monospace`;

      if (!text.trim()) {
        // Empty line
        renderData.push({ type: 'empty' });
        totalContentHeight += lineHeight;
      } else {
        // Wrap text properly
        const wrappedLines = wrapText(tempCtx, text, maxWidth);
        wrappedLines.forEach(wrappedLine => {
          renderData.push({
            type: 'text',
            text: wrappedLine,
            font: fontInfo
          });
          totalContentHeight += lineHeight;
        });
        if (wrappedLines.length === 0) {
          totalContentHeight += lineHeight;
        }
      }
    }
  });

  // Calculate page height based on actual content
  const contentHeight = totalContentHeight;
  const pageHeight = marginTop + contentHeight + marginBottom;

  // Create the final canvas
  const canvas = document.createElement('canvas');
  canvas.width = pageWidth * scale;
  canvas.height = pageHeight * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // Draw paper background
  ctx.fillStyle = '#F5F0E6';
  ctx.fillRect(0, 0, pageWidth, pageHeight);

  // Add paper texture (subtle noise)
  addPaperTexture(ctx, pageWidth, pageHeight);

  // Draw decorative frame (randomly selected vintage style)
  drawCornerOrnaments(ctx, pageWidth, pageHeight, borderWidth, borderPadding);

  // Second pass: render the content
  let yPosition = marginTop;
  ctx.fillStyle = '#2C1810';

  renderData.forEach(item => {
    if (item.type === 'empty') {
      yPosition += lineHeight;
    } else if (item.type === 'text') {
      ctx.font = `${item.font.size}px "${item.font.family}", monospace`;
      ctx.fillText(item.text, marginX, yPosition);
      yPosition += lineHeight;
    } else if (item.type === 'image') {
      // Draw image centered
      const imgX = marginX + (maxWidth - item.width) / 2;

      // Check if newspaper filter is applied
      if (item.hasNewspaperFilter) {
        // Apply grayscale and contrast effect
        ctx.filter = 'grayscale(100%) contrast(1.3) brightness(1.1)';
        ctx.globalAlpha = 0.85;
      }

      ctx.drawImage(item.img, imgX, yPosition - lineHeight + 12, item.width, item.height);

      // Reset filter
      ctx.filter = 'none';
      ctx.globalAlpha = 1;

      yPosition += item.height + 24;
    }
  });

  // Add subtle aging effect
  addAgingEffect(ctx, pageWidth, pageHeight);

  return canvas;
}

function addPaperTexture(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width * 2, height * 2);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 8;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
  }

  ctx.putImageData(imageData, 0, 0);
}

// Array of frame drawing functions - 20s, 30s, 40s styles
const frameStyles = [
  // Style 1: Art Deco Geometric (1920s)
  function drawArtDecoFrame(ctx, width, height, borderW, padding) {
    const offset = borderW + padding - 5;
    const color = '#8B7355';
    const gold = '#A08060';

    // Outer double line
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(offset - 8, offset - 8, width - (offset - 8) * 2, height - (offset - 8) * 2);

    ctx.lineWidth = 1;
    ctx.strokeRect(offset - 3, offset - 3, width - (offset - 3) * 2, height - (offset - 3) * 2);

    // Art Deco corner fans
    const cornerSize = 35;
    ctx.fillStyle = gold;

    // Draw corner fans
    [[offset, offset, 0], [width - offset, offset, 90],
     [width - offset, height - offset, 180], [offset, height - offset, 270]].forEach(([x, y, angle]) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle * Math.PI / 180);

      // Fan lines
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      for (let i = 0; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const a = (i * 22.5) * Math.PI / 180;
        ctx.lineTo(Math.cos(a) * cornerSize, Math.sin(a) * cornerSize);
        ctx.stroke();
      }

      // Small diamond
      ctx.fillStyle = gold;
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(18, 6);
      ctx.lineTo(12, 12);
      ctx.lineTo(6, 6);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    });
  },

  // Style 2: Elegant Lines (1930s)
  function drawElegantFrame(ctx, width, height, borderW, padding) {
    const offset = borderW + padding - 5;
    const color = '#7A6550';
    const light = '#A89880';

    // Triple line border
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(offset - 10, offset - 10, width - (offset - 10) * 2, height - (offset - 10) * 2);

    ctx.strokeStyle = light;
    ctx.lineWidth = 1;
    ctx.strokeRect(offset - 5, offset - 5, width - (offset - 5) * 2, height - (offset - 5) * 2);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(offset, offset, width - offset * 2, height - offset * 2);

    // Elegant corner scrolls
    const scrollSize = 25;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    [[offset, offset], [width - offset, offset],
     [width - offset, height - offset], [offset, height - offset]].forEach(([x, y], i) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(i * Math.PI / 2);

      // Curved scroll
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.quadraticCurveTo(scrollSize, 0, scrollSize, scrollSize);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, 5);
      ctx.quadraticCurveTo(0, scrollSize, scrollSize, scrollSize);
      ctx.stroke();

      // Small circle
      ctx.beginPath();
      ctx.arc(scrollSize - 5, scrollSize - 5, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.restore();
    });
  },

  // Style 3: Streamline Moderne (1930s-40s)
  function drawStreamlineFrame(ctx, width, height, borderW, padding) {
    const offset = borderW + padding - 5;
    const color = '#8B7355';

    // Main frame with rounded inner corners effect
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.strokeRect(offset - 8, offset - 8, width - (offset - 8) * 2, height - (offset - 8) * 2);

    ctx.lineWidth = 2;
    ctx.strokeRect(offset + 5, offset + 5, width - (offset + 5) * 2, height - (offset + 5) * 2);

    // Horizontal speed lines at corners
    ctx.lineWidth = 1.5;
    const lineLength = 40;
    const lineSpacing = 4;

    // Top corners
    for (let i = 0; i < 4; i++) {
      // Top left
      ctx.beginPath();
      ctx.moveTo(offset + 15, offset + 15 + i * lineSpacing);
      ctx.lineTo(offset + 15 + lineLength - i * 8, offset + 15 + i * lineSpacing);
      ctx.stroke();

      // Top right
      ctx.beginPath();
      ctx.moveTo(width - offset - 15, offset + 15 + i * lineSpacing);
      ctx.lineTo(width - offset - 15 - lineLength + i * 8, offset + 15 + i * lineSpacing);
      ctx.stroke();

      // Bottom left
      ctx.beginPath();
      ctx.moveTo(offset + 15, height - offset - 15 - i * lineSpacing);
      ctx.lineTo(offset + 15 + lineLength - i * 8, height - offset - 15 - i * lineSpacing);
      ctx.stroke();

      // Bottom right
      ctx.beginPath();
      ctx.moveTo(width - offset - 15, height - offset - 15 - i * lineSpacing);
      ctx.lineTo(width - offset - 15 - lineLength + i * 8, height - offset - 15 - i * lineSpacing);
      ctx.stroke();
    }
  },

  // Style 4: Classic Document (1940s)
  function drawClassicFrame(ctx, width, height, borderW, padding) {
    const offset = borderW + padding - 5;
    const color = '#6B5344';
    const medium = '#8B7355';
    const light = '#A89880';

    // Heavy outer border
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.strokeRect(offset - 12, offset - 12, width - (offset - 12) * 2, height - (offset - 12) * 2);

    // Thin inner lines
    ctx.strokeStyle = light;
    ctx.lineWidth = 1;
    ctx.strokeRect(offset - 4, offset - 4, width - (offset - 4) * 2, height - (offset - 4) * 2);

    ctx.strokeStyle = medium;
    ctx.lineWidth = 2;
    ctx.strokeRect(offset + 2, offset + 2, width - (offset + 2) * 2, height - (offset + 2) * 2);

    // Simple corner brackets
    const bracketSize = 20;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;

    // Corners
    [[offset + 8, offset + 8], [width - offset - 8, offset + 8],
     [width - offset - 8, height - offset - 8], [offset + 8, height - offset - 8]].forEach(([x, y], i) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(i * Math.PI / 2);

      ctx.beginPath();
      ctx.moveTo(0, bracketSize);
      ctx.lineTo(0, 0);
      ctx.lineTo(bracketSize, 0);
      ctx.stroke();

      ctx.restore();
    });
  },

  // Style 5: Art Nouveau inspired (1920s)
  function drawArtNouveauFrame(ctx, width, height, borderW, padding) {
    const offset = borderW + padding - 5;
    const color = '#7A6550';
    const accent = '#9A8570';

    // Decorative border
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(offset - 6, offset - 6, width - (offset - 6) * 2, height - (offset - 6) * 2);

    // Wavy inner line
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;

    // Top wave
    ctx.beginPath();
    ctx.moveTo(offset + 30, offset + 2);
    for (let x = offset + 30; x < width - offset - 30; x += 20) {
      ctx.quadraticCurveTo(x + 5, offset - 3, x + 10, offset + 2);
      ctx.quadraticCurveTo(x + 15, offset + 7, x + 20, offset + 2);
    }
    ctx.stroke();

    // Bottom wave
    ctx.beginPath();
    ctx.moveTo(offset + 30, height - offset - 2);
    for (let x = offset + 30; x < width - offset - 30; x += 20) {
      ctx.quadraticCurveTo(x + 5, height - offset + 3, x + 10, height - offset - 2);
      ctx.quadraticCurveTo(x + 15, height - offset - 7, x + 20, height - offset - 2);
    }
    ctx.stroke();

    // Corner flourishes
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;

    [[offset, offset, 0], [width - offset, offset, 90],
     [width - offset, height - offset, 180], [offset, height - offset, 270]].forEach(([x, y, angle]) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle * Math.PI / 180);

      // Spiral flourish
      ctx.beginPath();
      ctx.moveTo(5, 5);
      ctx.bezierCurveTo(25, 5, 25, 25, 15, 25);
      ctx.bezierCurveTo(10, 25, 8, 20, 10, 15);
      ctx.stroke();

      // Small leaf
      ctx.beginPath();
      ctx.ellipse(20, 10, 6, 3, Math.PI / 4, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();

      ctx.restore();
    });
  }
];

function drawCornerOrnaments(ctx, width, height, borderW, padding) {
  // Randomly select a frame style
  const randomIndex = Math.floor(Math.random() * frameStyles.length);
  frameStyles[randomIndex](ctx, width, height, borderW, padding);
}

function addAgingEffect(ctx, width, height) {
  // Subtle vignette/aging in corners
  const gradient = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.3,
    width / 2, height / 2, Math.max(width, height) * 0.8
  );
  gradient.addColorStop(0, 'rgba(139, 115, 85, 0)');
  gradient.addColorStop(1, 'rgba(139, 115, 85, 0.15)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function wrapText(ctx, text, maxWidth) {
  if (!text) return [];

  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  words.forEach(word => {
    // Handle words that are longer than maxWidth (break them character by character)
    if (ctx.measureText(word).width > maxWidth) {
      // First, push the current line if it has content
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }

      // Break the long word into chunks that fit
      let chunk = '';
      for (let i = 0; i < word.length; i++) {
        const testChunk = chunk + word[i];
        if (ctx.measureText(testChunk).width > maxWidth && chunk) {
          lines.push(chunk);
          chunk = word[i];
        } else {
          chunk = testChunk;
        }
      }
      currentLine = chunk;
      return;
    }

    const testLine = currentLine ? currentLine + ' ' + word : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

async function exitApp() {
  try {
    await window.__TAURI__.core.invoke('exit_app');
  } catch (e) {
    console.error('Exit failed:', e);
  }
}


// ===== IMAGE DRAG AND DROP =====
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy';
  }
  const editor = getCurrentEditor();
  if (editor) editor.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.preventDefault();
  const editor = getCurrentEditor();
  if (editor) editor.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const editor = getCurrentEditor();
  if (editor) editor.classList.remove('drag-over');

  // Browser file drop
  if (e.dataTransfer?.files?.length) {
    for (const file of e.dataTransfer.files) {
      if (file.type.startsWith('image/')) {
        insertImageFromFile(file);
      }
    }
  }
}

// Setup Tauri file drop listener
async function setupTauriFileDrop() {
  if (!window.__TAURI__) {
    console.log('Not running in Tauri');
    return;
  }

  try {
    // Use the global Tauri API for drag-drop events
    const { listen } = window.__TAURI__.event;

    // Listen for file drop events
    await listen('tauri://drag-enter', () => {
      const editor = getCurrentEditor();
      if (editor) editor.classList.add('drag-over');
    });

    await listen('tauri://drag-over', () => {
      const editor = getCurrentEditor();
      if (editor) editor.classList.add('drag-over');
    });

    await listen('tauri://drag-leave', () => {
      const editor = getCurrentEditor();
      if (editor) editor.classList.remove('drag-over');
    });

    await listen('tauri://drag-drop', (event) => {
      const editor = getCurrentEditor();
      if (editor) editor.classList.remove('drag-over');

      const paths = event.payload.paths || event.payload;

      if (Array.isArray(paths)) {
        for (const filePath of paths) {
          const ext = filePath.toLowerCase().split('.').pop();
          if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
            insertImageFromPath(filePath);
          }
        }
      }
    });

    console.log('Tauri drag-drop listener initialized');
  } catch (e) {
    console.error('Failed to setup Tauri file drop:', e);
  }
}

async function insertImageFromPath(filePath) {
  try {
    // Read the file as binary data using Tauri's fs API
    const fileData = await window.__TAURI__.fs.readFile(filePath);

    // Determine MIME type from extension
    const ext = filePath.toLowerCase().split('.').pop();
    const mimeTypes = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'bmp': 'image/bmp',
      'svg': 'image/svg+xml'
    };
    const mimeType = mimeTypes[ext] || 'image/png';

    // Convert to base64 data URL
    const base64 = btoa(
      fileData.reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const img = document.createElement('img');
    img.className = 'editor-image';
    img.draggable = false;

    // Wait for image to load
    await new Promise((resolve, reject) => {
      img.onload = () => {
        resolve();
      };
      img.onerror = (err) => {
        console.error('Image load error:', err);
        reject(err);
      };
      img.src = dataUrl;
    });

    insertImageElement(img);
  } catch (e) {
    console.error('Failed to load image:', e);
  }
}

function insertImageFromFile(file) {
  const reader = new FileReader();

  reader.onload = (e) => {
    const img = document.createElement('img');
    img.src = e.target.result;
    img.className = 'editor-image';
    img.draggable = false;

    img.onload = () => {
      insertImageElement(img);
    };
  };

  reader.readAsDataURL(file);
}

function insertImageElement(img) {

  // Create a container div for the image
  const imageContainer = document.createElement('div');
  imageContainer.className = 'image-line';
  imageContainer.contentEditable = 'false';

  // Create wrapper for image and button
  const imageWrapper = document.createElement('div');
  imageWrapper.className = 'image-wrapper';

  // Create newspaper filter button
  const filterBtn = document.createElement('button');
  filterBtn.className = 'image-filter-btn';
  filterBtn.innerHTML = '&#128240;'; // Newspaper emoji
  filterBtn.title = 'Zeitungs-Filter';
  filterBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    img.classList.toggle('newspaper-filter');
    imageWrapper.classList.toggle('has-filter');
    filterBtn.classList.toggle('active');
  };

  imageWrapper.appendChild(img);
  imageWrapper.appendChild(filterBtn);
  imageContainer.appendChild(imageWrapper);

  // Find current line or insert at cursor position
  const selection = window.getSelection();
  let currentLine = null;

  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    currentLine = range.startContainer;
    while (currentLine && !currentLine.classList?.contains('line')) {
      currentLine = currentLine.parentElement;
    }
  }

  // If no current line found, get the last line
  const editor = getCurrentEditor();
  if (!currentLine && editor) {
    const lines = editor.querySelectorAll('.line');
    currentLine = lines[lines.length - 1];
  }

  if (currentLine) {
    // Insert after current line
    currentLine.after(imageContainer);

    // Create a new line after the image
    const newLine = document.createElement('div');
    newLine.className = 'line';
    newLine.dataset.font = state.font;
    imageContainer.after(newLine);

    // Focus new line
    editor.focus();
    const range = document.createRange();
    range.setStart(newLine, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    // Append to editor
    editor.appendChild(imageContainer);

    // Add a new line after
    const newLine = document.createElement('div');
    newLine.className = 'line';
    newLine.dataset.font = state.font;
    editor.appendChild(newLine);
  }

  // Play sound
  state.sound.play(true);
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
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);

    // Find the current line
    let currentLine = range.startContainer;
    while (currentLine && !currentLine.classList?.contains('line')) {
      currentLine = currentLine.parentElement;
    }

    if (currentLine && currentLine.classList.contains('line')) {
      // Check if cursor is at the very beginning of the line
      const isAtStart = isCaretAtLineStart(currentLine, range);

      if (isAtStart && currentLine.previousElementSibling?.classList.contains('line')) {
        e.preventDefault();
        const prevLine = currentLine.previousElementSibling;
        const prevLength = prevLine.textContent.length;

        // Move all content from current line to previous
        while (currentLine.firstChild) {
          prevLine.appendChild(currentLine.firstChild);
        }
        currentLine.remove();

        // Set cursor at merge point
        const textNode = findTextNodeAtOffset(prevLine, prevLength);
        if (textNode) {
          const newRange = document.createRange();
          newRange.setStart(textNode.node, textNode.offset);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        }

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

function isCaretAtLineStart(line, range) {
  if (range.startOffset !== 0) {
    // Check if we're at the start of a text node that's at the start of the line
    let node = range.startContainer;
    while (node && node !== line) {
      if (node.previousSibling) return false;
      node = node.parentNode;
    }
    return range.startOffset === 0;
  }

  // Check if there's any content before the cursor position
  let node = range.startContainer;
  while (node && node !== line) {
    if (node.previousSibling) return false;
    node = node.parentNode;
  }
  return true;
}

function findTextNodeAtOffset(element, offset) {
  let currentOffset = 0;

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent.length;
      if (currentOffset + len >= offset) {
        return { node, offset: offset - currentOffset };
      }
      currentOffset += len;
    } else {
      for (const child of node.childNodes) {
        const result = walk(child);
        if (result) return result;
      }
    }
    return null;
  }

  return walk(element) || { node: element, offset: 0 };
}

function createNewLine() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const editor = getCurrentEditor();

  // Find the current line
  let currentLine = range.startContainer;
  while (currentLine && !currentLine.classList?.contains('line')) {
    currentLine = currentLine.parentElement;
  }

  const newLine = document.createElement('div');
  newLine.className = 'line';
  newLine.dataset.font = state.font;

  if (currentLine) {
    // Extract content after cursor
    const afterRange = document.createRange();
    afterRange.setStart(range.endContainer, range.endOffset);
    afterRange.setEndAfter(currentLine.lastChild || currentLine);

    const afterContent = afterRange.extractContents();
    if (afterContent.textContent || afterContent.childNodes.length) {
      newLine.appendChild(afterContent);
    }

    // Insert new line after current
    currentLine.after(newLine);
  } else if (editor) {
    editor.appendChild(newLine);
  }

  // Move cursor to new line
  const newRange = document.createRange();
  newRange.setStart(newLine, 0);
  newRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(newRange);

  updateCounts();
}

function updateCounts() {
  let text = '';
  // Count text from all pages
  pages.forEach(page => {
    const lines = page.querySelectorAll('.line');
    lines.forEach(line => {
      text += line.textContent + '\n';
    });
  });
  text = text.trim();

  const chars = text.length;
  const words = text === '' ? 0 : text.split(/\s+/).length;

  charCount.textContent = `${chars} Zeichen`;
  wordCount.textContent = `${words} ${words === 1 ? 'Wort' : 'Wörter'}`;
}

function applyFontToSelection(selection, fontName) {
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);

  // Create a span with the new font
  const span = document.createElement('span');
  span.dataset.font = fontName;
  span.className = `inline-font-${fontName}`;

  try {
    // Extract the selected content and wrap it in the span
    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);

    // Clear the selection
    selection.removeAllRanges();

    // Set cursor after the span
    const newRange = document.createRange();
    newRange.setStartAfter(span);
    newRange.collapse(true);
    selection.addRange(newRange);
  } catch (e) {
    console.error('Font application failed:', e);
  }
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
