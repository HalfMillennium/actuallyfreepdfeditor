# actuallyfreepdfeditor

A PDF editor that is actually free. No account, no upload, no watermark, and no
"free trial" that asks for a card at the download step.

Your file is opened with [pdf.js](https://mozilla.github.io/pdf.js/), edited in
memory, and written back out with [pdf-lib](https://pdf-lib.js.org) — all inside
your own browser tab. Nothing is sent to a server, because there is no server.

## What it does

| | |
|---|---|
| **Text** | Click anywhere and type. Font, size, weight, slant, colour and alignment. |
| **Signature** | Draw it, type it in a script face, or upload a photo — a near-white background is knocked out automatically so it doesn't land as an opaque rectangle. |
| **Highlight** | Drag over a passage; colour and opacity are adjustable. |
| **White-out** | Drag over anything you'd rather not keep. It is painted over in the exported file, not merely hidden. |
| **Draw** | Freehand pen, with colour and stroke width. |
| **Images** | Drop a picture onto a page. |
| **Pages** | Reorder, rotate, duplicate and delete. |
| | Undo/redo throughout (`⌘Z` / `⇧⌘Z`), zoom, fit-to-width, and a thumbnail rail. |

Everything is flattened into the page content stream on export, so the result
looks the same in every reader and can't be undone by one that ignores
annotations.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

## Verifying it

```bash
npm run type-check
npm run verify:geometry   # export coordinate maths, checked against pdf.js
npm run verify:e2e        # full browser run-through (see script header for setup)
```

`verify:geometry` is the one worth knowing about. Annotations are stored in the
coordinate space of the page *as displayed*, so the exporter has to undo each
page's rotation when it writes them back. The script stamps text at a known
position on pages at `/Rotate` 0, 90, 180 and 270, exports, and reads the glyph
positions back out with pdf.js — all four land within 0.5 pt of target.

## How it fits together

```
lib/
  types.ts          document model + the display-space convention
  editor-state.ts   reducer, undo/redo
  export-pdf.ts     flattening to a new PDF (one transformation matrix per page)
  fonts.ts          text metrics shared by the preview and the exporter
  pdf-document.ts   pdf.js loading and page rendering
  session-storage.ts  localStorage + IndexedDB, with a 24-hour lifetime
components/
  editor/           the app
  base/ application/ foundations/   Untitled UI React (MIT), vendored
```

Text metrics live in exactly one place so the on-screen baseline and the
exported baseline are computed from the same ascent and descent numbers rather
than each guessing at line boxes.

## Privacy

The document never leaves your machine. To make a refresh non-destructive the
app keeps your working session in the browser itself — annotations and
preferences in `localStorage`, the document bytes in `IndexedDB` — scoped to
that one browser and dropped automatically after 24 hours. Clearing site data,
or pressing **Close document**, removes it immediately.

## Built with

[Next.js](https://nextjs.org) ·
[Untitled UI React](https://www.untitledui.com/react) (MIT) ·
[Tailwind CSS](https://tailwindcss.com) ·
[pdf.js](https://mozilla.github.io/pdf.js/) ·
[pdf-lib](https://pdf-lib.js.org) ·
[signature_pad](https://github.com/szimek/signature_pad)

The Untitled UI brand ramp is re-anchored on this project's palette — dark
walnut `#582707`, rust brown `#972d07`, tomato `#ff4b3e`, amber flame `#ffb20f`
and banana cream `#ffe548` — in `styles/theme.css`.
