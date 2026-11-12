import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  useMemo,
  useRef,
  useState
} from "react";

import { exportWorkbook } from "./excelExporter";
import { parsePdfFile } from "./pdfParser";
import type {
  CancellationPage,
  EditableField,
  ParsedFileResult,
  ParsedOrderRow
} from "./types";

const TABLE_FIELDS: Array<{
  key: EditableField;
  label: string;
  minWidth: number;
}> = [
  { key: "orderNumber", label: "Order Number", minWidth: 130 },
  { key: "itemCode", label: "Item Code", minWidth: 170 },
  { key: "cover", label: "Cover", minWidth: 130 },
  { key: "stain", label: "Stain", minWidth: 130 },
  { key: "qty", label: "QTY", minWidth: 90 },
  { key: "customerName", label: "Customer name", minWidth: 180 },
  { key: "orderDate", label: "Order date", minWidth: 120 },
  { key: "fab", label: "FAB", minWidth: 110 },
  { key: "type", label: "TYPE", minWidth: 120 }
];

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V14" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4v12m0 0l-4.5-4.5M12 16l4.5-4.5M5 20h14" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 018 0v3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3m3 0l-1 13H7L6 7m4 4v5m4-5v5" />
    </svg>
  );
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [fileResults, setFileResults] = useState<ParsedFileResult[]>([]);
  const [rows, setRows] = useState<ParsedOrderRow[]>([]);
  const [cancellations, setCancellations] = useState<CancellationPage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [globalError, setGlobalError] = useState("");

  const warningCount = useMemo(
    () => rows.reduce((total, row) => total + row.warnings.length, 0),
    [rows]
  );
  const warningRowCount = useMemo(
    () => rows.filter((row) => row.warnings.length > 0).length,
    [rows]
  );
  const totalPages = useMemo(
    () => fileResults.reduce((total, result) => total + result.pageCount, 0),
    [fileResults]
  );

  async function processFiles(files: FileList | File[]) {
    const pdfFiles = Array.from(files).filter(
      (file) =>
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    );
    if (!pdfFiles.length) {
      setGlobalError("请选择 PDF 文件。");
      return;
    }

    setGlobalError("");
    setIsProcessing(true);
    const nextResults: ParsedFileResult[] = [];
    try {
      for (const [fileIndex, file] of pdfFiles.entries()) {
        const result = await parsePdfFile(file, (page, pageCount) => {
          setProgress(
            `正在解析 ${file.name} · ${page}/${pageCount} 页 · ${fileIndex + 1}/${pdfFiles.length} 个文件`
          );
        });
        nextResults.push(result);
      }
      setFileResults((current) => [...current, ...nextResults]);
      setRows((current) => [
        ...current,
        ...nextResults.flatMap((result) => result.rows)
      ]);
      setCancellations((current) => [
        ...current,
        ...nextResults.flatMap((result) => result.cancellations)
      ]);
    } catch (error) {
      setGlobalError(
        error instanceof Error
          ? `解析失败：${error.message}`
          : "解析失败，请确认 PDF 不是扫描件或加密文件。"
      );
    } finally {
      setIsProcessing(false);
      setProgress("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (!isProcessing) void processFiles(event.dataTransfer.files);
  }

  function onDropzoneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  }

  function updateRow(id: string, field: EditableField, value: string) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        const nextValue = field === "qty" ? Number(value) : value.toUpperCase();
        return {
          ...row,
          [field]: nextValue,
          warnings: row.warnings.filter(
            (warning) =>
              !warning.toLowerCase().includes(field.toLowerCase()) &&
              !(field === "customerName" && warning.includes("客户名")) &&
              !(field === "orderDate" && warning.includes("订单日期")) &&
              !(field === "itemCode" && warning.includes("产品名称"))
          )
        };
      })
    );
  }

  function addBlankRow() {
    const id = `manual-${Date.now()}`;
    setRows((current) => [
      ...current,
      {
        id,
        sourceFile: "手动新增",
        pageNumber: 0,
        lineNumber: "",
        productCode: "",
        description: "",
        sourceNotes: "",
        orderNumber: "",
        itemCode: "",
        cover: "",
        stain: "",
        qty: 1,
        customerName: "",
        orderDate: "",
        type: "ORIGINAL",
        fab: "",
        warnings: ["手动新增行待确认"]
      }
    ]);
  }

  async function handleExport() {
    if (!rows.length && !cancellations.length) return;
    setIsExporting(true);
    setGlobalError("");
    try {
      await exportWorkbook(rows, cancellations);
    } catch (error) {
      setGlobalError(
        error instanceof Error ? `导出失败：${error.message}` : "导出失败。"
      );
    } finally {
      setIsExporting(false);
    }
  }

  function clearAll() {
    setFileResults([]);
    setRows([]);
    setCancellations([]);
    setGlobalError("");
  }

  function scrollTable(direction: -1 | 1) {
    const table = tableScrollRef.current;
    if (!table) return;
    table.scrollBy({
      left: direction * Math.max(360, table.clientWidth * 0.72),
      behavior: "smooth"
    });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="NH 订单整理工作台首页">
          <span className="brand-mark">NH</span>
          <span>订单整理工作台</span>
        </a>
        <div className="privacy-badge">
          <LockIcon />
          <span>文件仅在本机处理</span>
        </div>
      </header>

      <main id="main-content">
        <section className="intro" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">PDF → Excel</p>
            <h1 id="page-title">把每日订单整理成一张清楚的表。</h1>
            <p className="intro-copy">
              拖入 Five Star Furniture PDF。系统会排除 CUBA 和非椅子产品，
              标出待确认字段，并生成与样例一致的双工作表 Excel。
            </p>
          </div>
          <ol className="step-list" aria-label="使用步骤">
            <li><span>1</span>导入 PDF</li>
            <li><span>2</span>检查结果</li>
            <li><span>3</span>导出 Excel</li>
          </ol>
        </section>

        <section className="workspace-card" aria-labelledby="upload-title">
          <div
            className={`dropzone ${isDragging ? "is-dragging" : ""} ${isProcessing ? "is-busy" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (event.currentTarget === event.target) setIsDragging(false);
            }}
            onDrop={onDrop}
            onClick={() => !isProcessing && inputRef.current?.click()}
            onKeyDown={onDropzoneKeyDown}
            role="button"
            tabIndex={0}
            aria-disabled={isProcessing}
            aria-labelledby="upload-title"
          >
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                if (event.target.files) void processFiles(event.target.files);
              }}
            />
            <span className="dropzone-icon"><UploadIcon /></span>
            <div>
              <h2 id="upload-title">
                {isProcessing ? "正在整理订单" : "拖入今日 PDF"}
              </h2>
              <p>{isProcessing ? progress : "支持同时选择多个文本型 PDF"}</p>
            </div>
            <span className="button secondary">
              {isProcessing ? "请稍候" : "选择文件"}
            </span>
          </div>

          {globalError && (
            <div className="alert error" role="alert">
              <strong>需要处理</strong>
              <span>{globalError}</span>
            </div>
          )}
        </section>

        {(fileResults.length > 0 || rows.length > 0) && (
          <>
            <section className="summary-grid" aria-label="解析摘要">
              <article>
                <span className="summary-label">PDF 文件</span>
                <strong>{fileResults.length}</strong>
                <small>{totalPages} 页</small>
              </article>
              <article>
                <span className="summary-label">主表产品</span>
                <strong>{rows.length}</strong>
                <small>每个产品一行</small>
              </article>
              <article className={warningRowCount ? "needs-attention" : ""}>
                <span className="summary-label">待确认行</span>
                <strong>{warningRowCount}</strong>
                <small>
                  {warningCount ? `共 ${warningCount} 个待确认字段` : "字段完整"}
                </small>
              </article>
              <article>
                <span className="summary-label">取消页面</span>
                <strong>{cancellations.length}</strong>
                <small>CHANGE 且 QTY = 0</small>
              </article>
            </section>

            <section className="results-card" aria-labelledby="results-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">NH portal order</p>
                  <h2 id="results-title">订单明细</h2>
                  <p>所有单元格均可修改。浅黄色行表示仍有待确认字段。</p>
                </div>
                <button className="button text-button" type="button" onClick={addBlankRow}>
                  新增空白行
                </button>
              </div>

              <div className="table-toolbar" aria-label="表格移动工具">
                <span>表格可上下、左右移动</span>
                <div>
                  <button
                    className="table-nav-button"
                    type="button"
                    onClick={() => scrollTable(-1)}
                  >
                    ← 向左
                  </button>
                  <button
                    className="table-nav-button"
                    type="button"
                    onClick={() => scrollTable(1)}
                  >
                    向右 →
                  </button>
                </div>
              </div>

              <div
                ref={tableScrollRef}
                className="table-scroll"
                tabIndex={0}
                aria-label="可上下和横向滚动的订单表"
              >
                <table>
                  <thead>
                    <tr>
                      {TABLE_FIELDS.map((field) => (
                        <th key={field.key} style={{ minWidth: field.minWidth }}>
                          {field.label}
                        </th>
                      ))}
                      <th className="source-column">来源</th>
                      <th className="action-column"><span className="sr-only">操作</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className={row.warnings.length ? "warning-row" : ""}
                        data-source-notes={row.sourceNotes}
                      >
                        {TABLE_FIELDS.map((field) => (
                          <td key={field.key}>
                            {field.key === "type" ? (
                              <select
                                aria-label={`${field.label}，订单 ${row.orderNumber}`}
                                value={String(row[field.key])}
                                onChange={(event) =>
                                  updateRow(row.id, field.key, event.target.value)
                                }
                              >
                                <option value="ORIGINAL">ORIGINAL</option>
                                <option value="CHANGE">CHANGE</option>
                                <option value="?">?</option>
                              </select>
                            ) : (
                              <input
                                aria-label={`${field.label}，订单 ${row.orderNumber || "空白"}`}
                                type={field.key === "qty" ? "number" : "text"}
                                min={field.key === "qty" ? 0 : undefined}
                                step={field.key === "qty" ? 1 : undefined}
                                value={String(row[field.key])}
                                onChange={(event) =>
                                  updateRow(row.id, field.key, event.target.value)
                                }
                              />
                            )}
                          </td>
                        ))}
                        <td className="source-cell">
                          <span>{row.sourceFile}</span>
                          <small>
                            {row.pageNumber ? `第 ${row.pageNumber} 页 · 行 ${row.lineNumber}` : "手动新增"}
                          </small>
                          {row.warnings.map((warning) => (
                            <em key={warning}>{warning}</em>
                          ))}
                        </td>
                        <td className="action-cell">
                          <button
                            className="icon-button danger"
                            type="button"
                            aria-label={`删除订单 ${row.orderNumber || "空白行"}`}
                            onClick={() =>
                              setRows((current) =>
                                current.filter((candidate) => candidate.id !== row.id)
                              )
                            }
                          >
                            <TrashIcon />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="cancellation-card" aria-labelledby="cancel-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">取消订单</p>
                  <h2 id="cancel-title">数量为 0 的变更页面</h2>
                  <p>这些页面会作为图片放入 Excel 的“取消订单”工作表。</p>
                </div>
              </div>
              {cancellations.length ? (
                <div className="cancel-grid">
                  {cancellations.map((cancellation) => (
                    <figure key={cancellation.id}>
                      <img
                        src={cancellation.imageDataUrl}
                        alt={`取消订单 ${cancellation.orderNumber} 的 PDF 第 ${cancellation.pageNumber} 页`}
                      />
                      <figcaption>
                        <strong>订单 {cancellation.orderNumber}</strong>
                        <span>{cancellation.sourceFile} · 第 {cancellation.pageNumber} 页</span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <p className="empty-state">本批次没有识别到取消订单。</p>
              )}
            </section>

            <section className="export-bar" aria-label="导出操作">
              <div>
                <strong>复核完成后再导出</strong>
                <span>
                  将生成 {rows.length} 条明细和 {cancellations.length} 个取消页面
                </span>
              </div>
              <div className="export-actions">
                <button className="button ghost" type="button" onClick={clearAll}>
                  清空重来
                </button>
                <button
                  className="button primary"
                  type="button"
                  disabled={isExporting || (!rows.length && !cancellations.length)}
                  onClick={() => void handleExport()}
                >
                  <DownloadIcon />
                  {isExporting ? "正在生成" : "导出 Excel"}
                </button>
              </div>
            </section>
          </>
        )}
      </main>

      <footer>
        <p>本地静态工具 · 不保存、不上传订单文件</p>
      </footer>
    </div>
  );
}

export default App;
