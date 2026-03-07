import { extractArchiveEntry } from '../../archive.js';
import { readFile } from 'node:fs/promises';

export interface ComicInfoData {
  series?: string;
  title?: string;
  number?: number;
  writer?: string;
  penciller?: string;
  genre?: string;
  publisher?: string;
  summary?: string;
  year?: number;
  pageCount?: number;
  languageISO?: string;
  manga?: boolean;
  pages?: { image: number; type?: string; imageWidth?: number; imageHeight?: number }[];
}

function extractString(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'));
  return match ? match[1] : undefined;
}

function extractNumber(xml: string, tag: string): number | undefined {
  const value = extractString(xml, tag);
  if (value === undefined) return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
}

function extractPages(xml: string): ComicInfoData['pages'] | undefined {
  const pagesMatch = xml.match(/<Pages>([\s\S]*?)<\/Pages>/i);
  if (!pagesMatch) return undefined;

  const pagesContent = pagesMatch[1];
  const pageRegex = /<Page\s+([^>]*?)\/>/gi;
  const pages: NonNullable<ComicInfoData['pages']> = [];
  let match: RegExpExecArray | null;

  while ((match = pageRegex.exec(pagesContent)) !== null) {
    const attrs = match[1];
    const imageMatch = attrs.match(/Image="(\d+)"/i);
    if (!imageMatch) continue;

    const page: NonNullable<ComicInfoData['pages']>[number] = {
      image: Number(imageMatch[1]),
    };

    const typeMatch = attrs.match(/Type="([^"]*)"/i);
    if (typeMatch) page.type = typeMatch[1];

    const widthMatch = attrs.match(/ImageWidth="(\d+)"/i);
    if (widthMatch) page.imageWidth = Number(widthMatch[1]);

    const heightMatch = attrs.match(/ImageHeight="(\d+)"/i);
    if (heightMatch) page.imageHeight = Number(heightMatch[1]);

    pages.push(page);
  }

  return pages.length > 0 ? pages : undefined;
}

export function parseComicInfoXml(xml: string): ComicInfoData {
  const data: ComicInfoData = {};

  const series = extractString(xml, 'Series');
  if (series !== undefined) data.series = series;

  const title = extractString(xml, 'Title');
  if (title !== undefined) data.title = title;

  const number = extractNumber(xml, 'Number');
  if (number !== undefined) data.number = number;

  const writer = extractString(xml, 'Writer');
  if (writer !== undefined) data.writer = writer;

  const penciller = extractString(xml, 'Penciller');
  if (penciller !== undefined) data.penciller = penciller;

  const genre = extractString(xml, 'Genre');
  if (genre !== undefined) data.genre = genre;

  const publisher = extractString(xml, 'Publisher');
  if (publisher !== undefined) data.publisher = publisher;

  const summary = extractString(xml, 'Summary');
  if (summary !== undefined) data.summary = summary;

  const year = extractNumber(xml, 'Year');
  if (year !== undefined) data.year = year;

  const pageCount = extractNumber(xml, 'PageCount');
  if (pageCount !== undefined) data.pageCount = pageCount;

  const languageISO = extractString(xml, 'LanguageISO');
  if (languageISO !== undefined) data.languageISO = languageISO;

  const mangaValue = extractString(xml, 'Manga');
  if (mangaValue !== undefined) {
    data.manga = mangaValue === 'Yes' || mangaValue === 'YesAndRightToLeft';
  }

  const pages = extractPages(xml);
  if (pages !== undefined) data.pages = pages;

  return data;
}

export async function extractComicInfo(archivePath: string): Promise<ComicInfoData | null> {
  const buffer = await extractArchiveEntry(archivePath, 'ComicInfo.xml');
  if (!buffer) return null;
  return parseComicInfoXml(buffer.toString('utf-8'));
}

export async function readComicInfoFile(filePath: string): Promise<ComicInfoData | null> {
  try {
    const xml = await readFile(filePath, 'utf-8');
    return parseComicInfoXml(xml);
  } catch {
    return null;
  }
}
