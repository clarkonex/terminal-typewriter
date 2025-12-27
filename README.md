# Terminal Typewriter

A minimalist text editor with the feel of 1937 — where typewriter meets terminal.

![Terminal Typewriter](src-tauri/icons/icon.png)

## Features

- **Authentic Typewriter Sounds** — 55 individual key sounds with pitch variation, vinyl crackle, and reverb
- **10 Typewriter Fonts** — Special Elite, American Typewriter, Adler, Remington, 1942, Berlin Email, CutMeOut, Facets, Hofstaetten, Zent
- **3 Retro Themes** — Vintage Brown (sepia), Retro Orange (amber on black), Terminal Green (CRT phosphor)
- **CRT Monitor Effect** — Rounded bezel, vignette, and authentic screen curvature
- **Per-Line Font Styling** — Each line can have its own font
- **Distraction-Free Writing** — Focus on your words

## Installation

### macOS
Download the `.dmg` from [Releases](../../releases), open it, and drag Terminal Typewriter to Applications.

> **Note:** On first launch, you may need to right-click → Open → "Open" to bypass Gatekeeper.

### Build from Source

Requirements:
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/)
- [Tauri CLI](https://tauri.app/)

```bash
# Install dependencies
npm install

# Run in development
npm run tauri dev

# Build for production
npm run tauri build
```

## Usage

- **Type** — Hear the satisfying click of mechanical keys
- **Enter** — Carriage return sound
- **Theme** — Switch between Vintage Brown, Retro Orange, Terminal Green
- **Font** — Choose your typewriter font (applies to new lines)
- **Volume** — Adjust typewriter sound level
- **Save** — Export your text as .txt file

## Tech Stack

- [Tauri](https://tauri.app/) — Rust + Web frontend
- Vanilla HTML/CSS/JS — No framework overhead
- Web Audio API — Sound synthesis and effects

## License

MIT

---

*Terminal Typewriter — 1937*
