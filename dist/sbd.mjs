#!/usr/bin/env node
import { createRequire as __sbdCreateRequire } from 'node:module';
const require = __sbdCreateRequire(import.meta.url);
import {
  VERSION,
  applyDeploy,
  applyInit,
  confine,
  deployText,
  evidenceCsv,
  evidenceMarkdown,
  evidencePlan,
  evidenceText,
  explainControl,
  initText,
  listControls,
  loadManifest,
  planDeploy,
  planInit,
  planScaffold,
  result,
  runCheck,
  scanLines,
  scanText,
  severityAtLeast,
  stagedAdded,
  toSarif,
  toText
} from "./chunks/chunk-RCSRTFUE.mjs";
import "./chunks/chunk-6WPVGEWK.mjs";

// mcp-server/src/cli.ts
import { readFileSync, writeFileSync, writeSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
var USAGE = `sbd ${VERSION} \u2014 secure-by-design checks

Usage:
  sbd init      --non-interactive [--root DIR] [--manifest FILE] [--regime ID]...
                [--stack STACK] [--dry-run] [--format text|json]
  sbd deploy    [--root DIR] [--manifest FILE] [--stack STACK] [--dry-run] [--force]
                [--format text|json]
  sbd check     [--root DIR] [--manifest FILE] [--diff RANGE | --staged]
                [--format text|json|sarif] [--output FILE] [--fail-on LEVEL]
  sbd scan      [--staged | --stdin | FILE...] [--format ...] [--fail-on LEVEL]
  sbd validate  [--root DIR] [--manifest FILE] [--format text|json]
  sbd controls  [--regime ID]
  sbd explain   REGIME CONTROL
  sbd plan      [--root DIR] [--manifest FILE] [--stack STACK]
  sbd evidence  [--root DIR] [--manifest FILE] [--tier baseline|advanced]
                [--format text|json|markdown|csv] [--output FILE]
  sbd provenance COMMIT_MSG_FILE
  sbd hook claude-pretooluse     (reads Claude Code hook JSON on stdin)

LEVEL is critical|high|medium|low|info|none (default: high).
Exit codes: 0 clean, 1 findings at or above --fail-on, 2 error.

init writes a draft manifest with TODO(user): markers. It never classifies a field, lists
only the regimes you pass with --regime, and never overwrites an existing manifest.
deploy copies the required scaffolds. It leaves edited or user-authored files alone unless
--force is set, is safe to re-run, and exits 1 if a required scaffold could not be deployed.`;
var { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: "string", default: "." },
    manifest: { type: "string" },
    diff: { type: "string" },
    staged: { type: "boolean", default: false },
    stdin: { type: "boolean", default: false },
    format: { type: "string", default: "text" },
    output: { type: "string" },
    "fail-on": { type: "string", default: "high" },
    regime: { type: "string", multiple: true },
    stack: { type: "string" },
    tier: { type: "string" },
    "non-interactive": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
    version: { type: "boolean", short: "v", default: false }
  }
});
function fail(msg) {
  process.stderr.write(`sbd: ${msg}
`);
  process.exit(2);
}
function writeStdout(text) {
  const buf = Buffer.from(text);
  let off = 0;
  while (off < buf.length) {
    try {
      off += writeSync(1, buf, off);
    } catch (e) {
      const code = e.code;
      if (code === "EPIPE") return;
      if (code !== "EAGAIN") throw e;
    }
  }
}
function emit(text) {
  const out = text.endsWith("\n") ? text : `${text}
`;
  if (values.output) writeFileSync(values.output, out);
  else writeStdout(out);
}
function threshold() {
  const v = (values["fail-on"] ?? "high").toUpperCase();
  if (v === "NONE") return void 0;
  if (!["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].includes(v)) fail(`invalid --fail-on ${values["fail-on"]}`);
  return v;
}
function render(r) {
  switch (values.format) {
    case "json":
      emit(JSON.stringify(r, null, 2));
      break;
    case "sarif":
      emit(JSON.stringify(toSarif(r), null, 2));
      break;
    case "text":
      emit(toText(r));
      break;
    default:
      fail(`unknown --format ${values.format}`);
  }
}
function exitFor(findings) {
  const t = threshold();
  process.exit(t && findings.some((f) => severityAtLeast(f.severity, t)) ? 1 : 0);
}
function readStdin() {
  return readFileSync(0, "utf8");
}
function claudePreToolUse() {
  let input;
  try {
    input = JSON.parse(readStdin());
  } catch {
    process.exit(0);
  }
  const ti = input.tool_input ?? {};
  const texts = [];
  for (const k of ["content", "new_string"]) if (typeof ti[k] === "string") texts.push(ti[k]);
  if (Array.isArray(ti.edits)) {
    for (const e of ti.edits) if (typeof e.new_string === "string") texts.push(e.new_string);
  }
  const file = typeof ti.file_path === "string" ? ti.file_path : void 0;
  const findings = texts.flatMap((t) => scanText(t, file));
  if (findings.length === 0) process.exit(0);
  process.stderr.write(
    `[secure-by-design] BLOCKED: hardcoded secret or personal data in proposed edit.
` + findings.map((f) => `  - ${f.ruleId} ${f.title} (line ${f.line})`).join("\n") + `
Move secrets to environment variables or a secret manager, and use generated data in place of personal data. NIST SSDF PS.1.1.
`
  );
  process.exit(2);
}
function regimeArgs() {
  return (values.regime ?? []).flatMap((r) => r.split(",")).map((r) => r.trim()).filter(Boolean);
}
function planFormat() {
  if (values.format === "text" || values.format === "json") return values.format;
  fail(`unknown --format ${values.format}`);
}
var PROVENANCE = /\[(human|ai-human-pair|ai:[a-z0-9._-]+)\]|^AI-Assistance:\s*\S+/im;
function provenance(file) {
  if (!file) fail("provenance needs the commit message file");
  const msg = readFileSync(file, "utf8").split("\n").filter((l) => !l.startsWith("#")).join("\n");
  if (!PROVENANCE.test(msg)) {
    process.stderr.write(
      `[secure-by-design] commit blocked: missing authorship provenance tag.
Add one of [human], [ai-human-pair] or [ai:<model-id>] to the message,
or an "AI-Assistance: <tool>" trailer. NIST SSDF PS.3.1.
`
    );
    process.exit(1);
  }
  const header = msg.split("\n")[0] ?? "";
  if (header.length > 100) {
    process.stderr.write(`[secure-by-design] commit header is ${header.length} chars (> 100).
`);
    process.exit(1);
  }
  process.exit(0);
}
function main() {
  if (values.version) {
    process.stdout.write(`${VERSION}
`);
    return;
  }
  const [cmd, ...rest] = positionals;
  if (values.help || !cmd) {
    process.stdout.write(`${USAGE}
`);
    process.exit(cmd ? 0 : 2);
  }
  const root = resolve(values.root ?? ".");
  switch (cmd) {
    case "init": {
      if (!values["non-interactive"]) fail("sbd init needs --non-interactive; the interview runs through /sbd-init or the sbd-init MCP prompt");
      const format = planFormat();
      const dryRun = values["dry-run"] ?? false;
      const p = planInit({ root, manifestPath: values.manifest, regimes: regimeArgs(), stack: values.stack });
      if (!dryRun) applyInit(root, p);
      if (format === "json") emit(JSON.stringify({ ...p, dryRun }, null, 2));
      else emit(dryRun && p.draft ? `${p.draft}
---
${initText(p, true)}` : initText(p, dryRun));
      return;
    }
    case "deploy": {
      const format = planFormat();
      const rel = values.manifest ?? "privacy-security-manifest.yaml";
      const { manifest, findings } = loadManifest(confine(root, rel), rel);
      if (!manifest) {
        render(result(root, rel, void 0, findings));
        process.exit(1);
      }
      const dryRun = values["dry-run"] ?? false;
      const p = planDeploy(root, manifest, { stack: values.stack, force: values.force });
      const written = dryRun ? [] : applyDeploy(root, p);
      emit(format === "json" ? JSON.stringify({ ...p, dryRun, written }, null, 2) : deployText(p, dryRun));
      process.exit(p.summary.blocked ? 1 : 0);
    }
    case "check": {
      if (values.diff && values.staged) fail("use --diff or --staged, not both");
      const r = runCheck({ root, manifestPath: values.manifest, diff: values.diff, staged: values.staged });
      render(r);
      exitFor(r.findings);
    }
    case "scan": {
      let findings;
      if (values.staged) {
        findings = [...stagedAdded(root)].flatMap(([file, lines]) => scanLines(lines, file));
      } else if (values.stdin) {
        findings = scanText(readStdin(), "<stdin>");
      } else {
        if (rest.length === 0) fail("scan needs --staged, --stdin or files");
        findings = rest.flatMap((f) => scanText(readFileSync(confine(root, f), "utf8"), f));
      }
      render(result(root, "-", void 0, findings));
      exitFor(findings);
    }
    case "validate": {
      const rel = values.manifest ?? "privacy-security-manifest.yaml";
      const { findings } = loadManifest(confine(root, rel), rel);
      render(result(root, rel, void 0, findings));
      exitFor(findings);
    }
    case "controls": {
      const regimes = regimeArgs();
      if (regimes.length > 1) fail("controls takes one --regime");
      emit(JSON.stringify(listControls(regimes[0]), null, 2));
      return;
    }
    case "explain": {
      const [regime, control] = rest;
      if (!regime || !control) fail("explain needs REGIME CONTROL");
      const out = explainControl(regime, control);
      if (!out) fail(`unknown control ${regime}/${control}`);
      emit(JSON.stringify(out, null, 2));
      return;
    }
    case "plan": {
      const rel = values.manifest ?? "privacy-security-manifest.yaml";
      const { manifest, findings } = loadManifest(confine(root, rel), rel);
      if (!manifest) {
        render(result(root, rel, void 0, findings));
        process.exit(1);
      }
      emit(JSON.stringify(planScaffold(root, manifest, values.stack), null, 2));
      return;
    }
    case "evidence": {
      const p = evidencePlan({ root, manifestPath: values.manifest, tier: values.tier });
      const formats = {
        text: () => evidenceText(p),
        json: () => JSON.stringify(p, null, 2),
        markdown: () => evidenceMarkdown(p),
        csv: () => evidenceCsv(p)
      };
      const format = formats[values.format ?? "text"];
      if (!format) fail(`unknown --format ${values.format}`);
      emit(format());
      return;
    }
    case "provenance":
      provenance(rest[0]);
    case "hook":
      if (rest[0] === "claude-pretooluse") claudePreToolUse();
      fail(`unknown hook ${rest[0] ?? ""}`);
    default:
      fail(`unknown command ${cmd}

${USAGE}`);
  }
}
try {
  main();
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
