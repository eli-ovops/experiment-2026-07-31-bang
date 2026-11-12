function compact(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/[*+]{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalized(value: string): string {
  return compact(value)
    .toUpperCase()
    .replace(/([A-Z])STAIN\b/g, "$1 STAIN")
    .replace(/\bSTAIN(?!ED\b)([A-Z])/g, "STAIN $1")
    .replace(/([A-Z])FABRIC\b/g, "$1 FABRIC")
    .replace(/\bFABRIC([A-Z])/g, "FABRIC $1")
    .replace(/([A-Z])LEATHER\b/g, "$1 LEATHER")
    .replace(/\bLEATHER([A-Z])/g, "LEATHER $1")
    .replace(/\bLETHER\b/g, "LEATHER")
    .replace(/\bCLOUR\b/g, "COLOUR");
}

const CHAIR_TYPE =
  String.raw`(?:DIN(?:ING)?\s+(?:CHR|CHAIR)|BAR\s+STOOL)`;

function chairTypeEnd(description: string): number {
  const match = new RegExp(String.raw`\b${CHAIR_TYPE}\b`, "i").exec(description);
  return match ? match.index + match[0].length : -1;
}

function trimMappedValue(value: string): string {
  return compact(value)
    .replace(/[.]{2,}/g, " ")
    .replace(/^[\s:/=_-]+|[\s:/=_-]+$/g, "")
    .replace(
      /^(?:(?:COLOU?R\s+OF\s+TIMBER|COLOR\s+OF\s+TIMBER|COLOU?R|COLOR|OF\s+(?:THE\s+)?CHAIR\s+LEG|CHAIR\s+LEG|LEGS?|TIMBER|WOOD)\s*)+/i,
      ""
    )
    .replace(
      /^(?:(?:PLEASE\s+SHIP\s+OUT\s+ASAP|SHIP\s+OUT\s+ASAP|PLEASE\s+SUPPLY\s+IN|PLEASE|SUPPLY\s+IN|WITH|THE|OF\s*:|IS|TO\s+BE|BE|IN|MATCH(?:ED)?(?:\s+WITH)?|TO\s+MATCH(?:\s+WITH)?)\s*)+/i,
      ""
    )
    .replace(/^(?:FOR|ON)\s+(?:THE\s+)?LEGS?\b[\s\S]*$/i, "")
    .replace(
      /\s+\b(?:FAB(?:RIC)?|LEA(?:THER)?|DELIVER(?:Y)?|PLEASE|PLS|INVOICE|DISCOUNT|URGENT|CUSTOMER|CHAIRS?|SEATS?)\b[\s\S]*$/i,
      ""
    )
    .replace(/\s+\b(?:COLOU?R|COLOR)?\s*FROM\b[\s\S]*$/i, "")
    .replace(/\s+\bSTAIN\b[\s\S]*$/i, "")
    .replace(/\s+\b(?:[A-Z]+\s+)?STAIN\s+(?:BOARD|RANGE)\b[\s\S]*$/i, "")
    .replace(/\s+\b(?:ON|FOR)\s+(?:THE\s+)?LEGS?\b[\s\S]*$/i, "")
    .replace(/\s+\b(?:STAIN|COLOU?R|COLOR)\b\s*$/i, "")
    .replace(/(?:COLOU?R|COLOR)\s*$/i, "")
    .replace(/^[\s:/=_-]+|[\s:/=_-]+$/g, "")
    .trim();
}

function usefulMappedValue(value: string): boolean {
  if (!value || value.length > 80) return false;
  if (/X{3,}/i.test(value)) return false;
  if (/^(?:ASSORTED|STAIN|COLOU?RS?|COLOR|MATCH|FOR|ON|UNKNOWN|TBC)$/i.test(value)) {
    return false;
  }
  return /[A-Z]/i.test(value);
}

function clauseBeforeMarker(clause: string, markerIndex: number): string {
  let before = clause.slice(0, markerIndex);
  const boundary = Math.max(
    before.lastIndexOf("|"),
    before.lastIndexOf(";"),
    before.lastIndexOf(","),
    before.lastIndexOf(" WITH "),
    before.lastIndexOf(" - "),
    before.lastIndexOf(" FABRIC "),
    before.lastIndexOf(" LEATHER ")
  );
  if (boundary >= 0) before = before.slice(boundary + 1);
  before = before
    .replace(/\b(?:LEG|LEGS|TIMBER|WOOD|COLOU?R|COLOR)\b/gi, " ")
    .replace(/\b(?:PYS)\b/gi, " ");
  return trimMappedValue(before);
}

export function isChair(description: string): boolean {
  const value = normalized(description);
  return !/\bCUBA\b/.test(value) && new RegExp(String.raw`\b${CHAIR_TYPE}\b`).test(value);
}

export function normalizeItemCode(description: string): string {
  const value = normalized(description);
  const match = value.match(
    new RegExp(String.raw`^\s*([A-Z][A-Z0-9'& -]*?)\s+(${CHAIR_TYPE})\b`)
  );
  if (!match) return "";
  const model = compact(match[1]);
  const type = /BAR\s+STOOL/.test(match[2]) ? "BAR STOOL" : "DIN CHR";
  return `${model} ${type}`;
}

export function extractCover(description: string): string {
  const value = normalized(description);
  const typeEnd = chairTypeEnd(value);
  if (typeEnd < 0) return "";
  const tail = value.slice(typeEnd).trim();
  const leather = /\bLEA(?:THER)?\b/.exec(tail);
  const fabric = /\b(?:FAB(?:RIC)?|WWK)\b/.exec(tail);

  if (!leather && fabric) return "NO COVER";
  if (!leather) return "";

  const beforeLeather = trimMappedValue(tail.slice(0, leather.index));
  const afterLeather = trimMappedValue(
    tail
      .slice(leather.index + leather[0].length)
      .split(/\bW\d|\bD\d|\bH\d|\bDIA\.?|\bSEAT\b|\/|\bASSORTED\b/i)[0]
  );
  return beforeLeather || afterLeather;
}

export function extractFabric(description: string): string {
  const value = normalized(description);
  const patterns = [
    /\bFAB(?:RIC)?\s+CLR\s+([A-Z][A-Z0-9'& -]*?)(?=\s+W\d|\s+D\d|\s+H\d|\/|\s+PLAIN\b|\s+ASSORTED\b|\s+STAIN\b|\s+CODE\b|\s+LEGS?\b|$)/,
    /\b(?:FAB|FABRIC|CLR)\s+([A-Z][A-Z0-9'& -]*?)(?=\s+W\d|\s+D\d|\s+H\d|\/|\s+PLAIN\b|\s+ASSORTED\b|\s+STAIN\b|\s+CODE\b|\s+LEGS?\b|$)/
  ];
  for (const pattern of patterns) {
    const candidate = trimMappedValue(value.match(pattern)?.[1] ?? "");
    if (
      usefulMappedValue(candidate) &&
      !/^(?:COLOU?R|COLOR|CLRS?|ASSORTED)$/.test(candidate)
    ) {
      return candidate;
    }
  }
  return "";
}

export function extractStain(
  notes: string,
  cover = "",
  fabricCollection = ""
): string {
  const value = normalized(notes);
  if (!value) return "";
  const clauses = value
    .split(/\s*(?:\||;|\n)\s*/)
    .map((clause) =>
      compact(clause.split("(")[0].replace(/[()[\]]/g, " ")).replace(
        /\s+\d+\.\d+\s*$/,
        ""
      )
    )
    .filter(Boolean);

  for (const clause of clauses) {
    const marker = /\bSTAIN(?:ED)?\b/.exec(clause);
    if (!marker) continue;

    let before = cleanNoteMaterial(clauseBeforeMarker(clause, marker.index));
    if (
      /^(?:WARWICK|WARRICK|WWK|PROFILE|ZEPEL)\b/.test(before) &&
      before.split(/\s+/).length >= 3
    ) {
      before = before.split(/\s+/).at(-1) ?? before;
    }
    const rawAfter = clause.slice(marker.index + marker[0].length);
    const afterMentionsLeather = /\bLEA(?:THER)?\b/.test(rawAfter);
    const nextClause = clauses[clauses.indexOf(clause) + 1] ?? "";
    const afterHasInstruction =
      /\b(?:FAB(?:RIC)?|FROM|REFER|SUPPLIER|INVOICE|CLEARANCE|DISCOUNT|TO\s+GO\s+WITH|FLOORSTOCK|DELIVER)\b|X{3,}|\d+(?:\.\d+)?%/i.test(
        rawAfter
      ) || /^FABRIC\b/i.test(nextClause);
    const afterHasFabricCollection =
      Boolean(fabricCollection) &&
      new RegExp(
        String.raw`\b${fabricCollection.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\b`
      ).test(rawAfter);
    let after = cleanNoteMaterial(rawAfter);
    if (!usefulMappedValue(after)) {
      after = cleanNoteMaterial(nextClause);
      if (
        /\b(?:FAB(?:RIC)?|FROM|REFER|SUPPLIER|INVOICE|CLEARANCE|DISCOUNT|FLOORSTOCK|DELIVER)\b/i.test(
          nextClause
        ) &&
        usefulMappedValue(before)
      ) {
        return before;
      }
    }

    if (
      (afterHasInstruction || afterHasFabricCollection) &&
      usefulMappedValue(before)
    ) {
      return before;
    }
    if (!afterMentionsLeather && usefulMappedValue(after)) return after;
    if (usefulMappedValue(before)) return before;
    if (usefulMappedValue(after)) return after;
  }

  const contextualPatterns = [
    /\bLEA(?:THER)?\s+[A-Z][A-Z -]*?-\s*([A-Z][A-Z -]*?)\s+LEGS?\b/,
    /\b(?:TIMBER|WOOD|LEGS?|FRAME)(?:\s+(?:TIMBER|WOOD))?\s*(?:COLOU?R|COLOR)?\s*(?:IS|ARE|TO\s+BE|IN|:|--|-)?\s*([A-Z][A-Z0-9'& /-]*?)(?=\s+\b(?:(?:COLOU?R|COLOR)\s+FROM|FAB(?:RIC)?|LEA(?:THER)?|DELIVER|PLEASE|PLS|COVERED)\b|$)/,
    /\b(?:COLOU?R|COLOR)\s+TO\s+BE(?:\s+IN)?\s+([A-Z][A-Z0-9'& /-]*?)(?=\s+\b(?:FAB(?:RIC)?|LEA(?:THER)?|DELIVER|PLEASE|PLS)\b|$)/,
    /\b([A-Z][A-Z0-9'& /-]{1,40})\s+(?:TIMBER\s+)?LEGS?\b/
  ];
  for (const clause of clauses) {
    for (const pattern of contextualPatterns) {
      const candidate = trimMappedValue(clause.match(pattern)?.[1] ?? "");
      if (usefulMappedValue(candidate)) return candidate;
    }
  }

  for (let index = 0; index < clauses.length - 1; index += 1) {
    if (
      /\b(?:STAIN(?:ED)?|TIMBER|WOOD|LEGS?|FRAME|COLOU?R|COLOR)\b(?:\s+(?:COLOU?R|COLOR|IS|ARE|TO\s+BE|IN))*[\s:=/-]*$/i.test(
        clauses[index]
      )
    ) {
      const candidate = trimMappedValue(clauses[index + 1]);
      if (usefulMappedValue(candidate)) return candidate;
    }
  }

  const normalizedCover = normalized(cover);
  if (normalizedCover) {
    for (let index = 0; index < clauses.length - 1; index += 1) {
      if (!/^LEA(?:THER)?\b/.test(clauses[index + 1])) continue;
      const clause = clauses[index];
      if (!clause.endsWith(normalizedCover)) continue;
      const candidate = trimMappedValue(
        clause.slice(0, clause.length - normalizedCover.length)
      );
      if (usefulMappedValue(candidate)) return candidate;
    }
  }

  return "";
}

function cleanNoteMaterial(value: string): string {
  return trimMappedValue(value)
    .replace(/^[*#\s]+|[*#\s]+$/g, "")
    .replace(/^MASTER\s+PACIFIC\s+/i, "")
    .replace(/^CREATIVE\s+WOODEN\s+IDEAS\s*[-:]?\s*/i, "")
    .replace(
      /\s+(?:AS\s+PER|AS\s+OF|OFF|CLEARANCE|LINE|ORDER|FLOORSTOCK|BOXED|RAW|REFER|SUPPLIER|INVOICE|COMPANY|THANKS|DISCOUNT|CUSTOMER|ACKNOWLEDGE|URGENT|DELIVER)[\s\S]*$/i,
      ""
    )
    .replace(/\s+\d+(?:\.\d+)?%[\s\S]*$/i, "")
    .replace(/\s+X{3,}[\s\S]*$/i, "")
    .replace(/^['"]+|['"]+$/g, "")
    .trim();
}

function extractFabricCollection(description: string): string {
  const value = normalized(description);
  const match = value.match(
    /\bWWK\s+([A-Z0-9'& -]+?)(?=\s+FAB(?:RIC)?(?:\s+CLR)?\b)/
  );
  if (match) return compact(match[1]);
  return compact(value.match(/\bWWK\s+([A-Z0-9'&-]+)/)?.[1] ?? "");
}

function extractNoteCover(description: string, notes: string): string {
  const value = normalized(notes);
  const descriptionCover = extractCover(description);
  const clauses = value.split(/\s*(?:\||;|\n)\s*/).filter(Boolean);
  for (const clause of clauses) {
    const explicitAfter = clause.match(
      /\bLEA(?:THER)?\b(?:\s+COLOU?R|\s+COLOR)?\s*[:=-]\s*([A-Z][A-Z0-9'& -]*?)(?=\s+\b(?:STAIN|LEGS?|TIMBER|WOOD|FAB(?:RIC)?|DELIVER|PLEASE|PLS)\b|$)/
    );
    const afterCandidate = cleanNoteMaterial(explicitAfter?.[1] ?? "");
    if (usefulMappedValue(afterCandidate)) return afterCandidate;

    const leather = /\bLEA(?:THER)?\b/.exec(clause);
    if (!leather) continue;
    let before = clause.slice(0, leather.index);
    const stain = /\bSTAIN\b/g;
    let stainMatch: RegExpExecArray | null = null;
    let current: RegExpExecArray | null;
    while ((current = stain.exec(before))) stainMatch = current;
    if (stainMatch) before = before.slice(stainMatch.index + stainMatch[0].length);
    if (before.includes(")")) before = before.slice(before.lastIndexOf(")") + 1);
    const beforeCandidate = cleanNoteMaterial(before);
    if (
      descriptionCover &&
      new RegExp(
        String.raw`\b${descriptionCover.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\b`
      ).test(beforeCandidate)
    ) {
      return descriptionCover;
    }
    if (
      usefulMappedValue(beforeCandidate) &&
      beforeCandidate.length <= 30 &&
      !/\b(?:STAIN|CHAIRS?|X{3,})\b/.test(beforeCandidate)
    ) {
      return beforeCandidate.replace(/^(?:CHAIRS?\s+IN|TO\s+BE)\s+/i, "");
    }
  }
  for (let index = 0; index < clauses.length - 1; index += 1) {
    if (!/^LEA(?:THER)?\b/.test(clauses[index])) continue;
    const candidate = cleanNoteMaterial(
      clauses[index + 1].replace(/^(?:COLOU?R|COLOR)\s+(?:IS|:|-)?\s*/i, "")
    );
    if (usefulMappedValue(candidate) && candidate.length <= 30) return candidate;
  }
  return "";
}

function extractNoteFabric(description: string, notes: string): string {
  const value = normalized(notes);
  const match = value.match(
    /\bFAB(?:RIC)?\b(?:\s+COLOU?R|\s+COLOR|\s+CLR)?\s*[:=-]?\s*([A-Z][A-Z0-9'& /-]*?)(?=\s+\b(?:FAB(?:RIC)?|STAIN|LEGS?|TIMBER|WOOD|LEA(?:THER)?|DELIVER|PLEASE|PLS)\b|\s*\)|\s+\d+(?:\.\d+)?\b|\||$)/
  );
  let candidate = cleanNoteMaterial(match?.[1] ?? "");
  if (!candidate) {
    const clauses = value.split(/\s*(?:\||;|\n)\s*/).filter(Boolean);
    for (let index = 1; index < clauses.length; index += 1) {
      if (!/^FABRIC\b/.test(clauses[index])) continue;
      const stainMarker = /\bSTAIN(?:ED)?\b/.exec(clauses[index - 1]);
      if (!stainMarker) continue;
      candidate = cleanNoteMaterial(
        clauses[index - 1].slice(stainMarker.index + stainMarker[0].length)
      );
      break;
    }
  }
  if (!candidate) return "";
  const collection = extractFabricCollection(description);
  if (
    collection &&
    candidate.startsWith(`${collection} `) &&
    candidate.length > collection.length + 1
  ) {
    candidate = candidate.slice(collection.length + 1);
  }
  const candidateWords = candidate.split(/\s+/);
  if (
    candidateWords.length >= 2 &&
    new RegExp(
      String.raw`\b${candidateWords[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\b`
    ).test(normalized(description))
  ) {
    candidate = candidateWords.slice(1).join(" ");
  }
  const separated = candidate.split(/\s+-\s+|\/+/).filter(Boolean);
  if (separated.length > 1) candidate = separated.at(-1) ?? candidate;
  if (/^[A-Z]+-[A-Z]+\s+[A-Z][A-Z -]*$/.test(candidate)) {
    candidate = candidate.split(/\s+/).at(-1) ?? candidate;
  }
  const words = candidate.split(/\s+/);
  if (
    words.length >= 3 &&
    /^(?:WARWICK|WARRICK|PROFILE|WWK|ZEPEL)$/i.test(words[0])
  ) {
    candidate = words.at(-1) ?? candidate;
  }
  candidate = candidate.replace(/\s+LEGS?\b.*$/i, "").replace(/['"]+$/g, "");
  return usefulMappedValue(candidate) ? candidate : "";
}

function extractUnlabelledNoteMaterials(
  description: string,
  notes: string
): { stain: string; fab: string } {
  const firstClause = normalized(notes).split(/\s*(?:\||;|\n)\s*/)[0] ?? "";
  const slashParts = firstClause
    .split("/")
    .map(cleanNoteMaterial)
    .filter(Boolean);
  if (slashParts.length >= 3) {
    return {
      stain: slashParts[0],
      fab: slashParts.at(-1) ?? ""
    };
  }

  const collection = extractFabricCollection(description);
  if (!collection) return { stain: "", fab: "" };
  const anchor = new RegExp(
    String.raw`\b${collection.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\b`
  ).exec(firstClause);
  if (!anchor) return { stain: "", fab: "" };

  const stain = cleanNoteMaterial(firstClause.slice(0, anchor.index));
  const fab = cleanNoteMaterial(
    firstClause.slice(anchor.index + anchor[0].length)
  );
  return {
    stain: usefulMappedValue(stain) ? stain : "",
    fab: usefulMappedValue(fab) ? fab : ""
  };
}

export function extractMappedMaterials(
  description: string,
  notes: string
): { cover: string; stain: string; fab: string } {
  const descriptionCover = extractCover(description);
  const descriptionFab = extractFabric(description);
  const unlabelled = extractUnlabelledNoteMaterials(description, notes);
  const noteCover = extractNoteCover(description, notes);
  const noteFab = extractNoteFabric(description, notes);
  const collection = extractFabricCollection(description);
  let stain =
    extractStain(
      notes,
      noteCover || descriptionCover,
      collection
    ) || unlabelled.stain;
  if (collection) {
    const collectionMatch = new RegExp(
      String.raw`\b${collection.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\b`
    ).exec(stain);
    if (collectionMatch) {
      stain = cleanNoteMaterial(stain.slice(0, collectionMatch.index));
    }
  }
  stain = cleanNoteMaterial(stain);
  const mappedCover = noteCover || descriptionCover;
  if (
    mappedCover &&
    stain.endsWith(` ${mappedCover}`) &&
    stain.length > mappedCover.length + 1
  ) {
    stain = stain.slice(0, -(mappedCover.length + 1)).trim();
  }
  if (/CREATIVE\s+WOODEN\s+IDEAS\s*[-:]\s*/.test(stain)) {
    stain = stain.replace(/^.*CREATIVE\s+WOODEN\s+IDEAS\s*[-:]\s*/i, "");
  }
  stain = stain.replace(
    /\s+\b(?:WARWICK|WARRICK|WWK|PROFILE|ZEPEL)\b\s*$/i,
    ""
  );
  stain = stain.replace(/\s+CREATIVE\s+WOODEN\s+IDEAS\s*$/i, "");
  if (
    stain.length > 28 ||
    /(?:ORDER|FLOORSTOCK|DISCOUNT|CUSTOMER|SUPPLIER|INVOICE|THANKS|DELIVER|X{3,})/.test(
      stain
    ) ||
    /^(?:TO|ED)\b/.test(stain)
  ) {
    stain = "";
  }

  let fab = noteFab || unlabelled.fab || descriptionFab;
  if (stain && fab.endsWith(` - ${stain}`)) {
    fab = fab.slice(0, -(stain.length + 3)).trim();
  }
  fab = cleanNoteMaterial(fab).replace(/\s+LEGS?\b.*$/i, "").trim();

  return {
    cover: mappedCover,
    stain,
    fab
  };
}
