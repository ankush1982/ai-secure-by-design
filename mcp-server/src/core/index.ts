// Public library API of the sbd engine.
export { runCheck, result, type CheckOptions } from './check.js';
export { toSarif } from './sarif.js';
export { toText } from './report.js';
export { scanText, scanLines } from './scan.js';
export { stagedAdded, rangeAdded, parseUnifiedDiff } from './diff.js';
export { loadManifest, DEFAULT_MANIFEST } from './manifest.js';
export { listControls, explainControl, planScaffold } from './controls.js';
export { loadRegimes, loadRules } from './load.js';
export { confine } from './paths.js';
export { VERSION } from './version.js';
export * from './types.js';
