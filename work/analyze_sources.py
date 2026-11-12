from __future__ import annotations

import json
from pathlib import Path

from openpyxl import load_workbook
from pypdf import PdfReader


PDFS = [
    Path(
        "/Users/USER/Library/Containers/com.tencent.xinWeChat/Data/Documents/"
        "xwechat_files/wxid_ahypc7nu2jlp22_98f0/temp/drag/Jul03,26(1).pdf"
    ),
    Path(
        "/Users/USER/Library/Containers/com.tencent.xinWeChat/Data/Documents/"
        "xwechat_files/wxid_ahypc7nu2jlp22_98f0/temp/drag/Jul04,26.pdf"
    ),
]
WORKBOOK = Path(
    "/Users/USER/Library/Containers/com.tencent.xinWeChat/Data/Documents/"
    "xwechat_files/wxid_ahypc7nu2jlp22_98f0/temp/drag/NH订单.xlsx"
)


def compact_text(value: str | None) -> str:
    return " ".join((value or "").split())


def inspect_pdfs() -> list[dict]:
    result: list[dict] = []
    for path in PDFS:
        reader = PdfReader(path)
        pages = []
        for page_number, page in enumerate(reader.pages, 1):
            text = page.extract_text(extraction_mode="layout")
            pages.append(
                {
                    "page": page_number,
                    "chars": len(text),
                    "preview": compact_text(text)[:700],
                    "text": text,
                }
            )
        result.append({"file": path.name, "pages": pages})
    return result


def inspect_workbook() -> dict:
    workbook = load_workbook(WORKBOOK, data_only=False)
    result = {"file": WORKBOOK.name, "sheets": []}
    for sheet in workbook.worksheets:
        rows = []
        for row in sheet.iter_rows():
            values = [cell.value for cell in row]
            if any(value is not None for value in values):
                rows.append({"row": row[0].row, "values": values})
        result["sheets"].append(
            {
                "title": sheet.title,
                "state": sheet.sheet_state,
                "max_row": sheet.max_row,
                "max_column": sheet.max_column,
                "freeze_panes": str(sheet.freeze_panes) if sheet.freeze_panes else None,
                "auto_filter": sheet.auto_filter.ref,
                "merged_cells": [str(item) for item in sheet.merged_cells.ranges],
                "print_area": str(sheet.print_area),
                "print_titles": str(sheet.print_titles),
                "rows": rows,
            }
        )
    return result


if __name__ == "__main__":
    print(
        json.dumps(
            {"pdfs": inspect_pdfs(), "workbook": inspect_workbook()},
            ensure_ascii=False,
            indent=2,
            default=str,
        )
    )
