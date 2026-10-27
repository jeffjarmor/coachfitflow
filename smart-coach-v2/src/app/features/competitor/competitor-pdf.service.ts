import { DEFAULT_BRAND_COLOR } from '../../core/data/branding';
import { Injectable } from '@angular/core';
import { CoachProfile } from '../../core/data/coach-data.service';
import { CompetitorExerciseBlock, CompetitorSheet, CompetitorWorkout } from './competitor.models';

interface PdfHeader {
  brandColor: string;
  logoDataUrl: string | null;
  coachName: string;
  phone: string;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class CompetitorPdfService {
  async download(sheet: CompetitorSheet, coach: CoachProfile | null): Promise<void> {
    const [pdfMakeModule, pdfFontsModule] = await Promise.all([
      import('pdfmake/build/pdfmake'),
      import('pdfmake/build/vfs_fonts')
    ]);
    const pdfMake = (pdfMakeModule as any).default || pdfMakeModule;
    const pdfFonts = (pdfFontsModule as any).default || pdfFontsModule;
    const virtualFiles = pdfFonts.pdfMake?.vfs || pdfFonts.vfs || pdfFonts;
    if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(virtualFiles);
    else pdfMake.vfs = virtualFiles;

    const header: PdfHeader = {
      brandColor: coach?.brandColor || DEFAULT_BRAND_COLOR,
      logoDataUrl: coach?.logoUrl ? await this.imageDataUrl(coach.logoUrl) : null,
      coachName: coach?.name || 'Entrenador',
      phone: coach?.phone || '',
      email: coach?.email || ''
    };
    const content: any[] = [...this.controlPage(sheet, header)];
    if (sheet.workouts.length) content.push({ text: '', pageBreak: 'after' });

    sheet.workouts.forEach((workout, workoutIndex) => {
      const chunks = this.chunk(workout.blocks, 4);
      chunks.forEach((blocks, chunkIndex) => {
        content.push(...this.trainingPage(workout, blocks, header, sheet.programTitle));
        const isLast = workoutIndex === sheet.workouts.length - 1 && chunkIndex === chunks.length - 1;
        if (!isLast) content.push({ text: '', pageBreak: 'after' });
      });
    });

    const definition: any = {
      pageSize: 'A4',
      pageMargins: [22, 18, 22, 22],
      content,
      defaultStyle: { font: 'Roboto', fontSize: 8, color: '#141a14' },
      styles: {
        sectionTitle: { fontSize: 12, bold: true },
        small: { fontSize: 8 },
        rowTitle: { fontSize: 8, bold: true }
      }
    };

    const blob = await new Promise<Blob>((resolve) => pdfMake.createPdf(definition).getBlob(resolve));
    this.downloadBlob(blob, `${this.safeFileName(sheet.clientName)}_competidor.pdf`);
  }

  private controlPage(sheet: CompetitorSheet, header: PdfHeader): any[] {
    const content: any[] = [
      ...this.header(header, sheet.programTitle),
      { text: sheet.mesocycleTitle, style: 'sectionTitle', margin: [0, 8, 0, 8] },
      {
        table: {
          widths: [150, '*'],
          body: [
            [{ text: 'MACROCICLO', bold: true }, sheet.macrocycleTitle],
            [{ text: 'Frecuencia de entrenamiento', bold: true }, sheet.frequencyText],
            [{ text: 'División muscular', bold: true }, sheet.splitText],
            [{ text: 'Días de entrenamiento', bold: true }, sheet.trainingDaysText]
          ]
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 16]
      }
    ];

    if (sheet.weekPlans.length) {
      const headerRow = [
        { text: 'SEMANA', bold: true, fillColor: '#edf2e9' },
        ...sheet.dayLabels.map((day) => ({ text: day.toUpperCase(), bold: true, fillColor: '#edf2e9' }))
      ];
      content.push(
        { text: 'DISTRIBUCIÓN SEMANAL', style: 'sectionTitle', margin: [0, 0, 0, 8] },
        {
          table: {
            headerRows: 1,
            widths: ['auto', ...sheet.dayLabels.map(() => '*')],
            body: [
              headerRow,
              ...sheet.weekPlans.map((week) => [
                { text: week.weekLabel, bold: true },
                ...sheet.dayLabels.map((_day, index) => ({ text: week.workouts[index] || '' }))
              ])
            ]
          },
          layout: this.gridLayout('#c4cec0'),
          margin: [0, 0, 0, 16]
        }
      );
    }
    return content;
  }

  private trainingPage(workout: CompetitorWorkout, blocks: CompetitorExerciseBlock[], header: PdfHeader, programTitle: string): any[] {
    const fieldRow = (label: string, fillColor?: string) => [
      { text: label, fillColor }, ...Array.from({ length: 6 }, () => ({ text: '', fillColor }))
    ];
    const content: any[] = [
      ...this.header(header, programTitle),
      {
        table: {
          widths: [120, '*', 70],
          body: [[
            { text: workout.title, bold: true, fillColor: '#edf2e9' },
            { text: workout.subtitle, bold: true, fillColor: '#edf2e9', alignment: 'center' },
            { text: workout.code, bold: true, fillColor: '#edf2e9', alignment: 'center' }
          ]]
        },
        layout: 'noBorders',
        margin: [0, 6, 0, 6]
      },
      {
        table: {
          widths: [170, 56, 56, 56, 56, 56, 56],
          body: [
            fieldRow('Fecha'),
            fieldRow('Horas de sueño profundo'),
            fieldRow('Días de recuperación'),
            fieldRow('Condición psicológica'),
            fieldRow('1 óptima, 2 buena, 3 normal', '#f4f7f1'),
            fieldRow('4 negativa, 5 muy negativa', '#f4f7f1'),
            fieldRow('Hora inicio entrenamiento'),
            fieldRow('Hora final del entrenamiento'),
            fieldRow('Nutrición'),
            fieldRow('Cansancio pre entreno (1-10)')
          ]
        },
        layout: this.gridLayout('#899586'),
        margin: [0, 0, 0, 8]
      }
    ];
    blocks.forEach((block) => content.push(this.exerciseTable(block), { text: '', margin: [0, 3, 0, 0] }));
    return content;
  }

  private exerciseTable(block: CompetitorExerciseBlock): any {
    const nameCell: any = { stack: [{ text: block.name, bold: true }] };
    if (block.note) nameCell.stack.push({ text: block.note, color: '#b42318', fontSize: 7, margin: [0, 2, 0, 0] });
    const body: any[] = [
      [
        nameCell,
        { text: 'MICROCICLO 1', colSpan: 2, alignment: 'center', bold: true, fillColor: '#edf2e9' }, {},
        { text: 'MICROCICLO 2', colSpan: 2, alignment: 'center', bold: true, fillColor: '#edf2e9' }, {},
        { text: 'MICROCICLO 3', colSpan: 2, alignment: 'center', bold: true, fillColor: '#edf2e9' }, {}
      ],
      [
        { text: '' },
        { text: 'Series', bold: true, alignment: 'center' }, { text: 'Rep.', bold: true, alignment: 'center' },
        { text: 'Series', bold: true, alignment: 'center' }, { text: 'Rep.', bold: true, alignment: 'center' },
        { text: 'Series', bold: true, alignment: 'center' }, { text: 'Rep.', bold: true, alignment: 'center' }
      ],
      [
        { text: 'Prescripción', style: 'rowTitle', fillColor: '#f4f7f1' },
        ...block.microcycles.flatMap((microcycle) => [
          { text: microcycle.series, alignment: 'center', fillColor: '#f4f7f1' },
          { text: microcycle.reps, alignment: 'center', fillColor: '#f4f7f1' }
        ])
      ],
      ...['1ª serie', '2ª serie', '3ª serie', '4ª serie'].map((label) => [{ text: label }, '', '', '', '', '', '']),
      [
        { text: 'Pausa entre series', style: 'small' },
        { text: block.rest[0], alignment: 'center', fillColor: '#f4f7f1' }, '',
        { text: block.rest[1], alignment: 'center', fillColor: '#f4f7f1' }, '',
        { text: block.rest[2], alignment: 'center', fillColor: '#f4f7f1' }, ''
      ]
    ];
    return {
      table: { widths: [170, 56, 56, 56, 56, 56, 56], body },
      layout: this.gridLayout('#899586')
    };
  }

  private header(data: PdfHeader, title: string): any[] {
    const mark = data.logoDataUrl
      ? { image: data.logoDataUrl, fit: [62, 62] }
      : {
          table: { widths: [62], body: [[{ text: data.coachName.slice(0, 2).toUpperCase(), alignment: 'center', bold: true, margin: [0, 20, 0, 20] }]] },
          layout: { hLineColor: () => data.brandColor, vLineColor: () => data.brandColor, hLineWidth: () => 1, vLineWidth: () => 1 }
        };
    return [
      {
        columns: [
          { width: 70, stack: [mark] },
          { width: '*', stack: [
            { text: title || 'Preparación de competidor', bold: true, alignment: 'center', fontSize: 12 },
            { text: data.coachName, alignment: 'center', color: data.brandColor, margin: [0, 3, 0, 0] }
          ] },
          { width: 170, stack: [
            { text: data.phone || 'Sin teléfono', alignment: 'right' },
            { text: data.email || 'Sin correo', alignment: 'right' }
          ] }
        ],
        margin: [0, 0, 0, 4]
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 550, y2: 0, lineWidth: 2, lineColor: data.brandColor }], margin: [0, 0, 0, 4] }
    ];
  }

  private gridLayout(color: string): any {
    return { hLineWidth: () => .6, vLineWidth: () => .6, hLineColor: () => color, vLineColor: () => color };
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
    return chunks.length ? chunks : [[]];
  }

  private async imageDataUrl(url: string): Promise<string | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('No pudimos leer el logo.'));
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 100);
  }

  private safeFileName(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'atleta';
  }
}
