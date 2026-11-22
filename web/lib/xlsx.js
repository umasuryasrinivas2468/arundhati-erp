'use client';
import * as XLSX from 'xlsx';
import { toast } from '@/components/Toast';

/* Download rows as .xlsx (ported from ERP.ui.downloadXlsx). */
export function downloadXlsx(filename, headers, rows, sheet = 'Sheet1') {
  try {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(12, String(h).length + 4) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheet);
    XLSX.writeFile(wb, filename);
  } catch (e) {
    toast('Could not generate the Excel file', 'bad');
  }
}

/* Parse an uploaded workbook File -> array of row objects (first sheet, header row). */
export async function readSheet(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

export { XLSX };
