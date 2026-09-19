# Davinci — WebGL GPU Color Grading Studio & RAW Processor

> A professional, browser-based photo color grading & RAW processing tool powered by WebGL 2.0. Featuring non-destructive adjustment layers, spatial masking, crop & transform, multi-image filmstrip workflows, and 16-bit TIFF/RAW parsing. No subscriptions, no server uploads — everything runs 100% locally in your browser.

![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6?style=flat-square&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-8.3-646cff?style=flat-square&logo=vite)
![WebGL 2.0](https://img.shields.io/badge/WebGL-2.0-990000?style=flat-square&logo=webgl)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

---

## ✨ Features

### ⚡ WebGL 2.0 GPU Engine
- **Hardware Accelerated Pipeline**: Pixel adjustments run via GLSL fragment shaders on the GPU with sub-16ms render times regardless of image resolution.
- **16-bit Precision**: High-dynamic-range color math with `Float32Array` processing to prevent banding and color clipping.

### 📸 RAW Decoding & Camera EXIF Inspector
- **Native RAW File Parsing**: Load 10/12/14/16-bit RAW & TIFF formats (`.DNG`, `.CR2`, `.CR3`, `.NEF`, `.ARW`, `.ORF`, `.RW2`, `.RAF`, `.TIF`, `.TIFF`) as well as standard formats (`JPEG`, `PNG`, `WebP`, `AVIF`).
- **Camera EXIF Metadata Chip**: Live display of camera make & model, lens, ISO, shutter speed, aperture, focal length, and bit depth.

### 🥞 Non-Destructive Adjustment Layers & Masking
- **Layers Panel**: Create multiple adjustment layers with individual opacities, reordering, duplicate/delete, and visibility toggles.
- **Blend Modes**: Normal, Multiply, Screen, Overlay, Soft Light, Hard Light, Luminosity, and Color blend modes per layer.
- **Active Layer Context**: Target specific layers or edit the global base image via the top layer bar.
- **Spatial Layer Masking**: Per-layer spatial masks with an interactive drawing canvas:
  - **Brush Tool**: Customizable size, hardness, opacity, and flow controls.
  - **Gradient Tools**: Linear and Radial gradient masks with visual drag handles.
  - **Eraser & Invert**: Seamless mask editing and 1-click mask inversion.

### 📐 Crop, Rotate & Transform
- **Aspect Ratio Presets**: Free, 1:1, 4:5, 16:9, 9:16, 2:3, 3:4, and 5:7.
- **Interactive Box Overlay**: Drag crop handles directly on the canvas.
- **Angle Rotation**: Straighten slider (-45° to +45°), 90° clockwise/counterclockwise rotation.
- **Flips**: Flip horizontal and flip vertical GLSL transformations.

### 🎨 Adjustment Panels

| Panel | Controls |
|---|---|
| **Basic** | Temperature (2000–50000 K), Tint, Exposure, Contrast, Highlights, Shadows, Whites, Blacks, Clarity, Dehaze, Vibrance, Saturation |
| **Tone Curve** | Interactive RGB composite curve + individual Red, Green, and Blue channel curves with bezier spline control |
| **HSL / Color** | Single-panel channel-grouped Hue, Saturation, and Luminance for 8 color ranges (Red, Orange, Yellow, Green, Aqua, Blue, Purple, Magenta) |
| **Color Grading** | Shadows, Midtones, and Highlights color wheels with Blending and Balance controls |
| **Detail** | Sharpening (Amount, Radius, Detail, Masking) and Noise Reduction (Luminance & Color) |
| **Effects** | Vignette (Amount, Midpoint, Feather, Roundness) and Film Grain (Amount, Size, Roughness) |
| **Calibration** | Shadow Tint, Red/Green/Blue Hue and Saturation primary calibration |
| **Crop & Transform** | Aspect ratios, straighten angle, 90° rotations, horizontal/vertical flips |
| **Layers** | Layer creation, opacity, blend modes, reordering, and sub-layer spatial masks |

### 📁 Multi-Image Workflow & Filmstrip
- **Folder Import**: Load entire folders of images via File System Access API (`showDirectoryPicker`) or directory drag-and-drop.
- **Interactive Filmstrip**: Bottom thumbnail strip for switching active images, previewing edits, and tracking status across multi-image sessions.
- **Batch Export Engine**: Process and export multiple images in parallel as high-quality JPEG, PNG, or 16-bit uncompressed TIFF outputs with custom quality settings.

### 🖼️ Canvas & Navigation
- **Zoom & Pan**: Scroll wheel, keyboard shortcuts (`+`/`-`/`0`), or toolbar fit button.
- **Before / After Comparison**: Toggle original unedited photo state with `B`.
- **Live RGB Histogram**: Real-time RGB channel histogram visualization.

### ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `B` | Toggle before/after comparison |
| `F` | Fit image to viewport |
| `+` / `=` | Zoom in |
| `-` | Zoom out |
| `0` | Reset zoom to 100% |
| `←` / `→` | Navigate previous / next image in filmstrip session |

---

## 🏗️ Architecture

Davinci is a **100% client-side TypeScript application** bundled with Vite. Color processing runs on the GPU via WebGL 2.0 fragment shaders with fallback 2D sample rendering for histograms and export pipelines.

```
src/
├── main.ts                   # Application entry point
├── app.ts                    # Root controller — event handling, layer state & layout sync
├── style.css                 # Global CSS styles & design tokens
├── modules/
│   ├── processor.ts          # Core WebGL 2.0 GPU rendering engine & GLSL shaders
│   ├── colormath.ts          # Color space math, LUT generators & curve splines
│   ├── raw.ts                # RAW file decoding (UTIF parser, Bayer demosaic & EXIF metadata)
│   ├── layers.ts             # Non-destructive layer stack logic & blending pipelines
│   ├── maskOverlay.ts        # Interactive spatial masking engine (brush, linear/radial gradients)
│   ├── folderManager.ts      # Multi-image session folder loader & state management
│   ├── filmstrip.ts          # Interactive bottom filmstrip thumbnail navigation bar
│   ├── batchExport.ts        # Parallel batch export worker & multi-format builder
│   └── histogram.ts          # Real-time RGB histogram analysis & renderer
└── panels/
    ├── basic.ts              # Basic exposure & white balance panel
    ├── tonecurve.ts          # Interactive Tone Curve spline editor panel
    ├── hsl.ts                # HSL color channel adjustment panel
    ├── colorgrading.ts       # 3-Way Color Grading wheels panel
    ├── detail.ts             # Sharpening & noise reduction panel
    ├── effects.ts            # Vignette & film grain panel
    ├── calibration.ts        # Camera calibration panel
    ├── crop.ts               # Crop, straighten & transform panel
    └── layersPanel.ts        # Adjustment layers & spatial mask manager panel
```

### WebGL 2.0 Pipeline Flow

```
RAW / Image Input → Float32 Buffer → WebGL Texture Upload
→ Multi-Pass Layer Shader (Base + Adjustment Layers + Spatial Masks)
→ Calibration → Exposure & Tone → Tone Curves (LUT) → HSL → Color Grading
→ Geometry & Crop Transform → Screen Canvas Output
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm or pnpm

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

Open [http://localhost:5173](http://localhost:5173) (or the URL shown in your terminal) in your browser.

### Production Build

```bash
npm run build
```

The optimized bundle is written to `dist/`. Preview locally with:

```bash
npm run preview
```

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| **TypeScript 6** | Type-safe application logic |
| **Vite 8** | Ultra-fast dev server and bundler |
| **WebGL 2.0 / GLSL** | Hardware-accelerated GPU image processing engine |
| **UTIF.js** | RAW IFD header parsing & 16-bit TIFF image decoding |
| **File System Access API** | Native folder selection & multi-file browser storage |
| **Sass** | CSS preprocessing & modular styling |
| **Google Fonts** | Inter & JetBrains Mono typography |

---

## 🔒 Privacy

Davinci is **100% local and client-side**. Your photos never leave your device. No analytics, no server uploads, and no external requests.

---

## 📄 License

MIT © [Nipuna Chandimal](https://github.com/NipunaC95)
