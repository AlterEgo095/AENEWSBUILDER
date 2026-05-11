/**
 * Unit tests for SecurityEngine (security-engine.ts)
 *
 * Validates that the code scanner correctly:
 * - Detects critical, high, medium, and low severity vulnerabilities
 * - Computes scores and pass/fail status
 * - Skips binary / non-scannable files
 * - Aggregates project-level results
 * - Applies custom passThreshold
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the logger to prevent side effects during tests
vi.mock('../../config/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { SecurityEngine } from '../security-engine.js';
import type { SecurityScanResult, ProjectScanResult, Vulnerability } from '../security-engine.js';

describe('SecurityEngine', () => {
  let engine: SecurityEngine;

  beforeEach(() => {
    // Fresh engine with default rules for each test
    engine = new SecurityEngine();
  });

  // ────────────────────────────────────────────
  // Clean code (no vulnerabilities)
  // ────────────────────────────────────────────

  describe('clean code', () => {
    it('should return score 100 and passed=true for clean code', async () => {
      const result = await engine.scanFile('src/index.ts', `
import express from 'express';
const app = express();
app.listen(3000);
`);

      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
      expect(result.vulnerabilities).toHaveLength(0);
      expect(result.lineCount).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────
  // SEC001: eval() usage
  // ────────────────────────────────────────────

  describe('SEC001 - eval()', () => {
    it('should detect eval() as critical vulnerability with score=0', async () => {
      const code = 'const result = eval(userInput);';
      const result = await engine.scanFile('src/dangerous.ts', code);

      // Fatal rules (like eval) set score to 0
      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC001'));
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe('critical');
      expect(vuln!.line).toBe(1);
    });
  });

  // ────────────────────────────────────────────
  // SEC002: new Function()
  // ────────────────────────────────────────────

  describe('SEC002 - new Function()', () => {
    it('should detect new Function() as critical vulnerability with score=0', async () => {
      const code = 'const fn = new Function("return " + input);';
      const result = await engine.scanFile('src/dynamic.ts', code);

      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC002'));
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe('critical');
    });
  });

  // ────────────────────────────────────────────
  // SEC005: Hardcoded API key
  // ────────────────────────────────────────────

  describe('SEC005 - hardcoded API key', () => {
    it('should detect hardcoded API key like api_key: "sk-abc12345"', async () => {
      const code = 'const config = { api_key: "sk-abc12345" };';
      const result = await engine.scanFile('src/config.ts', code);

      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC005'));
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe('critical');
    });
  });

  // ────────────────────────────────────────────
  // SEC006: Hardcoded password
  // ────────────────────────────────────────────

  describe('SEC006 - hardcoded password', () => {
    it('should detect hardcoded password like password: "secret123"', async () => {
      const code = 'const creds = { password: "secret123" };';
      const result = await engine.scanFile('src/auth.ts', code);

      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC006'));
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe('critical');
    });

    it('should detect hardcoded secret variable', async () => {
      const code = 'const secret = "my-super-secret-value-123";';
      const result = await engine.scanFile('src/secrets.ts', code);

      expect(result.score).toBe(0);
      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC006'));
      expect(vuln).toBeDefined();
    });
  });

  // ────────────────────────────────────────────
  // SEC017: console.log()
  // ────────────────────────────────────────────

  describe('SEC017 - console.log()', () => {
    it('should detect console.log() as medium severity', async () => {
      const code = `
function handler() {
  console.log('debugging stuff');
  return true;
}
`;
      const result = await engine.scanFile('src/handler.ts', code);

      expect(result.passed).toBe(true); // 5 penalty, score = 95 >= 70

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC017'));
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe('medium');
    });

    it('should detect console.error() as medium severity', async () => {
      const code = 'console.error("something went wrong");';
      const result = await engine.scanFile('src/log.ts', code);

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC017'));
      expect(vuln).toBeDefined();
    });
  });

  // ────────────────────────────────────────────
  // SEC013: Path traversal with template literal
  // ────────────────────────────────────────────

  describe('SEC013 - path traversal template', () => {
    it('should detect path traversal with template literal in readFile', async () => {
      const code = "const data = fs.readFile(`/uploads/${filename}`, 'utf8');";
      const result = await engine.scanFile('src/files.ts', code);

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC013'));
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe('high');
    });

    it('should detect path traversal with template literal in createReadStream', async () => {
      const code = "fs.createReadStream(`/public/${userFile}`)";
      const result = await engine.scanFile('src/stream.ts', code);

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC013'));
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe('high');
    });
  });

  // ────────────────────────────────────────────
  // SEC021: CORS wildcard
  // ────────────────────────────────────────────

  describe('SEC021 - CORS wildcard', () => {
    it('should detect CORS wildcard Access-Control-Allow-Origin: "*"', async () => {
      // The SEC021 pattern matches: Access-Control-Allow-Origin or origin followed by : or = then "*"
      const code = 'Access-Control-Allow-Origin: "*"';
      const result = await engine.scanFile('src/cors.ts', code);

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC021'));
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe('medium');
    });

    it('should detect origin: "*" in cors config', async () => {
      const code = 'const corsOptions = { origin: "*" };';
      const result = await engine.scanFile('src/server.ts', code);

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC021'));
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe('medium');
    });
  });

  // ────────────────────────────────────────────
  // Binary files are skipped
  // ────────────────────────────────────────────

  describe('binary files', () => {
    it('should skip .png files and return score=100', async () => {
      const result = await engine.scanFile('images/logo.png', '<binary data>');
      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
      expect(result.vulnerabilities).toHaveLength(0);
      expect(result.lineCount).toBe(0);
    });

    it('should skip .jpg files and return score=100', async () => {
      const result = await engine.scanFile('assets/photo.jpg', '<binary data>');
      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
      expect(result.vulnerabilities).toHaveLength(0);
    });

    it('should skip .svg files', async () => {
      const result = await engine.scanFile('assets/icon.svg', '<svg></svg>');
      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
    });
  });

  // ────────────────────────────────────────────
  // Multiple vulnerabilities compound penalties
  // ────────────────────────────────────────────

  describe('multiple vulnerabilities', () => {
    it('should compound penalties from multiple medium/low findings', async () => {
      const code = `
// TODO: fix this later
const data: any = fetch('/api');
console.log(data);
// eslint-disable
`;
      const result = await engine.scanFile('src/messy.ts', code);

      // TODO (3) + any-type (2) + console.log (5) + eslint-disable (2) = 12 total penalty
      // Score = 100 - 12 = 88 (non-fatal, so no zeroing)
      expect(result.score).toBeLessThan(100);
      expect(result.score).toBeGreaterThan(0);
      expect(result.vulnerabilities.length).toBeGreaterThanOrEqual(3);
    });

    it('should cap score at 0 when fatal vulnerability is present alongside others', async () => {
      const code = `
eval("alert(" + x + ")");
console.log("debugging");
`;
      const result = await engine.scanFile('src/bad.ts', code);

      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
      // Should still report all vulnerabilities
      expect(result.vulnerabilities.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ────────────────────────────────────────────
  // scanProject aggregation
  // ────────────────────────────────────────────

  describe('scanProject', () => {
    it('should aggregate results across multiple files', async () => {
      const files = {
        'src/clean.ts': 'const x = 1;\nconst y = 2;',
        'src/eval.ts': 'eval("code");',
        'src/logo.png': '<binary>',
      };

      const result: ProjectScanResult = await engine.scanProject(files);

      expect(result.fileCount).toBe(3);
      expect(result.files).toHaveLength(3);

      // eval.ts should have critical vulns → summary.critical > 0
      expect(result.summary.critical).toBeGreaterThan(0);

      // Project should fail because there's a critical vulnerability
      expect(result.passed).toBe(false);

      // totalScore is average of all files (including binary at 100)
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
    });

    it('should pass when all files are clean', async () => {
      const files = {
        'src/a.ts': 'const a = 1;',
        'src/b.ts': 'const b = 2;',
        'src/c.ts': 'const c = 3;',
      };

      const result = await engine.scanProject(files);

      expect(result.passed).toBe(true);
      expect(result.totalScore).toBe(100);
      expect(result.summary.critical).toBe(0);
      expect(result.summary.high).toBe(0);
      expect(result.summary.medium).toBe(0);
      expect(result.summary.low).toBe(0);
    });

    it('should handle empty files object', async () => {
      const result = await engine.scanProject({});

      expect(result.fileCount).toBe(0);
      expect(result.totalScore).toBe(100);
      expect(result.passed).toBe(true);
      expect(result.files).toHaveLength(0);
    });
  });

  // ────────────────────────────────────────────
  // Custom passThreshold
  // ────────────────────────────────────────────

  describe('custom passThreshold', () => {
    it('should use custom passThreshold from constructor', async () => {
      // With threshold=50, a file with only console.log (penalty 5, score 95) should pass
      const strictEngine = new SecurityEngine({ passThreshold: 95 });
      const result = await strictEngine.scanFile('src/log.ts', 'console.log("hello");');

      // Score is 95, threshold is 95, so 95 >= 95 → passed
      expect(result.passed).toBe(true);
    });

    it('should fail when score is below custom threshold', async () => {
      // With threshold=99, a file with console.log (score 95) should fail
      const strictEngine = new SecurityEngine({ passThreshold: 99 });
      const result = await strictEngine.scanFile('src/log.ts', 'console.log("hello");');

      expect(result.score).toBe(95);
      expect(result.passed).toBe(false);
    });

    it('should use threshold=50 to allow medium-penalty files', async () => {
      // Multiple console.log, any-type, TODO = 12 penalty, score 88
      // With threshold 50, this should easily pass
      const lenientEngine = new SecurityEngine({ passThreshold: 50 });
      const code = `
// TODO: refactor this
const data: any = "value";
console.log(data);
`;
      const result = await lenientEngine.scanFile('src/lenient.ts', code);

      expect(result.passed).toBe(true);
    });
  });

  // ────────────────────────────────────────────
  // SEC026: File complexity (>300 lines)
  // ────────────────────────────────────────────

  describe('SEC026 - overly complex file', () => {
    it('should flag files exceeding 300 lines for complexity (SEC026)', async () => {
      // Generate a file with 301 lines of clean code
      const lines = Array.from({ length: 301 }, (_, i) => `const line${i} = ${i};`);
      const code = lines.join('\n');

      const result = await engine.scanFile('src/huge.ts', code);

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC026'));
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe('low');
      expect(vuln!.line).toBe(301);
      expect(vuln!.message).toContain('301');
    });

    it('should not flag files with exactly 300 lines', async () => {
      const lines = Array.from({ length: 300 }, (_, i) => `const line${i} = ${i};`);
      const code = lines.join('\n');

      const result = await engine.scanFile('src/boundary.ts', code);

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC026'));
      expect(vuln).toBeUndefined();
    });

    it('should not flag non-code files for complexity even if >300 lines', async () => {
      // JSON files should not be flagged for complexity
      const lines = Array.from({ length: 400 }, (_, i) => `  "key${i}": "value${i}",`);
      const code = '{\n' + lines.join('\n') + '\n}';

      const result = await engine.scanFile('data/large.json', code);

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC026'));
      expect(vuln).toBeUndefined();
    });
  });

  // ────────────────────────────────────────────
  // SEC018: TODO / FIXME comments
  // ────────────────────────────────────────────

  describe('SEC018 - TODO/FIXME comments', () => {
    it('should detect TODO comments', async () => {
      const code = '// TODO: implement this feature later';
      const result = await engine.scanFile('src/todo.ts', code);

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC018'));
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe('medium');
    });

    it('should detect FIXME comments', async () => {
      const code = '// FIXME: this is broken';
      const result = await engine.scanFile('src/fixme.ts', code);

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC018'));
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe('medium');
    });

    it('should detect HACK comments', async () => {
      const code = '// HACK: workaround for upstream bug';
      const result = await engine.scanFile('src/hack.ts', code);

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC018'));
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe('medium');
    });

    it('should detect TODO in block comments (SEC019)', async () => {
      const code = '/* TODO: clean up this module before release */';
      const result = await engine.scanFile('src/block.ts', code);

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC019'));
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe('medium');
    });
  });

  // ────────────────────────────────────────────
  // Additional rule coverage
  // ────────────────────────────────────────────

  describe('additional rules', () => {
    it('should detect SEC010: JSON.parse() without try/catch (high)', async () => {
      const code = 'const data = JSON.parse(rawInput);';
      const result = await engine.scanFile('src/parse.ts', code);

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC010'));
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe('high');
    });

    it('should detect SEC023: TypeScript "any" type usage (low)', async () => {
      const code = 'function process(data: any): any { return data; }';
      const result = await engine.scanFile('src/types.ts', code);

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC023'));
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe('low');
    });

    it('should detect SEC024: eslint-disable comment (low)', async () => {
      const code = '// eslint-disable-next-line no-console\nconst x = 1;';
      const result = await engine.scanFile('src/lint.ts', code);

      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC024'));
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe('low');
    });

    it('should detect SEC009: hardcoded JWT secret (critical)', async () => {
      const code = 'const jwt_secret = "my-super-secret-key-123";';
      const result = await engine.scanFile('src/jwt.ts', code);

      expect(result.score).toBe(0);
      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC009'));
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe('critical');
    });

    it('should detect SEC008: hardcoded connection string (critical)', async () => {
      // The SEC008 regex requires 6+ chars for both username and password parts
      const code = 'const dbUri = "mongodb://adminUser:password123@mongo:27017/app";';
      const result = await engine.scanFile('src/db.ts', code);

      expect(result.score).toBe(0);
      const vuln = result.vulnerabilities.find((v) => v.rule.startsWith('SEC008'));
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe('critical');
    });
  });

  // ────────────────────────────────────────────
  // Result structure
  // ────────────────────────────────────────────

  describe('result structure', () => {
    it('should return scanDurationMs as a non-negative number', async () => {
      const result = await engine.scanFile('src/any.ts', 'const x = 1;');
      expect(result.scanDurationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.scanDurationMs).toBe('number');
    });

    it('should report correct lineCount', async () => {
      const code = 'line1\nline2\nline3';
      const result = await engine.scanFile('src/lines.ts', code);
      expect(result.lineCount).toBe(3);
    });

    it('should report the filePath in the result', async () => {
      const result = await engine.scanFile('src/deep/nested/file.ts', 'const a = 1;');
      expect(result.filePath).toBe('src/deep/nested/file.ts');
    });
  });
});
