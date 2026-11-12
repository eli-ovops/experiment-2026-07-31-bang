import fs from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const path =
  "/Users/USER/Library/Containers/com.tencent.xinWeChat/Data/Documents/" +
  "xwechat_files/wxid_ahypc7nu2jlp22_98f0/temp/drag/Jul03,26(1).pdf";
const data = new Uint8Array(fs.readFileSync(path));
const document = await getDocument({ data }).promise;
const page = await document.getPage(1);
const content = await page.getTextContent();
const items = content.items
  .filter((item) => "str" in item && "transform" in item)
  .map((item) => ({
    text: item.str,
    x: item.transform[4],
    y: item.transform[5]
  }))
  .filter((item) => item.text.trim());
const lines = [];
for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
  let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2.4);
  if (!line) {
    line = { y: item.y, items: [] };
    lines.push(line);
  }
  line.items.push(item);
}
for (const line of lines.sort((a, b) => b.y - a.y)) {
  line.items.sort((a, b) => a.x - b.x);
  console.log(
    `${line.y.toFixed(1)} | ${line.items
      .map((item) => `[${item.x.toFixed(1)}]${item.text}`)
      .join(" ")}`
  );
}
