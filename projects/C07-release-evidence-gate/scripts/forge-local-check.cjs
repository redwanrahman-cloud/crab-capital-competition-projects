// Forge's actual Node bundler requires a CommonJS executable entry (require.main).
// Keep that supported execution context while the project itself remains ESM.
import('./forge-local-check.mjs').catch(error=>{console.error(error);process.exitCode=1;});
