# actuallyfreepdfeditor

A PDF editor that is actually free. No account, no upload, no watermark, no
"free trial that asks for a card at the download step".

Your file is opened with `pdf.js`, edited in memory, and written back out with
`pdf-lib` — all inside your own browser tab. Nothing is ever sent to a server,
because there is no server.

## What it does

- **Open** any PDF by drag-and-drop or file picker
- **Add text** anywhere, with control over size, colour, weight and font
- **Sign** by drawing, typing, or dropping in an image of your signature
- **Highlight** passages and **white-out** anything you'd rather not keep
- **Draw** freehand on the page
- **Insert images**
- **Reorder, rotate, duplicate and delete** pages
- **Undo / redo** everything
- **Download** the flattened result

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Built with

[Next.js](https://nextjs.org) · [Untitled UI React](https://www.untitledui.com/react)
(MIT) · [Tailwind CSS](https://tailwindcss.com) · [pdf.js](https://mozilla.github.io/pdf.js/)
· [pdf-lib](https://pdf-lib.js.org) · [signature_pad](https://github.com/szimek/signature_pad)

## Privacy

The document never leaves your machine. To make a refresh non-destructive the
app keeps your working session in the browser itself — annotations and
preferences in `localStorage`, the document bytes in `IndexedDB` — scoped to
that one browser and dropped automatically after 24 hours. Clearing site data,
or hitting **Close document**, removes it immediately.
