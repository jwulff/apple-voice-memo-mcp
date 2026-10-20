import { createRequire } from "module";

/**
 * The package version, read from package.json at runtime so the value the
 * server advertises over MCP can never drift from the version npm publishes.
 * createRequire keeps package.json out of the TypeScript rootDir; the
 * relative path resolves from both src/ and dist/.
 */
const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

export const VERSION: string = pkg.version;
