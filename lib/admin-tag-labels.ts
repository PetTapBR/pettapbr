import { randomInt } from "crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface LabelPdfItem {
  code: string;
  activationCode: string;
  siteDomain: string;
}

const DEFAULT_DOMAIN = "pettapbr.com.br";

export function sanitizeDomain(value: string | undefined) {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) {
    return DEFAULT_DOMAIN;
  }

  const withoutProtocol = raw.replace(/^https?:\/\//, "");
  const withoutPath = withoutProtocol.split("/")[0];
  const withoutQuery = withoutPath.split("?")[0];
  const withoutHash = withoutQuery.split("#")[0];
  const safeDomain = withoutHash.replace(/[^a-z0-9.-]/g, "").slice(0, 80);
  return safeDomain || DEFAULT_DOMAIN;
}

export function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const rounded = Math.floor(parsed);
  if (rounded < min) {
    return min;
  }
  if (rounded > max) {
    return max;
  }
  return rounded;
}

export function formatTagCode(sequence: number) {
  return `PTBR-NFC-${String(sequence).padStart(3, "0")}`;
}

function randomActivationBlock(length: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let output = "";

  for (let index = 0; index < length; index += 1) {
    output += alphabet[randomInt(0, alphabet.length)];
  }

  return output;
}

export function generateActivationCode() {
  return randomActivationBlock(6);
}

function drawLabelCard(
  page: PDFPage,
  label: LabelPdfItem,
  left: number,
  bottom: number,
  width: number,
  height: number,
  fonts: { regular: PDFFont; bold: PDFFont },
) {
  page.drawRectangle({
    x: left,
    y: bottom,
    width,
    height,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 1,
  });

  const title = "PetTapBR";
  const titleSize = 18;
  const titleWidth = fonts.bold.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: left + (width - titleWidth) / 2,
    y: bottom + height - 30,
    size: titleSize,
    font: fonts.bold,
    color: rgb(0.06, 0.58, 0.24),
  });

  page.drawText("Chave de Ativacao:", {
    x: left + 14,
    y: bottom + height - 58,
    size: 11,
    font: fonts.bold,
    color: rgb(0.22, 0.22, 0.22),
  });

  page.drawText(label.activationCode, {
    x: left + 14,
    y: bottom + height - 80,
    size: 13,
    font: fonts.bold,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawLine({
    start: { x: left + 12, y: bottom + height - 90 },
    end: { x: left + width - 12, y: bottom + height - 90 },
    thickness: 0.9,
    color: rgb(0.78, 0.78, 0.78),
  });

  page.drawText("Codigo NFC:", {
    x: left + 14,
    y: bottom + height - 114,
    size: 11,
    font: fonts.bold,
    color: rgb(0.22, 0.22, 0.22),
  });

  page.drawText(label.code, {
    x: left + 14,
    y: bottom + height - 136,
    size: 13,
    font: fonts.bold,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawLine({
    start: { x: left + 12, y: bottom + 22 },
    end: { x: left + width - 12, y: bottom + 22 },
    thickness: 0.8,
    color: rgb(0.82, 0.82, 0.82),
  });

  page.drawText(label.siteDomain, {
    x: left + 14,
    y: bottom + 8,
    size: 9.2,
    font: fonts.regular,
    color: rgb(0.18, 0.18, 0.18),
  });
}

export async function buildLabelsPdfBuffer(labels: LabelPdfItem[]) {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28; // A4
  const pageHeight = 841.89; // A4
  const marginX = 22;
  const marginY = 24;
  const gapX = 12;
  const gapY = 12;
  const columns = 2;
  const labelWidth = (pageWidth - marginX * 2 - gapX) / columns;
  const labelHeight = 170;
  const rowsPerPage = Math.max(1, Math.floor((pageHeight - marginY * 2 + gapY) / (labelHeight + gapY)));
  const labelsPerPage = rowsPerPage * columns;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);

  for (let index = 0; index < labels.length; index += 1) {
    if (index > 0 && index % labelsPerPage === 0) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
    }

    const slotIndex = index % labelsPerPage;
    const row = Math.floor(slotIndex / columns);
    const column = slotIndex % columns;

    const left = marginX + column * (labelWidth + gapX);
    const bottom =
      pageHeight - marginY - labelHeight - row * (labelHeight + gapY);

    drawLabelCard(page, labels[index], left, bottom, labelWidth, labelHeight, {
      regular,
      bold,
    });
  }

  return await pdfDoc.save();
}
