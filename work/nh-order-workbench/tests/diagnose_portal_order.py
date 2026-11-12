from __future__ import annotations

import json
import os
from collections import Counter, defaultdict
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path("/Users/USER/Documents/Codex/2026-07-31/bang")
PDF_DIR = ROOT / "work" / "portal-order-diagnosis" / "pdfs"
HTML = Path(
    os.environ.get(
        "WORKBENCH_HTML",
        ROOT / "outputs" / "NH订单整理工作台_Windows.html",
    )
)
OUTPUT = Path(
    os.environ.get(
        "DIAGNOSIS_OUTPUT",
        ROOT / "work" / "portal-order-diagnosis" / "browser-summary.json",
    )
)
PDFS = sorted(PDF_DIR.glob("*.pdf"))


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    console_errors: list[str] = []
    page.on(
        "console",
        lambda message: (
            console_errors.append(message.text) if message.type == "error" else None
        ),
    )
    page.goto(HTML.as_uri())
    page.wait_for_load_state("networkidle")
    page.locator('input[type="file"]').set_input_files([str(path) for path in PDFS])
    page.wait_for_function(
        """() => {
          const dropzone = document.querySelector('.dropzone');
          const firstSummary = document.querySelector('.summary-grid article strong');
          return dropzone &&
            !dropzone.classList.contains('is-busy') &&
            firstSummary?.textContent?.trim() === '30';
        }""",
        timeout=300_000,
    )

    summary_cards = page.locator(".summary-grid article").evaluate_all(
        """(cards) => cards.map((card) => ({
          label: card.querySelector('.summary-label')?.textContent?.trim(),
          value: card.querySelector('strong')?.textContent?.trim(),
          detail: card.querySelector('small')?.textContent?.trim()
        }))"""
    )
    rows = page.locator("tbody tr").evaluate_all(
        """(tableRows) => tableRows.map((row) => ({
          values: [...row.querySelectorAll('input, select')].map((field) => field.value),
          source: row.querySelector('.source-cell span')?.textContent?.trim() || '',
          sourceDetail: row.querySelector('.source-cell small')?.textContent?.trim() || '',
          sourceNotes: row.dataset.sourceNotes || '',
          warnings: [...row.querySelectorAll('.source-cell em')]
            .map((warning) => warning.textContent?.trim())
            .filter(Boolean)
        }))"""
    )
    cancellations = page.locator(".cancel-grid figure").evaluate_all(
        """(figures) => figures.map((figure) => figure.textContent?.trim())"""
    )
    global_error = page.locator(".alert.error").all_inner_texts()

    warning_counts: Counter[str] = Counter()
    file_warning_counts: Counter[str] = Counter()
    file_row_counts: Counter[str] = Counter()
    warning_rows_by_file: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        file_row_counts[row["source"]] += 1
        for warning in row["warnings"]:
            warning_counts[warning] += 1
            file_warning_counts[row["source"]] += 1
        if row["warnings"]:
            warning_rows_by_file[row["source"]].append(row)

    result = {
        "pdf_count": len(PDFS),
        "summary_cards": summary_cards,
        "row_count": len(rows),
        "rows": rows,
        "warning_row_count": sum(1 for row in rows if row["warnings"]),
        "warning_counts": dict(warning_counts),
        "file_row_counts": dict(sorted(file_row_counts.items())),
        "file_warning_counts": dict(
            sorted(
                file_warning_counts.items(),
                key=lambda entry: (-entry[1], entry[0]),
            )
        ),
        "warning_rows_by_file": dict(warning_rows_by_file),
        "cancellation_count": len(cancellations),
        "cancellations": cancellations,
        "global_error": global_error,
        "console_errors": console_errors,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    browser.close()
