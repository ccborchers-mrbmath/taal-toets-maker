# Editable Word exports

## Goal
Add `.docx` downloads for the question paper and transcript in the existing Exports section. The documents will remain editable and closely reproduce the current PDF formatting, content, images, and exercise layouts.

## Changes
- Add a Word-document generator that reads the same assessment, exercise, question, image, logo, and transcript data used by the PDF generator.
- Recreate the question paper as an A4 Word document with:
  - the school logo and current cover-page information;
  - matching headings, instructions, information, typography, spacing, and page breaks;
  - each exercise starting on a new page;
  - picture-question grids containing the same generated images and saved zoom/position adjustments;
  - text multiple-choice layouts, answer boxes, marks, and the single A–H matching table used for Oefening 4.
- Recreate the transcript with the same cover, running headings, narrator labels, speaker labels, pause/repeat markers, emphasis, and exercise sequence.
- Add “Vraestel Word” and “Transkripsie Word” buttons alongside the existing PDF downloads.
- Generate files on demand and return a direct `.docx` download without charging app credits.

## Technical details
- Use the Worker-compatible `docx` package to build OOXML directly; no Microsoft account or Word connector is required.
- Use A4 dimensions and the PDF’s current 50-point margins, with Arial as Word’s closest dependable equivalent to Helvetica.
- Download and embed the existing school logo and option images. Pre-crop option artwork before embedding so saved zoom and drag positioning closely match the PDF.
- Keep question blocks together where possible and set explicit exercise page breaks. Word may make small pagination shifts between devices because it reflows editable content.
- Keep the existing PDF generation and caching unchanged. Word files will be generated from current data so edits and image framing are always reflected.

## Verification
- Generate both Word files from a completed paper containing image questions and Oefening 4.
- Validate each `.docx`, convert every page to PDF/images, and inspect every page for clipping, missing images, repeated options, broken page breaks, or overlapping text.
- Confirm both new buttons download correctly in Afrikaans and English interface modes, while existing PDF and audio exports remain unchanged.
