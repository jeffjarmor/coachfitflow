#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const CG_AUDIT = path.resolve(process.cwd(), 'docs/migrations/firebase-collection-group-audit.json');
const OUT = path.resolve(process.cwd(), 'docs/migrations/measurements-gap-analysis.json');

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function coachFromPath(docPath) {
  const m = docPath.match(/^coaches\/([^/]+)\/clients\/([^/]+)\/measurements\/([^/]+)$/);
  if (!m) return null;
  return { coachUid: m[1], clientDocId: m[2], measurementDocId: m[3] };
}

function main() {
  const cg = loadJson(CG_AUDIT);
  const measurements = cg.results.find((r) => r.collection_id === 'measurements');
  if (!measurements) throw new Error('measurements group not found in audit json');

  const paths = measurements.sample_paths || [];

  const sliceCache = new Map();
  const unresolved = [];
  const resolvedBySlice = [];

  for (const p of paths) {
    const parsed = coachFromPath(p);
    if (!parsed) {
      unresolved.push({ path: p, reason: 'unexpected_path_format' });
      continue;
    }

    const slicePath = path.resolve(
      process.cwd(),
      `docs/migrations/phase2-coach-slice-${parsed.coachUid}.json`
    );

    if (!fs.existsSync(slicePath)) {
      unresolved.push({ path: p, reason: 'missing_coach_slice', coach_uid: parsed.coachUid });
      continue;
    }

    let slice = sliceCache.get(slicePath);
    if (!slice) {
      slice = loadJson(slicePath);
      sliceCache.set(slicePath, slice);
    }

    const clients = Array.isArray(slice.clients) ? slice.clients : [];
    const clientExists = clients.some((c) => c.id === parsed.clientDocId);

    if (!clientExists) {
      unresolved.push({
        path: p,
        reason: 'orphan_measurement_missing_client_doc',
        coach_uid: parsed.coachUid,
        client_doc_id: parsed.clientDocId,
        measurement_doc_id: parsed.measurementDocId
      });
      continue;
    }

    const byClient = slice.measurements_by_client || {};
    const mList = Array.isArray(byClient[parsed.clientDocId]) ? byClient[parsed.clientDocId] : [];
    const measurementExists = mList.some((mm) => mm.id === parsed.measurementDocId);

    if (!measurementExists) {
      unresolved.push({
        path: p,
        reason: 'measurement_not_present_in_slice_measurements_by_client',
        coach_uid: parsed.coachUid,
        client_doc_id: parsed.clientDocId,
        measurement_doc_id: parsed.measurementDocId
      });
      continue;
    }

    resolvedBySlice.push({ path: p, coach_uid: parsed.coachUid, client_doc_id: parsed.clientDocId, measurement_doc_id: parsed.measurementDocId });
  }

  const out = {
    generated_at: new Date().toISOString(),
    source_collection_group_count: measurements.count,
    analyzed_paths_count: paths.length,
    resolved_in_phase2_slices: resolvedBySlice,
    unresolved,
    summary: {
      resolved_count: resolvedBySlice.length,
      unresolved_count: unresolved.length
    }
  };

  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`Saved gap analysis: ${OUT}`);
  console.log(JSON.stringify(out.summary));
}

main();
