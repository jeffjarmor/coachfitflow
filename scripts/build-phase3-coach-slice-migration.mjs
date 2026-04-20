#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SLICE_PATH = path.resolve(
  process.cwd(),
  'docs/migrations/phase2-coach-slice-NgDQoQO0KyOr42bDUkDAGDFSZD52.json'
);

function parseArgs(argv) {
  const out = {
    slicePath: DEFAULT_SLICE_PATH,
    outputPath: '',
    phase: 'phase3_coach_slice_pilot'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--slice') out.slicePath = path.resolve(process.cwd(), argv[++i]);
    if (token === '--output') out.outputPath = path.resolve(process.cwd(), argv[++i]);
    if (token === '--phase') out.phase = argv[++i];
    if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return out;
}

function printHelp() {
  console.log(`
Uso:
  node scripts/build-phase3-coach-slice-migration.mjs [opciones]

Opciones:
  --slice <path>     Archivo JSON del slice (exportado de Firebase)
  --output <path>    Archivo SQL de salida
  --phase <name>     Nombre de phase para migration_runs
  --help, -h         Mostrar ayuda
`);
}

function sqlText(value) {
  if (value === null || value === undefined) return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlInt(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return String(fallback);
  const n = Number.parseInt(String(value), 10);
  if (Number.isNaN(n)) return String(fallback);
  return String(n);
}

function sqlNumeric(value) {
  if (value === null || value === undefined || value === '') return 'null';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'null';
  return String(n);
}

function sqlBool(value, fallback = false) {
  if (value === null || value === undefined) return fallback ? 'true' : 'false';
  return value ? 'true' : 'false';
}

function toIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toIsoTs(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function sqlTextArray(values) {
  if (!Array.isArray(values) || values.length === 0) return "'{}'::text[]";
  return `array[${values.map(sqlText).join(', ')}]::text[]`;
}

function normalizeSource(source) {
  return String(source || 'global').toLowerCase() === 'coach' ? 'coach' : 'global';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = fs.readFileSync(args.slicePath, 'utf8');
  const slice = JSON.parse(raw);

  const projectId = slice.firebase_project_id;
  const coachUid = slice.coach_uid;
  if (!projectId || !coachUid) {
    throw new Error('Slice inválido: faltan firebase_project_id o coach_uid');
  }

  const outputPath =
    args.outputPath ||
    path.resolve(
      process.cwd(),
      `docs/migrations/sql/phase3_coach_slice_${coachUid}.sql`
    );

  const clients = Array.isArray(slice.selected_clients) ? slice.selected_clients : [];
  const routines = Array.isArray(slice.selected_routines) ? slice.selected_routines : [];
  const daysByRoutine = slice.days_by_routine || {};
  const measurementsByClient = slice.measurements_by_client || {};
  const referencedExercises = Array.isArray(slice.referenced_exercises) ? slice.referenced_exercises : [];
  const totalMeasurements = Object.values(measurementsByClient).reduce(
    (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
    0
  );

  const exerciseById = new Map(referencedExercises.map((e) => [e.firebase_exercise_id, e]));
  const referencedIds = new Set();
  const fallbackExerciseById = new Map();

  for (const routine of routines) {
    const warmup = routine?.warmup;
    for (const cardio of warmup?.cardioExercises || []) {
      if (cardio?.exerciseId) {
        referencedIds.add(cardio.exerciseId);
        if (!exerciseById.has(cardio.exerciseId)) {
          fallbackExerciseById.set(cardio.exerciseId, {
            firebase_exercise_id: cardio.exerciseId,
            name: cardio.exerciseName || `Cardio ${cardio.exerciseId.slice(0, 6)}`,
            muscle_group: 'Cardio',
            source: 'global',
            video_url: null
          });
        }
      }
    }
    for (const day of daysByRoutine[routine.id] || []) {
      for (const ex of day?.exercises || []) {
        if (ex?.exerciseId) {
          referencedIds.add(ex.exerciseId);
          if (!exerciseById.has(ex.exerciseId)) {
            fallbackExerciseById.set(ex.exerciseId, {
              firebase_exercise_id: ex.exerciseId,
              name: ex.exerciseName || `Ejercicio ${ex.exerciseId.slice(0, 6)}`,
              muscle_group: ex.muscleGroup || 'General',
              source: normalizeSource(ex.exerciseSource),
              video_url: ex.videoUrl || null
            });
          }
        }
      }
    }
  }

  for (const [id, fallback] of fallbackExerciseById) {
    if (!exerciseById.has(id)) {
      exerciseById.set(id, fallback);
      referencedExercises.push(fallback);
    }
  }

  const lines = [];
  lines.push('-- Generated by scripts/build-phase3-coach-slice-migration.mjs');
  lines.push(`-- Source: ${path.relative(process.cwd(), args.slicePath)}`);
  lines.push(`-- Coach UID: ${coachUid}`);
  lines.push(`-- Generated at: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('do $$');
  lines.push('declare');
  lines.push('  v_run_id uuid := gen_random_uuid();');
  lines.push('begin');
  lines.push(
    `  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, ${sqlText(
      args.phase
    )}, 'running', ${sqlText(
      `coach_uid=${coachUid}; clients=${clients.length}; routines=${routines.length}; measurements=${totalMeasurements}`
    )});`
  );
  lines.push('');

  for (const ex of referencedExercises) {
    lines.push(
      `  perform public.migration_upsert_exercise(` +
        `${sqlText(projectId)}, ` +
        `${sqlText(coachUid)}, ` +
        `${sqlText(ex.firebase_exercise_id)}, ` +
        `${sqlText(ex.name || 'Ejercicio')}, ` +
        `${sqlText(ex.muscle_group || 'General')}, ` +
        `${sqlText(normalizeSource(ex.source))}, ` +
        `${sqlText(ex.video_url || null)}, ` +
        `null, ` +
        `v_run_id, ` +
        `jsonb_build_object('origin', 'phase2_slice')` +
      `);`
    );
  }

  lines.push('');

  for (const client of clients) {
    lines.push(
      `  perform public.migration_upsert_client(` +
        `${sqlText(projectId)}, ` +
        `${sqlText(coachUid)}, ` +
        `${sqlText(client.id)}, ` +
        `${sqlText(client.name || 'Cliente sin nombre')}, ` +
        `${sqlText(client.email || null)}, ` +
        `${sqlText(client.phone || null)}, ` +
        `${sqlText(toIsoDate(client.birthDate))}::date, ` +
        `${sqlInt(client.age, 0)}, ` +
        `${sqlNumeric(client.weight)}, ` +
        `${sqlNumeric(client.height)}, ` +
        `${sqlText(client.goal || '-')}, ` +
        `${sqlText(client.notes || null)}, ` +
        `${sqlText(client.address || null)}, ` +
        `${sqlText(toIsoTs(client.createdAt))}::timestamptz, ` +
        `v_run_id, ` +
        `jsonb_build_object('origin', 'phase2_slice')` +
      `);`
    );
  }

  lines.push('');

  for (const routine of routines) {
    lines.push(
      `  perform public.migration_upsert_routine(` +
        `${sqlText(projectId)}, ` +
        `${sqlText(coachUid)}, ` +
        `${sqlText(routine.id)}, ` +
        `${sqlText(routine.clientId)}, ` +
        `${sqlText(routine.name || 'Rutina')}, ` +
        `${sqlText(routine.objective || '-')}, ` +
        `${sqlInt(routine.trainingDaysCount, 0)}, ` +
        `${sqlInt(routine.durationWeeks, 1)}, ` +
        `${sqlText(toIsoDate(routine.startDate))}::date, ` +
        `${sqlText(toIsoDate(routine.endDate))}::date, ` +
        `${sqlText(routine.notes || null)}, ` +
        `${sqlBool(routine?.warmup?.enabled, false)}, ` +
        `${sqlText(routine?.warmup?.customText || null)}, ` +
        `${sqlText(toIsoTs(routine.createdAt))}::timestamptz, ` +
        `v_run_id, ` +
        `jsonb_build_object('origin', 'phase2_slice')` +
      `);`
    );

    const warmupExercises = routine?.warmup?.cardioExercises || [];
    for (let i = 0; i < warmupExercises.length; i += 1) {
      const warm = warmupExercises[i];
      const warmMeta = exerciseById.get(warm.exerciseId);
      lines.push(
        `  perform public.migration_upsert_routine_warmup_exercise(` +
          `${sqlText(projectId)}, ` +
          `${sqlText(coachUid)}, ` +
          `${sqlText(routine.id)}, ` +
          `${i}, ` +
          `${sqlText(warm.exerciseId)}, ` +
          `${sqlText(normalizeSource(warmMeta?.source))}, ` +
          `v_run_id, ` +
          `jsonb_build_object('origin', 'phase2_slice')` +
        `);`
      );
    }

    const days = Array.isArray(daysByRoutine[routine.id]) ? daysByRoutine[routine.id] : [];
    days.sort((a, b) => Number(a.dayNumber || 0) - Number(b.dayNumber || 0));

    for (const day of days) {
      lines.push(
        `  perform public.migration_upsert_routine_day(` +
          `${sqlText(projectId)}, ` +
          `${sqlText(coachUid)}, ` +
          `${sqlText(routine.id)}, ` +
          `${sqlText(day.id)}, ` +
          `${sqlInt(day.dayNumber, 1)}, ` +
          `${sqlText(day.dayName || `Día ${sqlInt(day.dayNumber, 1)}`)}, ` +
          `${sqlTextArray(day.muscleGroups)}, ` +
          `${sqlText(day.notes || null)}, ` +
          `v_run_id, ` +
          `jsonb_build_object('origin', 'phase2_slice')` +
        `);`
      );

      const exercises = Array.isArray(day.exercises) ? day.exercises : [];
      exercises.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

      for (const dayEx of exercises) {
        lines.push(
          `  perform public.migration_upsert_routine_day_exercise(` +
            `${sqlText(projectId)}, ` +
            `${sqlText(coachUid)}, ` +
            `${sqlText(routine.id)}, ` +
            `${sqlText(day.id)}, ` +
            `${sqlInt(dayEx.order, 0)}, ` +
            `${sqlText(dayEx.exerciseId)}, ` +
            `${sqlText(normalizeSource(dayEx.exerciseSource))}, ` +
            `${sqlInt(dayEx.sets, 1)}, ` +
            `${sqlText(dayEx.reps || '-')}, ` +
            `${sqlText(dayEx.rest || '-')}, ` +
            `${sqlText(dayEx.notes || null)}, ` +
            `${sqlBool(dayEx.isSuperset, false)}, ` +
            `${sqlText(dayEx.videoUrl || null)}, ` +
            `null, ` +
            `v_run_id, ` +
            `jsonb_build_object('origin', 'phase2_slice')` +
          `);`
        );
      }
    }

    lines.push('');
  }

  for (const client of clients) {
    const measurements = Array.isArray(measurementsByClient[client.id])
      ? measurementsByClient[client.id]
      : [];

    for (const measurement of measurements) {
      const weight = Number.isFinite(Number(measurement?.weight)) ? Number(measurement.weight) : 0;
      const height = Number.isFinite(Number(measurement?.height)) ? Number(measurement.height) : 0;
      const bmi =
        Number.isFinite(Number(measurement?.bmi))
          ? Number(measurement.bmi)
          : (weight > 0 && height > 0 ? weight / ((height / 100) ** 2) : 0);

      lines.push(
        `  perform public.migration_upsert_measurement(` +
          `${sqlText(projectId)}, ` +
          `${sqlText(coachUid)}, ` +
          `${sqlText(client.id)}, ` +
          `${sqlText(measurement.id)}, ` +
          `${sqlText(toIsoDate(measurement.date || measurement.createdAt))}::date, ` +
          `${sqlNumeric(weight)}, ` +
          `${sqlNumeric(height)}, ` +
          `${sqlNumeric(bmi)}, ` +
          `${sqlText(measurement.routineId || null)}, ` +
          `${sqlNumeric(measurement.bodyFatPercentage)}, ` +
          `${sqlNumeric(measurement.muscleMass)}, ` +
          `${sqlNumeric(measurement.visceralFat)}, ` +
          `${sqlNumeric(measurement.metabolicAge)}, ` +
          `${sqlNumeric(measurement.calories)}, ` +
          `${sqlNumeric(measurement.boneMass)}, ` +
          `${sqlNumeric(measurement.waterPercentage)}, ` +
          `${sqlNumeric(measurement.waist)}, ` +
          `${sqlNumeric(measurement.hips)}, ` +
          `${sqlNumeric(measurement.chest)}, ` +
          `${sqlNumeric(measurement.arms)}, ` +
          `${sqlNumeric(measurement.legs)}, ` +
          `${sqlNumeric(measurement.calf)}, ` +
          `${sqlNumeric(measurement.thigh)}, ` +
          `${sqlText(measurement.notes || null)}, ` +
          `${sqlText(toIsoTs(measurement.createdAt || measurement.date))}::timestamptz, ` +
          `v_run_id, ` +
          `jsonb_build_object('origin', 'phase2_slice')` +
        `);`
      );
    }
  }

  lines.push('');

  lines.push(
    `  update public.migration_runs set status = 'completed', finished_at = now() where id = v_run_id;`
  );
  lines.push('exception');
  lines.push('  when others then');
  lines.push(
    `    insert into public.migration_errors (` +
      `run_id, phase, entity_type, error_code, error_message, payload` +
    `) values (` +
      `v_run_id, ${sqlText(args.phase)}, 'vertical_slice', SQLSTATE, SQLERRM, jsonb_build_object('coach_uid', ${sqlText(
        coachUid
      )})` +
    `);`
  );
  lines.push(
    `    update public.migration_runs set status = 'failed', finished_at = now(), notes = coalesce(notes, '') || ' | ' || SQLERRM where id = v_run_id;`
  );
  lines.push('    raise;');
  lines.push('end $$;');
  lines.push('');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');

  console.log(`Slice SQL generated: ${outputPath}`);
  console.log(`Coach UID: ${coachUid}`);
  console.log(`Exercises: ${referencedExercises.length}`);
  console.log(`Clients: ${clients.length}`);
  console.log(`Routines: ${routines.length}`);
  console.log(`Measurements: ${totalMeasurements}`);
}

main();
