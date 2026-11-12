import * as pdfjsLib from "pdfjs-dist";
import workerSource from "pdfjs-dist/build/pdf.worker.min.mjs?raw";

import type {
  CancellationPage,
  ParsedFileResult,
  ParsedOrderRow
} from "./types";
import {
  extractMappedMaterials,
  isChair,
  normalizeItemCode
} from "./mappingRules";

const workerUrl = URL.createObjectURL(
  new Blob([workerSource], { type: "text/javascript" })
);
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface PositionedText {
  text: string;
  x: number;
  y: number;
  width: number;
}

interface TextLine {
  y: number;
  items: PositionedText[];
  text: string;
}

interface ParsedLineItem {
  lineNumber: string;
  productCode: string;
  quantity: number;
  description: string;
  notes: string;
  customerName: string;
}

function cleanText(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/[*+]{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function joinWrappedText(lines: string[]): string {
  const merged: string[] = [];
  for (const rawLine of lines.map(cleanText).filter(Boolean)) {
    const fragment = rawLine.match(/^([A-Za-z]{1,2})(?:\s+|$)(.*)$/);
    const previous = merged.at(-1);
    const previousWord = previous?.match(/([A-Za-z]{1,})$/)?.[1] ?? "";
    const isJoinableFragment =
      fragment &&
      !/^(?:TO|IN|IS|AS|OF|NO|OR|BE|AT|BY)$/i.test(fragment[1]);
    if (
      isJoinableFragment &&
      previous &&
      /[A-Za-z]{2,}$/.test(previous)
    ) {
      merged[merged.length - 1] = `${previous}${fragment[1]}${
        fragment[2] ? ` ${fragment[2]}` : ""
      }`;
    } else if (
      previous &&
      previousWord &&
      previousWord.length <= 2 &&
      !/^(?:TO|IN|IS|AS|OF|NO|OR|BE|AT|BY)$/i.test(previousWord)
    ) {
      merged[merged.length - 1] = `${previous}${rawLine}`;
    } else if (
      previous &&
      !/^(?:STAIN|FAB(?:RIC)?|LEA(?:THER)?|LEGS?|TIMBER|WOOD|FRAME|COLOU?R|COLOR|PLEASE|PLS|DELIVER)\b/i.test(
        rawLine
      )
    ) {
      merged[merged.length - 1] = `${previous} ${rawLine}`;
    } else {
      merged.push(rawLine);
    }
  }
  return cleanText(merged.join(" | "));
}

function joinItems(items: PositionedText[]): string {
  let value = "";
  let previousEnd: number | null = null;
  for (const item of [...items].sort((a, b) => a.x - b.x)) {
    const gap = previousEnd === null ? 0 : item.x - previousEnd;
    if (value && gap > 1.2 && !value.endsWith(" ")) value += " ";
    value += item.text;
    previousEnd = item.x + item.width;
  }
  return cleanText(value);
}

function buildLines(items: PositionedText[]): TextLine[] {
  const lines: TextLine[] = [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  for (const item of sorted) {
    let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2.4);
    if (!line) {
      line = { y: item.y, items: [], text: "" };
      lines.push(line);
    }
    line.items.push(item);
  }

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => {
      line.items.sort((a, b) => a.x - b.x);
      line.text = joinItems(line.items);
      return line;
    });
}

function extractHeaderValue(text: string, expression: RegExp): string {
  return cleanText(text.match(expression)?.[1] ?? "");
}

function formatOrderDate(date: string): string {
  const match = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return date;
  const [, day, month, year] = match;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];
  const monthName = months[Number(month) - 1];
  return monthName ? `${monthName}${day},${year.slice(-2)}` : date;
}

function extractOrderNotes(lines: TextLine[]): string {
  const start = lines.findIndex((line) => /Order Note\(s\):/i.test(line.text));
  if (start < 0) return "";
  const collected: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^LINE\s+PRODUCT/i.test(line.text)) break;
    const value = line.text.replace(/^Order Note\(s\):\s*/i, "");
    if (value && !/Denotes changed lines/i.test(value)) collected.push(value);
  }
  return joinWrappedText(collected);
}

function leftSideText(line: TextLine): string {
  return joinItems(line.items.filter((item) => item.x < 300));
}

function parseLineItems(lines: TextLine[]): ParsedLineItem[] {
  const headerPattern = /^(\d+\*?)\s+(\S+)\s+\(([^)]+)\)/;
  const starts = lines
    .map((line, index) => ({ index, match: line.text.match(headerPattern) }))
    .filter(
      (
        entry
      ): entry is {
        index: number;
        match: RegExpMatchArray;
      } => Boolean(entry.match)
    );

  return starts.map((entry, position) => {
    const end = starts[position + 1]?.index ?? lines.length;
    const segment = lines.slice(entry.index, end);
    const quantityLine = lines
      .slice(Math.max(0, entry.index - 1), Math.min(lines.length, entry.index + 2))
      .find((line) =>
        line.items.some(
          (item) =>
            item.x >= 275 &&
            item.x < 315 &&
            /^-?\d+(?:\.\d+)?$/.test(item.text.trim())
        )
      );
    const quantityItem = quantityLine?.items.find(
      (item) =>
        item.x >= 275 &&
        item.x < 315 &&
        /^-?\d+(?:\.\d+)?$/.test(item.text.trim())
    );
    const leftLines = segment.slice(1).map(leftSideText);
    const notesIndex = leftLines.findIndex((line) => /^\(Notes:/i.test(line));
    const descriptionLines = (
      notesIndex >= 0 ? leftLines.slice(0, notesIndex) : leftLines
    ).filter(
      (line) =>
        line &&
        !/^(ORDER EXC|ORDER INC|DELIVERY REQUIRED)/i.test(line) &&
        !/(NOT BEFORE|CUST NAME|INVOICE NO):/i.test(line)
    );
    const notesEnd =
      notesIndex >= 0
        ? leftLines.findIndex(
            (line, index) =>
              index > notesIndex &&
              /^(?:ORDER\s+(?:EXC|INC)|DELIVERY\s+REQUIRED|This Purchase Order)/i.test(
                line
              )
          )
        : -1;
    const notesLines =
      notesIndex >= 0
        ? leftLines
            .slice(notesIndex, notesEnd >= 0 ? notesEnd : undefined)
            .map((line, index) =>
              index === 0 ? line.replace(/^\(Notes:\s*/i, "") : line
            )
        : [];
    const customerLine = segment.find((line) => /CUST NAME:/i.test(line.text));
    const customer = customerLine?.text.match(
      /CUST NAME:\s*(.*?)(?:\s+INVOICE NO:|$)/i
    )?.[1];

    return {
      lineNumber: entry.match[1].replace("*", ""),
      productCode: entry.match[2],
      quantity: Number(quantityItem?.text ?? "0"),
      description: cleanText(descriptionLines.join(" ")),
      notes: joinWrappedText(notesLines).replace(/\)\s*$/, ""),
      customerName: cleanText(customer ?? "")
    };
  });
}

async function renderPage(page: unknown): Promise<string> {
  const pdfPage = page as {
    getViewport: (options: { scale: number }) => {
      width: number;
      height: number;
    };
    render: (options: Record<string, unknown>) => { promise: Promise<void> };
  };
  const viewport = pdfPage.getViewport({ scale: 1.45 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("浏览器无法创建 PDF 预览画布");
  await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/png");
}

export async function parsePdfFile(
  file: File,
  onProgress?: (page: number, total: number) => void
): Promise<ParsedFileResult> {
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjsLib.getDocument({ data }).promise;
  const rows: ParsedOrderRow[] = [];
  const cancellations: CancellationPage[] = [];
  const fileWarnings: string[] = [];
  let skippedChairLines = 0;

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    onProgress?.(pageNumber, document.numPages);
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const positioned = content.items
      .flatMap((item) => {
        if (!("str" in item) || !("transform" in item)) return [];
        return [
          {
            text: item.str,
            x: item.transform[4],
            y: item.transform[5],
            width: item.width
          }
        ];
      })
      .filter((item) => item.text.trim());
    const lines = buildLines(positioned);
    const pageText = lines.map((line) => line.text).join("\n");

    if (!/Purchase Order/i.test(pageText)) {
      fileWarnings.push(`${file.name} 第 ${pageNumber} 页未识别为订单页`);
      continue;
    }

    const orderNumber = extractHeaderValue(
      pageText,
      /Order Number:\s*(\d+)/i
    );
    const rawDate = extractHeaderValue(
      pageText,
      /Order Date:\s*(\d{2}\/\d{2}\/\d{4})/i
    );
    const type = extractHeaderValue(pageText, /Order Type:\s*([A-Z]+)/i);
    const orderNotes = extractOrderNotes(lines);
    const lineItems = parseLineItems(lines);
    let pageHasCancellation = false;

    if (!orderNumber || lineItems.length === 0) {
      fileWarnings.push(`${file.name} 第 ${pageNumber} 页缺少可解析的订单字段`);
    }

    for (const item of lineItems) {
      if (!isChair(item.description)) {
        if (/\b(DIN\s+CHR|DIN\s+CHAIR|BAR\s+STOOL)\b/i.test(item.description)) {
          skippedChairLines += 1;
        }
        continue;
      }

      if (type === "CHANGE" && item.quantity === 0) {
        pageHasCancellation = true;
        continue;
      }

      const combinedNotes = cleanText(`${item.notes} ${orderNotes}`);
      const itemCode = normalizeItemCode(item.description);
      const { cover, stain, fab } = extractMappedMaterials(
        item.description,
        combinedNotes
      );
      const customerName = item.customerName || "?";
      const warnings: string[] = [];
      if (!itemCode) warnings.push("产品名称待确认");
      if (!cover) warnings.push("Cover 待确认");
      if (!stain) warnings.push("Stain 待确认");
      if (customerName === "?") warnings.push("客户名待确认");
      if (!rawDate) warnings.push("订单日期待确认");

      rows.push({
        id: `${file.name}-${pageNumber}-${item.lineNumber}-${item.productCode}`,
        sourceFile: file.name,
        pageNumber,
        lineNumber: item.lineNumber,
        productCode: item.productCode,
        description: item.description,
        sourceNotes: combinedNotes,
        orderNumber,
        itemCode,
        cover,
        stain,
        qty: item.quantity,
        customerName,
        orderDate: formatOrderDate(rawDate),
        type: type || "?",
        fab,
        warnings
      });
    }

    if (pageHasCancellation) {
      cancellations.push({
        id: `${file.name}-${pageNumber}-${orderNumber}`,
        sourceFile: file.name,
        pageNumber,
        orderNumber,
        imageDataUrl: await renderPage(page)
      });
    }
  }

  return {
    fileName: file.name,
    pageCount: document.numPages,
    rows,
    cancellations,
    skippedChairLines,
    warnings: fileWarnings
  };
}
