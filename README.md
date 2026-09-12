# Davinci — Color Grading Studio

> A professional, browser-based photo color grading tool with Lightroom-style adjustments. No subscriptions, no uploads — everything runs locally in your browser.


![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6?style=flat-square&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-8.3-646cff?style=flat-square&logo=vite)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

---

## ✨ Features

### 🎨 Adjustment Panels

| Panel | Controls |
|---|---|
| **Basic** | Temperature, Tint, Exposure, Contrast, Highlights, Shadows, Whites, Blacks, Clarity, Dehaze, Vibrance, Saturation |
| **Tone Curve** | Interactive RGB composite curve + individual R/G/B channel curves with bezier spline control |
| **HSL / Color** | Per-channel Hue, Saturation, and Luminance for 8 color ranges: Red, Orange, Yellow, Green, Aqua, Blue, Purple, Magenta |
| **Color Grading** | Shadows, Midtones, and Highlights color wheels with Blending and Balance controls |
| **Detail** | Sharpening (Amount, Radius, Detail, Masking) and Noise Reduction (Luminance & Color) |
| **Effects** | Vignette (Amount, Midpoint, Feather, Roundness) and Film Grain (Amount, Size, Roughness) |
| **Calibration** | Shadow Tint, Red/Green/Blue Hue and Saturation primary calibration |

### 🖼️ Canvas & Workflow
- **Drag & Drop** image import — just drop a photo onto the canvas
- **File Picker** for JPEG, PNG, WebP, and AVIF
- **Fit to Screen** auto-scales the image to the viewport
- **Zoom** controls: scroll wheel, keyboard shortcuts (`+`/`-`/`0`), or the toolbar button
- **Before/After** toggle (`B`) to compare original vs. edited versions
- **Live Histogram** — RGB channel histogram updates in real time as you adjust
- **Export** processed image as JPEG at 95% quality

### ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `B` | Toggle before/after view |
| `F` | Fit image to screen |
| `+` / `=` | Zoom in |
| `-` | Zoom out |
| `0` | Reset zoom to 100% |

---

## 🏗️ Architecture

The project is a **zero-dependency, client-side TypeScript application** bundled with Vite. All image processing runs entirely in the browser using the Canvas 2D API — no server-side computation, no external API calls.

```
src/
├── main.ts              # Entry point — instantiates App
├── app.ts               # Root controller — wires panels, canvas & events
├── style.css            # Global styles
├── modules/
│   ├── processor.ts     # Core image processing engine (pixel-level pipeline)
│   ├── colormath.ts     # Color math utilities (LUTs, color space conversions, algorithms)
│   └── histogram.ts     # Live RGB histogram renderer
└── panels/
    ├── basic.ts         # Basic adjustments panel UI
    ├── tonecurve.ts     # Interactive tone curve editor
    ├── hsl.ts           # HSL per-color-range panel
    ├── colorgrading.ts  # Color grading wheels panel
    ├── detail.ts        # Sharpening & noise reduction panel
    ├── effects.ts       # Vignette & grain panel
    └── calibration.ts   # Camera calibration panel
```

### Image Processing Pipeline

Each pixel passes through the following ordered pipeline on every edit (debounced via `requestAnimationFrame`):

```
Calibration → White Balance → Exposure → Highlights/Shadows
→ Whites/Blacks → Contrast → Clarity → Vibrance → Saturation
→ Tone Curve (RGB + per-channel) → HSL → Color Grading → Dehaze
→ [Vignette] → [Film Grain]
```

Tone curves are pre-computed as 256-entry Look-Up Tables (LUTs) before the pixel loop for maximum performance.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm

### Installation

```bash
git clone https://github.com/NipunaC95/photo-room.git
cd photo-room
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
```

Output is written to the `dist/` directory. Preview the production build with:

```bash
npm run preview
```

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| **TypeScript 6** | Type-safe application logic |
| **Vite 8** | Dev server and production bundler |
| **Sass** | CSS preprocessing |
| **Canvas 2D API** | Pixel-level image processing and histogram rendering |
| **Google Fonts** | Inter (UI) and JetBrains Mono (code/numeric labels) |

---

## 🔒 Privacy

Davinci is **100% client-side**. Your images never leave your device. No data is sent to any server.

---

## 📄 License

MIT © [Nipuna Chandimal](https://github.com/NipunaC95)
