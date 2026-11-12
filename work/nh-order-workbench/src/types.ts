export type EditableField =
  | "orderNumber"
  | "itemCode"
  | "cover"
  | "stain"
  | "qty"
  | "customerName"
  | "orderDate"
  | "fab"
  | "type";

export interface ParsedOrderRow {
  id: string;
  sourceFile: string;
  pageNumber: number;
  lineNumber: string;
  productCode: string;
  description: string;
  sourceNotes: string;
  orderNumber: string;
  itemCode: string;
  cover: string;
  stain: string;
  qty: number;
  customerName: string;
  orderDate: string;
  type: string;
  fab: string;
  warnings: string[];
}

export interface CancellationPage {
  id: string;
  sourceFile: string;
  pageNumber: number;
  orderNumber: string;
  imageDataUrl: string;
}

export interface ParsedFileResult {
  fileName: string;
  pageCount: number;
  rows: ParsedOrderRow[];
  cancellations: CancellationPage[];
  skippedChairLines: number;
  warnings: string[];
}
