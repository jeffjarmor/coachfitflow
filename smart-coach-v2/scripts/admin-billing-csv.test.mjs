import test from 'node:test';
import assert from 'node:assert/strict';
import { adminBillingCsv, csvField } from '../src/app/features/admin/admin-billing-csv.ts';

test('CSV contains one clearly typed row per invoice and payout with audited semantics', () => {
  const csv = adminBillingCsv({
    movements: [{ id: 'inv-1', coachName: 'María', date: '2026-11-03T12:00:00Z', status: 'paid', amountMinor: 12345, currency: 'CRC', kind: 'subscription' }],
    settlements: [{ id: 'set-1', reference: 'payout-7', date: '2026-11-05T12:00:00Z', transactionCount: 2, grossMinor: 20000, feesMinor: 500, payoutFeeMinor: null, retentionsMinor: null, netMinor: 19500, status: 'paid' }]
  }, 'CRC');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /Factura registrada/);
  assert.match(csv, /Depósito confirmado/);
  assert.match(csv, /Factura registrada,2026-11-03,María,Pagada,inv-1,CRC/);
  assert.match(csv, /CRC,2,200\.00,5\.00,No disponible,No disponible,195\.00/);
  assert.doesNotMatch(csv, /123\.45,.*195\.00/);
});

test('CSV quotes delimiters and neutralizes spreadsheet formula input', () => {
  assert.equal(csvField('=HYPERLINK("https://bad.test")'), '"\'=HYPERLINK(""https://bad.test"")"');
  assert.equal(csvField('Coach, "One"'), '"Coach, ""One"""');
});

test('payout export uses local Costa Rica dates, selected currency, and ID when reference is absent', () => {
  const csv = adminBillingCsv({ movements: [], settlements: [{
    id: 'payout-id', reference: null, date: '2026-11-04T03:00:00Z', transactionCount: null,
    grossMinor: 12000, feesMinor: null, payoutFeeMinor: null, retentionsMinor: null, netMinor: 12000, status: 'paid'
  }] }, 'USD');
  assert.match(csv, /Depósito confirmado,2026-11-03,,Confirmado,payout-id,USD,No disponible,120\.00/);
});
