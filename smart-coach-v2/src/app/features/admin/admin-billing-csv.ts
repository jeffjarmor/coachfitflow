import type { AdminBillingMovement, AdminBillingSettlement } from './admin-billing-data.service';

type CsvRecord = AdminBillingMovement | AdminBillingSettlement;
type Currency = 'USD' | 'CRC';

const columns = [
  'Tipo de registro', 'Fecha (hora de Costa Rica)', 'Entrenador', 'Estado', 'Referencia ONVO', 'Moneda',
  'Transacciones', 'Monto bruto', 'Comisiones', 'Tarifa de depósito', 'Retenciones', 'Neto', 'Concepto'
];

function amount(minor: number | null): string {
  return minor == null ? 'No disponible' : (minor / 100).toFixed(2);
}

function localDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}-${parts.find((part) => part.type === 'day')?.value}`;
}

function movementStatus(value: string): string {
  switch (value) {
    case 'paid': return 'Pagada';
    case 'pending': return 'Pendiente';
    case 'failed': return 'Fallida';
    default: return 'Registrada';
  }
}

export function csvField(value: string | number | null | undefined): string {
  let text = value == null ? '' : String(value);
  if (/^[\s\u0000-\u001f]*[=+@\-]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function adminBillingCsv(data: { movements: readonly AdminBillingMovement[]; settlements: readonly AdminBillingSettlement[] }, currency: Currency): string {
  const rows: CsvRecord[] = [...data.movements, ...data.settlements];
  const serialized = rows.map((row) => {
    const movement = 'kind' in row;
    const cells = movement
      ? ['Factura registrada', localDate(row.date), row.coachName, movementStatus(row.status), row.id, row.currency, '', amount(row.amountMinor), '', '', '', '', row.kind === 'subscription' ? 'Suscripción inicial' : 'Renovación']
      : ['Depósito confirmado', localDate(row.date), '', 'Confirmado', row.reference || row.id, currency, row.transactionCount ?? 'No disponible', amount(row.grossMinor), amount(row.feesMinor), amount(row.payoutFeeMinor), amount(row.retentionsMinor), amount(row.netMinor), 'Liquidación de fondos'];
    return cells.map(csvField).join(',');
  });
  return `\uFEFF${[columns.map(csvField).join(','), ...serialized].join('\r\n')}\r\n`;
}
