import type { ParsedFilename } from './filename-parser.js';

export interface VariantGroup {
  volumeNumber: number;
  variants: { path: string; parsed: ParsedFilename; label: string }[];
}

export function groupVariants(
  files: { path: string; parsed: ParsedFilename }[]
): VariantGroup[] {
  const byVolume = new Map<number, { path: string; parsed: ParsedFilename }[]>();

  for (const file of files) {
    if (file.parsed.volumeNumber == null) continue;
    const vol = file.parsed.volumeNumber;
    if (!byVolume.has(vol)) byVolume.set(vol, []);
    byVolume.get(vol)!.push(file);
  }

  const groups: VariantGroup[] = [];

  for (const [volumeNumber, members] of byVolume) {
    if (members.length === 1) {
      groups.push({
        volumeNumber,
        variants: [{ ...members[0], label: '' }],
      });
      continue;
    }

    // Find parentheticals common to ALL files in the group
    const common = members[0].parsed.parentheticals.filter((p) =>
      members.every((m) => m.parsed.parentheticals.includes(p))
    );
    const commonSet = new Set(common);

    const variants = members.map((m) => {
      const unique = m.parsed.parentheticals.filter((p) => !commonSet.has(p));
      return { ...m, label: unique.length > 0 ? unique.join(', ') : 'Default' };
    });

    groups.push({ volumeNumber, variants });
  }

  return groups.sort((a, b) => a.volumeNumber - b.volumeNumber);
}
