#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    input: path.resolve(process.cwd(), 'docs/migrations/firebase-exercises-export.json'),
    outDir: path.resolve(process.cwd(), 'docs/migrations/sql'),
    batchSize: 120
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--input') args.input = path.resolve(process.cwd(), argv[++i]);
    if (token === '--out-dir') args.outDir = path.resolve(process.cwd(), argv[++i]);
    if (token === '--batch-size') args.batchSize = Number(argv[++i]);
  }

  return args;
}

function sqlText(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function normalize(records) {
  const out = [];
  const seen = new Set();

  for (const r of records) {
    const name = String(r.name || '').trim();
    const muscleGroup = String(r.muscle_group || '').trim();
    if (!name || !muscleGroup) continue;

    const key = `${name.toLowerCase()}|${muscleGroup.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      name,
      muscle_group: muscleGroup,
      image_url: r.image_url || null,
      video_url: r.video_url || null,
      description: r.description || null,
      created_at: r.created_at || new Date().toISOString(),
      updated_at: r.updated_at || r.created_at || new Date().toISOString()
    });
  }

  return out;
}

function buildBatchSql(batch) {
  const values = batch
    .map(
      (r) =>
        `(${sqlText(r.name)}, ${sqlText(r.muscle_group)}, ${sqlText(r.image_url)}, ${sqlText(r.video_url)}, ${sqlText(r.description)}, ${sqlText(r.created_at)}, ${sqlText(r.updated_at)})`
    )
    .join(',\n');

  return `
with incoming(name, muscle_group, image_url, video_url, description, created_at, updated_at) as (
  values
  ${values}
)
insert into public.exercises (name, muscle_group, source, coach_id, image_url, video_url, description, created_at, updated_at)
select
  i.name,
  i.muscle_group,
  'global'::exercise_source,
  null,
  i.image_url,
  i.video_url,
  i.description,
  i.created_at::timestamptz,
  i.updated_at::timestamptz
from incoming i
where not exists (
  select 1
  from public.exercises e
  where lower(e.name) = lower(i.name)
    and lower(e.muscle_group) = lower(i.muscle_group)
    and e.source = 'global'
);
`.trim();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = JSON.parse(fs.readFileSync(args.input, 'utf8'));
  const normalized = normalize(raw.valid || []);
  fs.mkdirSync(args.outDir, { recursive: true });

  const manifest = {
    generated_at: new Date().toISOString(),
    source_file: args.input,
    total_input_valid: (raw.valid || []).length,
    total_unique_for_global_library: normalized.length,
    batch_size: args.batchSize,
    files: []
  };

  let index = 0;
  for (let i = 0; i < normalized.length; i += args.batchSize) {
    const batch = normalized.slice(i, i + args.batchSize);
    index += 1;
    const fileName = `exercises_import_batch_${String(index).padStart(2, '0')}.sql`;
    const filePath = path.join(args.outDir, fileName);
    fs.writeFileSync(filePath, `${buildBatchSql(batch)}\n`, 'utf8');
    manifest.files.push({
      file: filePath,
      rows: batch.length
    });
  }

  const manifestPath = path.join(args.outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`SQL generado en ${args.outDir}`);
  console.log(`Total único para biblioteca global: ${normalized.length}`);
  console.log(`Batches: ${manifest.files.length}`);
}

main();

