import { Injectable, inject } from '@angular/core';
import { RoutinePdfService } from '../routines/routine-pdf.service';
import { portalRoutineForPdf } from '../routines/routine-pdf.adapters';
import type { RoutinePdfContext } from '../routines/routine-pdf.models';
import { ClientPortalHistorySession, ClientPortalRoutineDetail } from './client-portal-data.service';

@Injectable({ providedIn: 'root' })
export class ClientPortalPdfService {
  private readonly routinePdf = inject(RoutinePdfService);

  async downloadRoutine(routine: ClientPortalRoutineDetail, context: RoutinePdfContext): Promise<void> {
    await this.routinePdf.downloadDocument(portalRoutineForPdf(routine), context);
  }

  async downloadHistory(sessions: ClientPortalHistorySession[], clientName: string, contextLabel: string): Promise<void> {
    const completed = sessions.filter(session => session.status === 'completed').length;
    const sets = sessions.flatMap(session => session.exercises.flatMap(exercise => exercise.sets));
    const content: any[] = [
      ...this.header('Historial de entrenamientos', clientName, contextLabel),
      { text: 'Resumen', style: 'section', margin: [0, 14, 0, 6] },
      this.summaryTable([
        ['Sesiones registradas', String(sessions.length)],
        ['Sesiones completadas', String(completed)],
        ['Series registradas', String(sets.length)],
        ['RIR promedio', this.averageRir(sets.map(set => set.rir))]
      ])
    ];

    sessions.forEach((session, index) => {
      content.push({
        text: this.date(session.sessionDate),
        style: 'section',
        margin: [0, index === 0 ? 18 : 16, 0, 2],
        pageBreak: index > 0 ? 'before' : undefined
      });
      content.push({ text: `${session.routineName} · ${session.dayName}`, bold: true, margin: [0, 0, 0, 2] });
      content.push({ text: session.status === 'completed' ? 'Completado' : 'En progreso', color: session.status === 'completed' ? '#476000' : '#7a5c00', margin: [0, 0, 0, 8] });
      if (!session.exercises.length) {
        content.push({ text: 'Esta sesión no tiene series registradas.', color: '#556056' });
        return;
      }
      for (const exercise of session.exercises) {
        content.push({ text: exercise.name, bold: true, margin: [0, 8, 0, 4] });
        content.push({
          table: {
            headerRows: 1,
            widths: [42, '*', '*', '*'],
            body: [
              this.tableHeader(['Serie', 'Reps', 'Carga', 'RIR']),
              ...exercise.sets.map(set => [
                { text: String(set.setNumber), alignment: 'center' },
                { text: set.actualReps == null ? '—' : String(set.actualReps), alignment: 'center' },
                { text: set.load == null ? '—' : `${this.number(set.load)} ${set.loadUnit}`, alignment: 'center' },
                { text: set.rir == null ? '—' : String(set.rir), alignment: 'center' }
              ])
            ]
          },
          layout: this.gridLayout()
        });
      }
    });
    await this.download(content, `${this.safeFileName(clientName)}_historial_entrenamientos.pdf`);
  }

  private async download(content: any[], fileName: string): Promise<void> {
    const [pdfMakeModule, pdfFontsModule] = await Promise.all([
      import('pdfmake/build/pdfmake'),
      import('pdfmake/build/vfs_fonts')
    ]);
    const pdfMake = (pdfMakeModule as any).default || pdfMakeModule;
    const pdfFonts = (pdfFontsModule as any).default || pdfFontsModule;
    const virtualFiles = pdfFonts.pdfMake?.vfs || pdfFonts.vfs || pdfFonts;
    if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(virtualFiles);
    else pdfMake.vfs = virtualFiles;
    const definition: any = {
      pageSize: 'A4',
      pageMargins: [36, 34, 36, 40],
      content,
      footer: (page: number, pages: number) => ({ text: `${page} / ${pages}`, alignment: 'right', margin: [0, 10, 36, 0], color: '#778078', fontSize: 8 }),
      defaultStyle: { font: 'Roboto', fontSize: 9, color: '#172017', lineHeight: 1.25 },
      styles: {
        title: { fontSize: 20, bold: true, color: '#172017' },
        section: { fontSize: 13, bold: true, color: '#172017' }
      }
    };
    const blob = await new Promise<Blob>(resolve => pdfMake.createPdf(definition).getBlob(resolve));
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

  private header(title: string, clientName: string, contextLabel: string): any[] {
    return [
      {
        columns: [
          { width: 42, text: 'Z', alignment: 'center', bold: true, fontSize: 20, color: '#d8ff45', fillColor: '#172017', margin: [0, 8, 0, 8] },
          { width: '*', stack: [{ text: title, bold: true, fontSize: 13 }, { text: clientName, color: '#556056', margin: [0, 2, 0, 0] }], margin: [10, 2, 0, 0] },
          { width: 140, stack: [{ text: 'Zummith', bold: true, alignment: 'right' }, { text: contextLabel, color: '#556056', alignment: 'right', margin: [0, 2, 0, 0] }] }
        ]
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 2, lineColor: '#a9d400' }], margin: [0, 8, 0, 0] }
    ];
  }

  private summaryTable(rows: string[][]): any {
    return {
      table: { widths: [150, '*'], body: rows.map(([label, value]) => [{ text: label, bold: true, fillColor: '#f2f5ef' }, value]) },
      layout: this.gridLayout()
    };
  }

  private tableHeader(labels: string[]): any[] {
    return labels.map(label => ({ text: label, bold: true, color: '#172017', fillColor: '#e9f4c4', alignment: label === 'Ejercicio' ? 'left' : 'center' }));
  }

  private gridLayout(): any {
    return { hLineWidth: () => .5, vLineWidth: () => .5, hLineColor: () => '#b9c1b8', vLineColor: () => '#b9c1b8', paddingTop: () => 5, paddingBottom: () => 5 };
  }

  private date(value: string | null): string {
    if (!value) return 'Sin fecha definida';
    const date = new Date(`${value.slice(0, 10)}T12:00:00`);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
      : 'Sin fecha definida';
  }

  private averageRir(values: Array<number | null>): string {
    const numbers = values.filter((value): value is number => value != null);
    return numbers.length ? this.number(numbers.reduce((total, value) => total + value, 0) / numbers.length) : 'Sin datos';
  }

  private number(value: number): string {
    return new Intl.NumberFormat('es-CR', { maximumFractionDigits: 1 }).format(value);
  }

  private safeFileName(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'cliente';
  }
}
