import { describe, expect, it } from "vitest";

import {
  extractCover,
  extractFabric,
  extractMappedMaterials,
  extractStain,
  isChair,
  normalizeItemCode
} from "../src/mappingRules";

describe("通用产品映射", () => {
  it("识别附件中未出现过的单词和多词产品名", () => {
    expect(normalizeItemCode("ORION BAR STOOL LEA DEEP TEAL W42XH90")).toBe(
      "ORION BAR STOOL"
    );
    expect(
      normalizeItemCode("NORTH STAR DINING CHAIR FOREST GREEN LEATHER W48XH95")
    ).toBe("NORTH STAR DIN CHR");
  });

  it("保留椅子并排除任意 CUBA 产品", () => {
    expect(isChair("NOVA DINING CHAIR FAB OCEAN BLUE")).toBe(true);
    expect(isChair("CUBA NOVA DINING CHAIR FAB OCEAN BLUE")).toBe(false);
  });
});

describe("备注优先的材料映射", () => {
  it("按斜杠结构映射 Stain / 面料系列 / FAB", () => {
    expect(
      extractMappedMaterials(
        "CHLOE DIN CHR WWK BROOKLYN SILVER W45XH99/FABRIC",
        "NUTMEG/BROOKLYN/SILVER 25% OFF CLEARANCE LINE"
      )
    ).toEqual({
      cover: "NO COVER",
      stain: "NUTMEG",
      fab: "SILVER"
    });
  });

  it("以产品描述中的面料系列为锚点拆分无标签备注", () => {
    expect(
      extractMappedMaterials(
        "DOMUS DIN CHR WWK BROOKLYN FAB CLR STONE W51XH88/FABRIC",
        "NATUREWOOD UMBER GREY BROOKLYN WALNUT | PLEASE DELIVER BOXED"
      )
    ).toEqual({
      cover: "NO COVER",
      stain: "NATUREWOOD UMBER GREY",
      fab: "WALNUT"
    });
  });

  it("备注中的 Leather、FAB 和 Stain 覆盖产品描述", () => {
    expect(
      extractMappedMaterials(
        "ORION DIN CHR CHOCOLATE LEATHER W48XH95",
        "LEATHER COLOUR: DEEP TEAL | LEG STAIN: VOLCANIC ASH"
      )
    ).toEqual({
      cover: "DEEP TEAL",
      stain: "VOLCANIC ASH",
      fab: ""
    });
    expect(
      extractMappedMaterials(
        "NOVA DIN CHR WWK BROOKLYN FAB CLR STONE W48XH95/FABRIC",
        "FABRIC: WARWICK BROOKLYN - AUTUMN GOLD | STAIN: MOONLIT OAK"
      )
    ).toEqual({
      cover: "NO COVER",
      stain: "MOONLIT OAK",
      fab: "AUTUMN GOLD"
    });
  });

  it("能处理备注尾部标签和描述中的 LEG 噪声", () => {
    expect(
      extractMappedMaterials(
        "CHLOE DIN CHR WWK BINGLE FAB CLR JAVA LEG W48XH95/FABRIC",
        "CAPPUCCINO STAIN WARWICK BINGLE JAVA | FABRIC"
      )
    ).toEqual({
      cover: "NO COVER",
      stain: "CAPPUCCINO",
      fab: "JAVA"
    });
  });
});

describe("通用 Cover 与 FAB 映射", () => {
  it("支持皮料颜色写在 LEA 前或后", () => {
    expect(extractCover("ORION BAR STOOL LEA DEEP TEAL W42XH90")).toBe(
      "DEEP TEAL"
    );
    expect(
      extractCover("NOVA DINING CHAIR FOREST GREEN LEATHER W48XH95")
    ).toBe("FOREST GREEN");
  });

  it("布料椅统一输出 NO COVER，并提取多词 FAB 值", () => {
    const description =
      "NOVA DIN CHR WWK BINGLE FAB CLR OCEAN BLUE W48XH95/FABRIC";
    expect(extractCover(description)).toBe("NO COVER");
    expect(extractFabric(description)).toBe("OCEAN BLUE");
    expect(
      extractFabric("ORION BAR STOOL FAB BURNT ORANGE PLAIN W42XH90")
    ).toBe("BURNT ORANGE");
  });
});

describe("通用 Stain 映射", () => {
  it("提取标签后的未知新木色，而不依赖颜色字典", () => {
    expect(extractStain("LEG STAIN: MIDNIGHT MAPLE")).toBe("MIDNIGHT MAPLE");
    expect(
      extractStain(
        "FABRIC: CLOUD BLUE | STAIN TO MATCH WITH VOLCANIC ASH | DELIVER ASAP"
      )
    ).toBe("VOLCANIC ASH");
  });

  it("支持木色写在 STAIN 前和没有 STAIN 标签的结构化表达", () => {
    expect(extractStain("FOREST WALNUT STAIN")).toBe("FOREST WALNUT");
    expect(
      extractStain("TIMBER COLOUR IS MOONLIT OAK | LEATHER NAVY")
    ).toBe("MOONLIT OAK");
    expect(extractStain("LEGS IN SILVERED ASH | FABRIC IVORY")).toBe(
      "SILVERED ASH"
    );
    expect(extractStain("TIMBER STAIN | WALNUT | FABRIC JAVA")).toBe(
      "WALNUT"
    );
    expect(extractStain("LEG WOOD -- FROSTED ELM")).toBe("FROSTED ELM");
  });

  it("不把皮料颜色误当成 Stain", () => {
    expect(extractStain("DIRTY OAK STAIN OLIVE GREEN LEATHER")).toBe(
      "DIRTY OAK"
    );
    expect(extractStain("SADDLE BROWN LEATHER")).toBe("");
    expect(
      extractStain("SMOKED OAK BLACK | LEATHER", "BLACK")
    ).toBe("SMOKED OAK");
    expect(
      extractMappedMaterials(
        "DOMUS BAR STOOL BLACK LEA W50XH99",
        "DIRTY OAK BLACK | LEATHER"
      )
    ).toEqual({
      cover: "BLACK",
      stain: "DIRTY OAK",
      fab: ""
    });
  });
});
