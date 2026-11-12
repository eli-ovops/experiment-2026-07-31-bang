import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const path =
  "/Users/USER/Library/Containers/com.tencent.xinWeChat/Data/Documents/" +
  "xwechat_files/wxid_ahypc7nu2jlp22_98f0/temp/drag/NH订单.xlsx";

const input = await FileBlob.load(path);
const workbook = await SpreadsheetFile.importXlsx(input);
const overview = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 12000,
  tableMaxRows: 30,
  tableMaxCols: 12,
  tableMaxCellChars: 120,
});
console.log(overview.ndjson);
