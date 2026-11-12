import json
import os
import re
from collections import Counter, defaultdict
from pathlib import Path

from pypdf import PdfReader


ROOT = Path("/Users/USER/Documents/Codex/2026-07-31/bang/work/portal-order-diagnosis")
PDF_DIR = ROOT / "pdfs"
SUMMARY = Path(os.environ.get("SUMMARY_JSON", ROOT / "browser-summary.json"))


def warning_types(text: str):
    return [part.strip() for part in text.split("；") if part.strip()]


data = json.loads(SUMMARY.read_text(encoding="utf-8"))
rows = [
    row
    for file_rows in data["warning_rows_by_file"].values()
    for row in file_rows
]
page_cache = {}


def page_text(source: str, page_no: int) -> str:
    key = (source, page_no)
    if key not in page_cache:
        reader = PdfReader(PDF_DIR / source)
        page_cache[key] = reader.pages[page_no - 1].extract_text(extraction_mode="layout") or ""
    return page_cache[key]


stats = defaultdict(Counter)
examples = defaultdict(list)
customer_page_status = Counter()

for row in rows:
    warnings = row.get("warnings", [])
    if not warnings:
        continue
    match = re.search(r"第\s*(\d+)\s*页", row.get("sourceDetail", ""))
    if not match:
        continue
    page_no = int(match.group(1))
    text = page_text(row["source"], page_no)
    upper = text.upper()

    for warning in warnings:
        if warning == "Stain 待确认":
            has_stain_label = bool(re.search(r"\bSTAIN\b", upper))
            has_notes = "NOTES:" in upper or "ORDER NOTES:" in upper
            key = "页面出现 STAIN 字样" if has_stain_label else (
                "页面有备注但无 STAIN 字样" if has_notes else "页面无可用备注"
            )
        elif warning == "Cover 待确认":
            has_material = bool(re.search(r"\b(?:LEA(?:THER)?|FAB(?:RIC)?|WWK)\b", upper))
            key = "页面出现皮/布料关键词" if has_material else "页面未出现皮/布料关键词"
        elif warning == "客户名待确认":
            has_customer = bool(re.search(r"CUST(?:OMER)?\s*NAME\s*:", upper))
            customer_page_status[(row["source"], page_no)] += 1
            key = "页面存在客户名字段" if has_customer else "页面不存在客户名字段"
        elif warning == "产品名称待确认":
            has_chair = bool(re.search(r"\b(?:DIN(?:ING)?\s+CHR|DIN(?:ING)?\s+CHAIR|BAR\s+STOOL)\b", upper))
            key = "页面存在椅子描述" if has_chair else "页面椅子描述异常"
        else:
            key = "其他"
        stats[warning][key] += 1
        if len(examples[(warning, key)]) < 5:
            compact = re.sub(r"\s+", " ", text)
            values = row.get("values", [])
            order = str(values[0] if values else "")
            pos = compact.upper().find(order.upper())
            if pos < 0:
                pos = 0
            snippet = compact[max(0, pos - 100): pos + 500]
            examples[(warning, key)].append(
                {
                    "source": row["source"],
                    "page": page_no,
                    "order": values[0] if len(values) > 0 else "",
                    "item": values[1] if len(values) > 1 else "",
                    "cover": values[2] if len(values) > 2 else "",
                    "stain": values[3] if len(values) > 3 else "",
                    "snippet": snippet,
                }
            )

output = {
    "stats": {warning: dict(counter) for warning, counter in stats.items()},
    "examples": {
        f"{warning} / {key}": values
        for (warning, key), values in examples.items()
    },
}
(ROOT / "warning-source-analysis.json").write_text(
    json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8"
)
print(json.dumps(output, ensure_ascii=False, indent=2))
