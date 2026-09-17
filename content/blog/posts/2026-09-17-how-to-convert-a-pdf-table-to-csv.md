---
title: "How to Get a Table Out of a PDF"
dek: "A PDF has no idea it contains a table. Here is how column detection actually works, and how to tell a good extraction from one that has quietly shifted a column."
date: "2026-09-17"
tags: ["extraction", "tables", "csv"]
taskIntent: data-extraction
signalOrigin: backlog
generated: false
runId: "manual-2026-W38"
---

Copy a table out of a PDF and paste it into a spreadsheet and you get one column of run-together text. That is not a bug in either program. The PDF never stored a table; it stored text at coordinates, and the grid you can see exists only in your head and in the whitespace.

#### What the file actually holds

A table in a PDF is a set of short text runs, each with a position on the page. There are no cells, no rows and usually no lines — plenty of tables are drawn with nothing but alignment. Nothing in the file says that "1420.00" belongs under "Net" and beside "INV-2031".

So extraction has to reconstruct that. Rows come from vertical position: text sitting at roughly the same height is one row, and "roughly" has to be generous enough to survive a superscript and tight enough not to merge two lines of a wrapped cell. Columns come from vertical gaps that recur across many rows — a gutter that appears in the same place on row after row is a column boundary, and one that appears on a single row is a coincidence.

#### Where it goes wrong

Two failure modes are worth knowing because they look like success.

The first is a merged column. If two columns are close together and one row has a value long enough to bridge the gap, the gutter stops recurring and both columns become one. You notice because one column contains things like "Harbour Ltd 1420.00" and the count of columns is one less than you expected.

The second is a shifted row. An empty cell produces no text, so a naive reader fills the gap with the next value along and every subsequent field in that row is one column to the left. This is the dangerous one: the file looks plausible, the numbers are all real numbers, and they are attached to the wrong labels. Check any row where a value looks surprising, and check the last column in particular.

#### Choosing the boundaries yourself

The reliable move is to tell the tool where the table is rather than letting it find one. Draw a box around the table body and nothing else. Leave out the page header, the footer, and any explanatory sentence above the table, because each of those is text at a position and will be read as another row.

If a table runs across several pages, do each page separately and stack the results. A repeated header row on page two is easier to delete once than it is to explain to an extractor.

#### Reading the output

Open the CSV and check three things before you use it. Count the columns on the first data row and compare with the header. Look at the last row, where a total or a footnote often sneaks in. Then sum a numeric column and compare with the total printed in the document, if there is one — that single check catches shifted rows, dropped rows and decimal points read as commas in one go.

JSON is worth asking for when a script will consume the result, because it keys each value to its column name. A field named wrongly is visible in JSON and invisible in CSV.

#### Practical notes

Bank statements and invoices are the two documents people extract most, and both are usually laid out on a grid with real gutters, which is why they extract well. Anything typeset in a word processor with tab stops is less predictable, and anything with merged cells spanning columns will need manual repair whatever tool you use.

If the table is an image — a screenshot pasted into a document, or a scanned page — OCR has to read it first, and OCR does not preserve column positions as reliably as a text layer does. Expect to check that output more carefully.

[actuallyfreepdfeditor.com/extract](https://actuallyfreepdfeditor.com/extract) lets you drag a box around a table in your browser and works the columns out from the gaps that recur across its rows, then exports CSV, JSON or a Markdown table. The file stays on your machine, so a statement full of account numbers is not uploaded to work out where its columns are.
