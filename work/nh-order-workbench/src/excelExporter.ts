import ExcelJS from "exceljs";

import type { CancellationPage, ParsedOrderRow } from "./types";

const NAVY = "16324F";
const LIGHT_BLUE = "DCEAF5";
const BORDER = "9AA9B5";
const WARNING = "FFF4D6";

function applyThinBorder(cell: ExcelJS.Cell): void {
  cell.border = {
    top: { style: "thin", color: { argb: BORDER } },
    left: { style: "thin", color: { argb: BORDER } },
    bottom: { style: "thin", color: { argb: BORDER } },
    right: { style: "thin", color: { argb: BORDER } }
  };
}

function dateFileName(rows: ParsedOrderRow[]): string {
  const dates = [...new Set(rows.map((row) => row.orderDate).filter(Boolean))];
  return dates.length === 1
    ? `NH订单_${dates[0]}.xlsx`
    : dates.length > 1
      ? `NH订单_${dates[0]}_至_${dates.at(-1)}.xlsx`
      : "NH订单.xlsx";
}

export async function exportWorkbook(
  rows: ParsedOrderRow[],
  cancellations: CancellationPage[]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NH 订单整理工作台";
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet("NH portal order", {
    views: [{ state: "frozen", ySplit: 2 }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9
    }
  });
  sheet.columns = [
    { key: "orderNumber", width: 16 },
    { key: "itemCode", width: 22 },
    { key: "cover", width: 18 },
    { key: "stain", width: 18 },
    { key: "qty", width: 10 },
    { key: "customerName", width: 24 },
    { key: "orderDate", width: 15 },
    { key: "fab", width: 13 },
    { key: "type", width: 14 }
  ];
  sheet.mergeCells("A1:I1");
  const title = sheet.getCell("A1");
  title.value = "NH daily order";
  title.font = { name: "Arial", bold: true, size: 18, color: { argb: "FFFFFF" } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  sheet.getRow(1).height = 30;

  const headers = [
    "Order Number:",
    "Item Code:",
    "Cover",
    "Stain",
    "QTY",
    "Customer name",
    "Order date",
    "FAB",
    "TYPE"
  ];
  const headerRow = sheet.getRow(2);
  headerRow.values = headers;
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { name: "Arial", bold: true, size: 11, color: { argb: NAVY } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: LIGHT_BLUE }
    };
    applyThinBorder(cell);
  });

  rows.forEach((row) => {
    const excelRow = sheet.addRow({
      orderNumber: Number(row.orderNumber) || row.orderNumber,
      itemCode: row.itemCode,
      cover: row.cover,
      stain: row.stain,
      qty: row.qty,
      customerName: row.customerName,
      orderDate: row.orderDate,
      fab: row.fab,
      type: row.type
    });
    excelRow.height = 23;
    excelRow.eachCell((cell) => {
      cell.font = { name: "Arial", size: 10 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      applyThinBorder(cell);
    });
    if (row.warnings.length) {
      excelRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: WARNING }
        };
      });
    }
  });
  sheet.autoFilter = {
    from: "A2",
    to: `I${Math.max(2, rows.length + 2)}`
  };

  const cancelSheet = workbook.addWorksheet("取消订单", {
    pageSetup: {
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: {
        left: 0.3,
        right: 0.3,
        top: 0.35,
        bottom: 0.35,
        header: 0.15,
        footer: 0.15
      }
    }
  });
  cancelSheet.getColumn("A").width = 18;
  cancelSheet.getColumn("B").width = 18;
  cancelSheet.getColumn("C").width = 18;
  cancelSheet.getColumn("D").width = 18;
  cancelSheet.getColumn("E").width = 18;

  if (cancellations.length === 0) {
    cancelSheet.getCell("A1").value = "本批次没有识别到数量为 0 的取消椅子订单";
    cancelSheet.getCell("A1").font = { name: "Arial", size: 12, color: { argb: NAVY } };
  } else {
    let rowOffset = 1;
    cancellations.forEach((cancellation) => {
      const caption = cancelSheet.getCell(`A${rowOffset}`);
      caption.value = `订单 ${cancellation.orderNumber} · ${cancellation.sourceFile} · 第 ${cancellation.pageNumber} 页`;
      caption.font = { name: "Arial", bold: true, size: 11, color: { argb: NAVY } };
      const imageId = workbook.addImage({
        base64: cancellation.imageDataUrl,
        extension: "png"
      });
      cancelSheet.addImage(imageId, {
        tl: { col: 0, row: rowOffset },
        ext: { width: 600, height: 846 }
      });
      rowOffset += 48;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = dateFileName(rows);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
