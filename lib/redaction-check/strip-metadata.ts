import { PDFDocument, PDFName } from "pdf-lib";

/**
 * Writes a fresh copy of a PDF's pages with nothing else carried across.
 *
 * Copying the pages into a new document (rather than editing the original in
 * place) is what makes this thorough: the document info dictionary, the XMP
 * metadata stream, attachments, bookmarks and every earlier incremental
 * revision belong to the old file's catalog and trailer, and none of them are
 * copied. `updateMetadata: false` stops pdf-lib stamping its own producer and
 * dates onto the result, so the output's properties really are empty.
 *
 * What stays: the pages as drawn, including any annotations on them.
 */
export async function stripMetadata(bytes: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
    const source = await PDFDocument.load(bytes instanceof Uint8Array ? bytes.slice(0) : bytes.slice(0), { ignoreEncryption: true, updateMetadata: false });
    const out = await PDFDocument.create({ updateMetadata: false });

    const pages = await out.copyPages(source, source.getPageIndices());
    for (const page of pages) {
        // Per-page XMP is rare but legal, and would travel with the page.
        page.node.delete(PDFName.of("Metadata"));
        page.node.delete(PDFName.of("PieceInfo"));
        out.addPage(page);
    }

    return out.save({ useObjectStreams: true });
}
