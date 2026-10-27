import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

export const ORIGINAL_PROJECT_ID = 'bzhqprxolseyxuuwodqs';
const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptRoot, '..');
const repoRoot = path.resolve(appRoot, '..');

// This module intentionally has no Supabase client, network or child process.
// It checks source against a reviewed, metadata-only production snapshot.
export function extractRpcCalls(source, filename = 'source.ts') {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const calls = [];
  const literal = node => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
  const keyName = node => ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)
    ? node.text : ts.isComputedPropertyName(node) ? literal(node.expression) : null;
  const visit = node => {
    const rpcAccess = ts.isCallExpression(node) && (
      (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'rpc') ||
      (ts.isElementAccessExpression(node.expression) && literal(node.expression.argumentExpression) === 'rpc')
    );
    if (rpcAccess) {
      const position = tree.getLineAndCharacterOfPosition(node.getStart(tree));
      const call = { file: filename, line: position.line + 1, name: literal(node.arguments[0]), arguments: [], schema: 'public' };
      let receiver = node.expression.expression;
      while (ts.isCallExpression(receiver) && ts.isPropertyAccessExpression(receiver.expression)) {
        if (receiver.expression.name.text === 'schema') call.schema = literal(receiver.arguments[0]);
        receiver = receiver.expression.expression;
      }
      const args = node.arguments[1];
      if (args && !(ts.isIdentifier(args) && args.text === 'undefined')) {
        if (ts.isObjectLiteralExpression(args)) {
          for (const property of args.properties) {
            const key = property.name && keyName(property.name);
            if (!key || ts.isSpreadAssignment(property)) { call.arguments = null; break; }
            call.arguments.push(key);
          }
          if (call.arguments) call.arguments = [...new Set(call.arguments)].sort();
        } else call.arguments = null;
      }
      calls.push(call);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return calls;
}

export function extractStorageCalls(source, filename = 'source.ts') {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const constants = new Map(), fields = new Map(), calls = [];
  const collect = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) constants.set(node.name.text, node.initializer);
    if (ts.isPropertyDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.initializer) fields.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  };
  collect(tree);
  const resolve = (node, seen = new Set()) => {
    if (!node) return null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return resolve(node.expression, seen);
    if (ts.isConditionalExpression(node)) {
      const yes = resolve(node.whenTrue, new Set(seen)), no = resolve(node.whenFalse, new Set(seen));
      return yes && no ? [...new Set([...yes, ...no])] : null;
    }
    let name, definition;
    if (ts.isIdentifier(node)) { name = node.text; definition = constants.get(name); }
    else if (ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword) {
      name = `this.${node.name.text}`; definition = fields.get(node.name.text);
    }
    if (!definition || seen.has(name)) return null;
    seen.add(name);
    return resolve(definition, seen);
  };
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'from' &&
      ts.isPropertyAccessExpression(node.expression.expression) && node.expression.expression.name.text === 'storage') {
      calls.push({ file: filename, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, buckets: resolve(node.arguments[0]) });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return calls;
}

export async function collectRpcCalls(sourceRoot, base = repoRoot) {
  const calls = [];
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(filename);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        calls.push(...extractRpcCalls(await readFile(filename, 'utf8'), path.relative(base, filename)));
      }
    }
  }
  await walk(sourceRoot);
  return calls;
}

export async function collectStorageCalls(sourceRoot, base = repoRoot) {
  const calls = [];
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(filename);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        calls.push(...extractStorageCalls(await readFile(filename, 'utf8'), path.relative(base, filename)));
      }
    }
  }
  await walk(sourceRoot);
  return calls;
}

export function checkStorageContract(calls, snapshot) {
  const buckets = new Set((snapshot.buckets ?? []).map(item => item.id));
  return calls.flatMap(call => {
    if (!call.buckets) return [{ ...call, reason: 'Storage bucket cannot be verified statically' }];
    const missing = call.buckets.filter(bucket => !buckets.has(bucket));
    return missing.length ? [{ ...call, reason: `Storage buckets [${missing.join(', ')}] are absent from the original production backend` }] : [];
  });
}

export function splitSqlArguments(signature) {
  const parts = [];
  let start = 0, quote = null, depth = 0;
  for (let index = 0; index < signature.length; index += 1) {
    const char = signature[index];
    if (quote) {
      if (char === quote) {
        if (signature[index + 1] === quote) index += 1;
        else quote = null;
      }
    } else if (char === "'" || char === '"') quote = char;
    else if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (char === ',' && depth === 0) { parts.push(signature.slice(start, index).trim()); start = index + 1; }
  }
  const final = signature.slice(start).trim();
  if (final) parts.push(final);
  return parts;
}

export function inputArguments(signature) {
  return splitSqlArguments(signature).flatMap(argument => {
    if (/^OUT\s/i.test(argument)) return [];
    const input = argument.replace(/^(?:INOUT|IN|VARIADIC)\s+/i, '');
    const name = input.match(/^("(?:[^"]|"")+"|[a-zA-Z_][a-zA-Z0-9_]*)\s+/)?.[1];
    if (!name) throw new Error(`Unsupported unnamed RPC argument in metadata: ${argument}`);
    return [{ name: name.replace(/^"|"$/g, '').replaceAll('""', '"'), required: !/\sDEFAULT\s/i.test(input) }];
  });
}

export function checkRpcContract(calls, snapshot) {
  if (snapshot.projectId !== ORIGINAL_PROJECT_ID) throw new Error('The snapshot must describe the original production project.');
  if (snapshot.migrations?.length !== 60 || snapshot.migrations.some(item => item.version > '20260923170000')) {
    throw new Error('The original backend contract must contain the 60 reviewed migrations, without the 18 pending migrations.');
  }
  const problems = [];
  for (const call of calls) {
    const location = `${call.file}:${call.line}`;
    if (!call.name || call.schema !== 'public') {
      problems.push({ ...call, reason: `Unresolved RPC name or unsupported schema at ${location}` });
      continue;
    }
    const definitions = snapshot.functions.filter(item => item.name === call.name && (item.schema ?? 'public') === call.schema);
    if (!definitions.length) {
      problems.push({ ...call, reason: `${call.name} is absent from the original production backend` });
      continue;
    }
    if (call.arguments === null) {
      problems.push({ ...call, reason: `Arguments for ${call.name} cannot be verified statically` });
      continue;
    }
    const matching = definitions.filter(definition => {
      const accepted = inputArguments(definition.arguments);
      return call.arguments.every(key => accepted.some(item => item.name === key)) &&
        accepted.filter(item => item.required).every(item => call.arguments.includes(item.name));
    });
    if (!matching.length) {
      problems.push({ ...call, reason: `${call.name} arguments [${call.arguments.join(', ')}] do not match a production signature` });
    } else if (!matching.some(item => item.executableByAuthenticated === true)) {
      problems.push({ ...call, reason: `${call.name} is not confirmed executable by authenticated users` });
    }
  }
  return problems;
}

export function compareApplications(v2Calls, originalCalls) {
  const names = calls => [...new Set(calls.map(call => call.name).filter(Boolean))].sort();
  const v2 = names(v2Calls), original = names(originalCalls);
  return { v2, original, shared: v2.filter(name => original.includes(name)), onlyV2: v2.filter(name => !original.includes(name)), onlyOriginal: original.filter(name => !v2.includes(name)) };
}

async function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const positional = argv.filter(arg => arg !== '--json');
  if (positional.length > 1 || positional.some(arg => arg.startsWith('--'))) {
    throw new Error('Usage: node scripts/original-backend-contract-check.mjs [metadata-snapshot.json] [--json]');
  }
  const snapshotPath = positional[0] ? path.resolve(positional[0]) : path.join(scriptRoot, 'contracts/original-backend-contract.json');
  const [snapshot, v2Calls, originalCalls, v2StorageCalls, originalStorageCalls] = await Promise.all([
    readFile(snapshotPath, 'utf8').then(JSON.parse),
    collectRpcCalls(path.join(appRoot, 'src')),
    collectRpcCalls(path.join(repoRoot, 'smart-coach/src')),
    collectStorageCalls(path.join(appRoot, 'src')),
    collectStorageCalls(path.join(repoRoot, 'smart-coach/src'))
  ]);
  const problems = [...checkRpcContract(v2Calls, snapshot), ...checkStorageContract(v2StorageCalls, snapshot)];
  const originalProblems = [...checkRpcContract(originalCalls, snapshot), ...checkStorageContract(originalStorageCalls, snapshot)];
  const report = {
    projectId: snapshot.projectId,
    reviewedAt: snapshot.reviewedAt,
    offline: true,
    comparison: compareApplications(v2Calls, originalCalls),
    v2CallCount: v2Calls.length,
    originalCallCount: originalCalls.length,
    v2Calls,
    originalCalls,
    v2StorageCalls,
    originalStorageCalls,
    problems,
    originalProblems
  };
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Original production RPC contract (${snapshot.reviewedAt}): ${v2Calls.length} V2 calls, ${report.comparison.v2.length} functions; ${problems.length} incompatibilities.`);
    console.log(`Original reference: ${originalCalls.length} calls, ${report.comparison.original.length} functions; ${originalProblems.length} incompatibilities.`);
    for (const problem of problems) console.error(`${problem.file}:${problem.line}: ${problem.reason}`);
    console.log('Offline metadata check only: no network, credentials, database changes or permission changes. Row access and operation behavior require integration tests against the isolated original schema.');
  }
  if (problems.length || originalProblems.length) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
