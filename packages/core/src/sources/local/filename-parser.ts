export interface ParsedFilename {
  seriesName: string;
  volumeNumber?: number;
  chapterNumber?: number;
  subtitle?: string;
  parentheticals: string[];
  extension: string;
}

export function parseFilename(filename: string): ParsedFilename {
  // 1. Strip extension
  const extMatch = filename.match(/(\.[a-zA-Z0-9]+)$/);
  const extension = extMatch ? extMatch[1] : "";
  let working = extension ? filename.slice(0, -extension.length) : filename;

  // 2. Extract parentheticals
  const parentheticals: string[] = [];
  const parenRegex = /\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = parenRegex.exec(working)) !== null) {
    parentheticals.push(match[1]);
  }
  working = working.replace(parenRegex, "").trim();

  // 3. Try vNN pattern (e.g. "Series v01", "Series v0 - The Dawn")
  const volumeMatch = working.match(/^(.+?) v(\d+)(?:\s*-\s*(.+))?$/);
  if (volumeMatch) {
    return {
      seriesName: volumeMatch[1].trim(),
      volumeNumber: parseInt(volumeMatch[2], 10),
      subtitle: volumeMatch[3]?.trim() || undefined,
      parentheticals,
      extension,
    };
  }

  // 4. Try trailing chapter number (space + digits, optionally decimal)
  const chapterMatch = working.match(/^(.+) (\d+(?:\.\d+)?)$/);
  if (chapterMatch) {
    return {
      seriesName: chapterMatch[1].trim(),
      chapterNumber: parseFloat(chapterMatch[2]),
      parentheticals,
      extension,
    };
  }

  // 5. Fallback: entire string is seriesName
  return {
    seriesName: working.trim(),
    parentheticals,
    extension,
  };
}
