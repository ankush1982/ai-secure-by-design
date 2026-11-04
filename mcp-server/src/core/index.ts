// Public library API of the sbd engine.
export { runCheck, result, type CheckOptions } from './check.js';
export { toSarif } from './sarif.js';
export { toText } from './report.js';
export { scanText, scanLines } from './scan.js';
export { stagedAdded, rangeAdded, parseUnifiedDiff } from './diff.js';
export { loadManifest, DEFAULT_MANIFEST } from './manifest.js';
export { listControls, explainControl, planScaffold, resolveStack } from './controls.js';
export { applyDeploy, deployText, planDeploy, type DeployPlan } from './deploy.js';
export { applyInit, initText, planInit, type InitPlan } from './init.js';
export { detectStack } from './stack.js';
export { evidencePlan, evidenceCsv, evidenceMarkdown, evidenceText, type EvidencePlan } from './evidence.js';
export { loadRegimes, loadRules } from './load.js';
export { confine } from './paths.js';
export { VERSION } from './version.js';
export * from './types.js';
