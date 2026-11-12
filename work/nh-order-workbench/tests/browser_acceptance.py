from __future__ import annotations

import os
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path("/Users/USER/Documents/Codex/2026-07-31/bang")
PDF_1 = Path(
    "/Users/USER/Library/Containers/com.tencent.xinWeChat/Data/Documents/"
    "xwechat_files/wxid_ahypc7nu2jlp22_98f0/temp/drag/Jul03,26(1).pdf"
)
PDF_2 = Path(
    "/Users/USER/Library/Containers/com.tencent.xinWeChat/Data/Documents/"
    "xwechat_files/wxid_ahypc7nu2jlp22_98f0/temp/drag/Jul04,26.pdf"
)
EVIDENCE_DIR = ROOT / "work" / "browser-evidence"
DOWNLOAD_DIR = ROOT / "work" / "test-download"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
WORKBENCH_URL = os.environ.get("WORKBENCH_URL", "http://127.0.0.1:4173")


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
    page.goto(WORKBENCH_URL)
    page.wait_for_load_state("networkidle")

    assert page.get_by_role("heading", name="把每日订单整理成一张清楚的表。").is_visible()
    page.locator('input[type="file"]').set_input_files([str(PDF_1), str(PDF_2)])
    page.get_by_text("订单明细", exact=True).wait_for(timeout=60_000)
    page.wait_for_function(
        "() => !document.querySelector('.dropzone')?.classList.contains('is-busy')",
        timeout=60_000,
    )

    row_count = page.locator("tbody tr").count()
    cancellation_count = page.locator(".cancel-grid figure").count()
    print(f"debug_rows={row_count}")
    print(f"debug_cancellations={cancellation_count}")
    print(f"debug_body={page.locator('body').inner_text()[:8000]}")
    assert row_count == 14, f"expected 14 rows, got {row_count}"
    assert cancellation_count == 1, (
        f"expected 1 cancellation page, got {cancellation_count}"
    )

    order_numbers = page.locator(
        'tbody tr td:first-child input[aria-label^="Order Number"]'
    ).evaluate_all("(elements) => elements.map((element) => element.value)")
    assert "224565" in order_numbers, "positive CHANGE chair order is missing"
    assert "124075" not in order_numbers, "CUBA order was not excluded"
    assert "167514" not in order_numbers, "zero-quantity cancellation leaked into main table"

    change_row = page.locator("tbody tr").nth(order_numbers.index("224565"))
    assert change_row.locator("select").input_value() == "CHANGE"

    page.screenshot(path=str(EVIDENCE_DIR / "desktop-results.png"), full_page=True)
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(250)
    overflow_report = page.evaluate(
        """() => ({
          viewport: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          bodyOverflow: getComputedStyle(document.body).overflowX,
          htmlOverflow: getComputedStyle(document.documentElement).overflowX,
          offenders: [...document.querySelectorAll('body *')]
            .filter((element) => element.getBoundingClientRect().right >
              document.documentElement.clientWidth + 1)
            .slice(0, 20)
            .map((element) => ({
              tag: element.tagName,
              className: element.className,
              right: Math.round(element.getBoundingClientRect().right),
              width: Math.round(element.getBoundingClientRect().width)
            }))
        })"""
    )
    print(f"mobile_overflow={overflow_report}")
    horizontal_scroll = page.evaluate(
        "() => { window.scrollTo(9999, window.scrollY); return window.scrollX; }"
    )
    table_metrics = page.locator(".table-scroll").evaluate(
        """(element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          overflow: getComputedStyle(element).overflow
        })"""
    )
    assert horizontal_scroll == 0, "the page can scroll horizontally"
    assert table_metrics["clientWidth"] <= overflow_report["viewport"]
    assert table_metrics["scrollWidth"] > table_metrics["clientWidth"]
    assert table_metrics["scrollHeight"] > table_metrics["clientHeight"]
    assert table_metrics["overflow"] == "auto"
    page.get_by_role("button", name="向右 →").click()
    page.wait_for_timeout(400)
    assert page.locator(".table-scroll").evaluate("(element) => element.scrollLeft") > 0
    page.locator(".results-card").scroll_into_view_if_needed()
    page.screenshot(path=str(EVIDENCE_DIR / "mobile-results.png"), full_page=False)

    page.set_viewport_size({"width": 1440, "height": 1000})
    with page.expect_download(timeout=60_000) as download_info:
        page.get_by_role("button", name="导出 Excel").click()
    download = download_info.value
    output_path = DOWNLOAD_DIR / download.suggested_filename
    download.save_as(output_path)

    assert not console_errors, f"browser console errors: {console_errors}"
    print(f"rows={row_count}")
    print(f"cancellations={cancellation_count}")
    print(f"orders={','.join(order_numbers)}")
    print(f"download={output_path}")
    print(f"desktop_screenshot={EVIDENCE_DIR / 'desktop-results.png'}")
    print(f"mobile_screenshot={EVIDENCE_DIR / 'mobile-results.png'}")
    browser.close()
