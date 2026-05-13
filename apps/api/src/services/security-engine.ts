/**
 * Security Engine - AI-Generated Code Scanner
 *
 * Scans source files and projects for vulnerabilities before deployment.
 * Uses pattern-based (regex) detection rules covering OWASP top categories
 * and common AI-generation anti-patterns.
 */

import { logger } from '../config/logger.js';

// ============================================
// TYPES
// ============================================

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface Vulnerability {
  severity: Severity;
  rule: string;
  line: number;
  message: string;
  column?: number;
  snippet?: string;
}

export interface SecurityScanResult {
  filePath: string;
  score: number;
  vulnerabilities: Vulnerability[];
  passed: boolean;
  scanDurationMs: number;
  lineCount: number;
}

export interface ProjectScanResult {
  files: SecurityScanResult[];
  totalScore: number;
  passed: boolean;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  scanDurationMs: number;
  fileCount: number;
}

// ============================================
// DETECTION RULE DEFINITIONS
// ============================================

interface DetectionRule {
  id: string;
  name: string;
  severity: Severity;
  description: string;
  /** Regex applied line-by-line */
  pattern: RegExp;
  /** When true, the pattern is applied to the full content (multiline) */
  fullContent?: boolean;
  /**
   * Score penalty applied per finding.
   * Critical findings cap the file score at 0.
   */
  penalty: number;
  /** Whether this rule should short-circuit the file score to 0 */
  fatal?: boolean;
}

/**
 * Core detection rules — ordered from most to least severe.
 *
 * Each rule is deliberately tuned to minimise false positives on
 * legitimate framework / library boilerplate while catching real
 * vulnerabilities that frequently appear in AI-generated code.
 */
const RULES: DetectionRule[] = [
  // ── CRITICAL: Code execution with user input ──────────────────────
  {
    id: 'SEC001',
    name: 'eval-usage',
    severity: 'critical',
    description:
      'Use of eval() or new Function() — allows arbitrary code execution. Never use with user-controlled input.',
    pattern: /\beval\s*\(/,
    penalty: 40,
    fatal: true,
  },
  {
    id: 'SEC002',
    name: 'new-function-usage',
    severity: 'critical',
    description:
      'new Function() constructor detected — equivalent to eval(). Avoid dynamic code generation.',
    pattern: /\bnew\s+Function\s*\(/,
    penalty: 40,
    fatal: true,
  },
  {
    id: 'SEC003',
    name: 'child-process-exec',
    severity: 'critical',
    description:
      'child_process exec/spawn with potential string interpolation — risk of command injection.',
    pattern:
      /(?:child_process|require\s*\(\s*['"]child_process['"]\s*\)|import\s+.*['"]child_process['"]).*?(?:exec|execSync|spawn|spawnSync|execFile|execFileSync)/s,
    fullContent: true,
    penalty: 40,
    fatal: true,
  },
  {
    id: 'SEC004',
    name: 'dangerous-regex-dos',
    severity: 'critical',
    description:
      'Potential ReDoS (Regular Expression Denial of Service) — nested quantifiers or overlapping alternations can cause catastrophic backtracking.',
    pattern:
      /\(\?[=!\|].*\)|\([^)]*\([^)]*\)[^)]*\)[^)]*\{[^}]*\}|(\.\*\+|\.\+\+|\.\*\?|\.\+\?)\(/,
    penalty: 35,
    fatal: true,
  },

  // ── CRITICAL: Hardcoded secrets ───────────────────────────────────
  {
    id: 'SEC005',
    name: 'hardcoded-api-key',
    severity: 'critical',
    description:
      'Hardcoded API key detected — credentials must be stored in environment variables or a secrets manager.',
    pattern:
      /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['"][^'"]{8,}['"]/i,
    penalty: 40,
    fatal: true,
  },
  {
    id: 'SEC006',
    name: 'hardcoded-password',
    severity: 'critical',
    description:
      'Hardcoded password or secret detected — use environment variables or a vault.',
    pattern:
      /(?:password|passwd|pwd|secret|token|auth[_-]?token|access[_-]?token|private[_-]?key)\s*[:=]\s*['"][^'"]{6,}['"]/i,
    penalty: 40,
    fatal: true,
  },
  {
    id: 'SEC007',
    name: 'hardcoded-bearer-token',
    severity: 'critical',
    description:
      'Hardcoded bearer token or authorization header detected.',
    pattern:
      /(?:Authorization|Bearer)\s*[:=]\s*['"][Bb]earer\s+[A-Za-z0-9\-_\.]+['"]/,
    penalty: 40,
    fatal: true,
  },
  {
    id: 'SEC008',
    name: 'hardcoded-connection-string',
    severity: 'critical',
    description:
      'Hardcoded database connection string with embedded credentials.',
    pattern:
      /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^$\s]{6,}:[^$\s]{6,}@/i,
    penalty: 40,
    fatal: true,
  },
  {
    id: 'SEC009',
    name: 'hardcoded-jwt-secret',
    severity: 'critical',
    description:
      'Hardcoded JWT signing secret — use a strong random value from env/vault.',
    pattern:
      /(?:jwt[_-]?secret|jwt[_-]?key|signing[_-]?secret|session[_-]?secret)\s*[:=]\s*['"][^'"]{6,}['"]/i,
    penalty: 40,
    fatal: true,
  },

  // ── HIGH: Insecure deserialization ────────────────────────────────
  {
    id: 'SEC010',
    name: 'unsafe-json-parse',
    severity: 'high',
    description:
      'JSON.parse() without try/catch — can throw on malformed input. Wrap in error handling and validate the schema.',
    pattern: /JSON\.parse\s*\(/,
    penalty: 15,
  },
  {
    id: 'SEC011',
    name: 'yaml-parse-unsafe',
    severity: 'high',
    description:
      'YAML parsing without safeLoad — vulnerable to arbitrary code execution via crafted YAML.',
    pattern: /(?:yaml|js-yaml).*\.load\s*\(/,
    penalty: 25,
    fatal: true,
  },

  // ── HIGH: Path traversal ─────────────────────────────────────────
  {
    id: 'SEC012',
    name: 'path-traversal-concat',
    severity: 'high',
    description:
      'File path built via string concatenation with user input — vulnerable to directory traversal (../). Use path.resolve() and validate the result.',
    pattern: /(?:readFile|writeFile|unlink|mkdir|rmdir|access|stat|readdir|createReadStream|createWriteStream)\s*\([^)]*\+[^)]*\)/,
    penalty: 25,
  },
  {
    id: 'SEC013',
    name: 'path-traversal-template',
    severity: 'high',
    description:
      'File path constructed via template literal with variable — may allow directory traversal. Sanitize and resolve.',
    pattern: /(?:readFile|writeFile|unlink|mkdir|rmdir|access|stat|readdir|createReadStream|createWriteStream)\s*\(\s*`[^`]*\$\{/,
    penalty: 25,
  },

  // ── HIGH: Command injection ───────────────────────────────────────
  {
    id: 'SEC014',
    name: 'shell-exec-interpolation',
    severity: 'high',
    description:
      'Shell execution with template literal or string concatenation — command injection risk. Use execFile with an args array instead.',
    pattern: /(?:exec|execSync)\s*\(\s*`[^`]*\$\{/,
    penalty: 30,
    fatal: true,
  },
  {
    id: 'SEC015',
    name: 'shell-exec-concat',
    severity: 'high',
    description:
      'Shell execution with string concatenation — command injection risk.',
    pattern: /(?:exec|execSync)\s*\([^)]*\+[^)]*\)/,
    penalty: 30,
    fatal: true,
  },

  // ── HIGH: Dangerous npm packages ──────────────────────────────────
  {
    id: 'SEC016',
    name: 'dangerous-import-event-stream',
    severity: 'high',
    description:
      'Import of known malicious or deprecated package "event-stream". Remove immediately.',
    pattern: /require\s*\(\s*['"]event-stream['"]\s*\)/,
    penalty: 30,
    fatal: true,
  },

  // ── MEDIUM: Information leakage ───────────────────────────────────
  {
    id: 'SEC017',
    name: 'console-log-production',
    severity: 'medium',
    description:
      'console.log() call found — may leak sensitive data in production. Use the structured logger instead.',
    pattern: /(?:console\.(?:log|info|debug|warn|error)\s*\()/,
    penalty: 5,
  },
  {
    id: 'SEC018',
    name: 'todo-fixme-hack',
    severity: 'medium',
    description:
      'TODO / FIXME / HACK comment detected — indicates incomplete or fragile code that should be addressed before deployment.',
    pattern: /\/\/\s*(?:TODO|FIXME|HACK|XXX|WARN)/i,
    penalty: 3,
  },
  {
    id: 'SEC019',
    name: 'todo-fixme-hack-block',
    severity: 'medium',
    description:
      'TODO / FIXME / HACK in block comment — indicates incomplete or fragile code.',
    pattern: /\/\*[\s\S]*?(?:TODO|FIXME|HACK|XXX)[\s\S]*?\*\//,
    fullContent: true,
    penalty: 3,
  },
  {
    id: 'SEC020',
    name: 'no-cors-fetch',
    severity: 'medium',
    description:
      'fetch() with mode: "no-cors" — opaque responses hide server errors and prevent proper validation.',
    pattern: /mode\s*:\s*['"]no-cors['"]/,
    penalty: 10,
  },

  // ── MEDIUM: Security misconfigurations ────────────────────────────
  {
    id: 'SEC021',
    name: 'cors-wildcard',
    severity: 'medium',
    description:
      'CORS origin set to wildcard "*" — allows any domain to make requests. Restrict to known origins.',
    pattern: /(?:Access-Control-Allow-Origin|origin)\s*[:=]\s*['"]\*['"]/,
    penalty: 10,
  },
  {
    id: 'SEC022',
    name: 'disabled-csrf',
    severity: 'medium',
    description:
      'CSRF protection appears to be disabled — ensure cross-site request forgery defences are active.',
    pattern: /csrf\s*[:=]\s*(?:false|null|undefined|'disabled'|\"disabled\")/i,
    penalty: 10,
  },

  // ── LOW: Code quality ─────────────────────────────────────────────
  {
    id: 'SEC023',
    name: 'any-type-usage',
    severity: 'low',
    description:
      'TypeScript "any" type detected — reduces type safety. Use a specific type or "unknown" where the shape is unknown.',
    pattern: /:\s*any\b/,
    penalty: 2,
  },
  {
    id: 'SEC024',
    name: 'eslint-disable',
    severity: 'low',
    description:
      'ESLint rule suppression detected — rules are disabled without explanation. Add a comment explaining why.',
    pattern: /\/\/\s*eslint-disable/,
    penalty: 2,
  },
  {
    id: 'SEC025',
    name: 'no-expires-cookie',
    severity: 'low',
    description:
      'Cookie set without maxAge or expires — creates a session cookie that persists after the browser closes.',
    pattern: /(?:res\.cookie|setCookie|set-cookie)\s*\([^)]*\)\s*(?!.*(?:maxAge|expires))/,
    penalty: 3,
  },
];

// ============================================
// FILE EXTENSION → LANGUAGE HINTS
// ============================================

const SKIP_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp4',
  '.mp3',
  '.zip',
  '.tar',
  '.gz',
  '.lock',
  '.map',
]);

const SCANNABLE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.yaml',
  '.yml',
  '.env',
  '.sh',
  '.bash',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.php',
  '.sql',
  '.graphql',
  '.vue',
  '.svelte',
]);

// ============================================
// SEVERITY WEIGHTS
// ============================================

const SEVERITY_PENALTY: Record<Severity, number> = {
  critical: 40,
  high: 20,
  medium: 8,
  low: 3,
};

// ============================================
// SECURITY ENGINE
// ============================================

export class SecurityEngine {
  private rules: DetectionRule[];
  private readonly passThreshold: number;

  constructor(options?: { rules?: DetectionRule[]; passThreshold?: number }) {
    this.rules = options?.rules ?? RULES;
    this.passThreshold = options?.passThreshold ?? 70;
  }

  // ────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────

  /**
   * Scan a single file for security vulnerabilities.
   *
   * @param filePath - Virtual or real file path (used for reporting)
   * @param content  - Full source text of the file
   */
  async scanFile(filePath: string, content: string): Promise<SecurityScanResult> {
    const startMs = Date.now();

    const extension = this.getExtension(filePath);

    // Skip binary / non-scannable files
    if (SKIP_EXTENSIONS.has(extension)) {
      return {
        filePath,
        score: 100,
        vulnerabilities: [],
        passed: true,
        scanDurationMs: Date.now() - startMs,
        lineCount: 0,
      };
    }

    const lines = content.split('\n');
    const lineCount = lines.length;
    const vulnerabilities: Vulnerability[] = [];
    let totalPenalty = 0;
    let hasFatal = false;

    for (const rule of this.rules) {
      if (rule.fullContent) {
        // Full-content rules: report once at line 1
        if (rule.pattern.test(content)) {
          vulnerabilities.push({
            severity: rule.severity,
            rule: `${rule.id}: ${rule.name}`,
            line: 1,
            message: rule.description,
            snippet: lines[0]?.trim() ?? '',
          });
          totalPenalty += rule.penalty;
          if (rule.fatal) hasFatal = true;
        }
      } else {
        // Line-by-line rules
        for (let i = 0; i < lines.length; i++) {
          if (rule.pattern.test(lines[i])) {
            vulnerabilities.push({
              severity: rule.severity,
              rule: `${rule.id}: ${rule.name}`,
              line: i + 1,
              message: rule.description,
              snippet: lines[i].trim().substring(0, 120),
            });
            totalPenalty += rule.penalty;
            if (rule.fatal) hasFatal = true;

            // Only report the first occurrence per rule per file
            // to avoid noisy output for things like console.log
            if (rule.severity === 'medium' || rule.severity === 'low') {
              break;
            }
          }
        }
      }
    }

    // Structural / complexity checks (line-level, not regex rules)
    this.checkComplexity(filePath, lines, vulnerabilities);
    this.checkMissingAsyncErrorHandling(lines, vulnerabilities);

    // Compute score
    let score: number;
    if (hasFatal) {
      score = 0;
    } else {
      // Start at 100 and subtract penalties, clamped at 0
      score = Math.max(0, 100 - totalPenalty);
    }

    const passed = score >= this.passThreshold;

    const durationMs = Date.now() - startMs;

    if (!passed) {
      logger.warn(
        { filePath, score, vulnCount: vulnerabilities.length, durationMs },
        'Security scan FAILED',
      );
    } else if (vulnerabilities.length > 0) {
      logger.info(
        { filePath, score, vulnCount: vulnerabilities.length, durationMs },
        'Security scan passed with warnings',
      );
    }

    return {
      filePath,
      score,
      vulnerabilities,
      passed,
      scanDurationMs: durationMs,
      lineCount,
    };
  }

  /**
   * Scan an entire project (map of file paths to content).
   * Returns an aggregated result across all files.
   *
   * @param files - Record mapping file paths to their source content
   */
  async scanProject(files: Record<string, string>): Promise<ProjectScanResult> {
    const startMs = Date.now();

    const entries = Object.entries(files);
    const fileResults: SecurityScanResult[] = [];

    // Scan files in parallel (limited concurrency internally)
    const batchSize = 10;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(([path, content]) => this.scanFile(path, content)),
      );
      fileResults.push(...results);
    }

    // Aggregate
    const summary = { critical: 0, high: 0, medium: 0, low: 0 };
    let totalScore = 0;

    for (const result of fileResults) {
      totalScore += result.score;
      for (const vuln of result.vulnerabilities) {
        summary[vuln.severity]++;
      }
    }

    // Average score across all files (including skipped ones at 100)
    const totalScoreNormalized =
      fileResults.length > 0 ? Math.round(totalScore / fileResults.length) : 100;

    const anyCritical = summary.critical > 0;
    const passed = totalScoreNormalized >= this.passThreshold && !anyCritical;

    const durationMs = Date.now() - startMs;

    logger.info(
      {
        fileCount: fileResults.length,
        totalScore: totalScoreNormalized,
        passed,
        ...summary,
        durationMs,
      },
      'Project security scan completed',
    );

    return {
      files: fileResults,
      totalScore: totalScoreNormalized,
      passed,
      summary,
      scanDurationMs: durationMs,
      fileCount: fileResults.length,
    };
  }

  // ────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────

  /**
   * Check for overly complex files (>300 lines).
   * Rule SEC-L01 equivalent.
   */
  private checkComplexity(
    filePath: string,
    lines: string[],
    vulnerabilities: Vulnerability[],
  ): void {
    const extension = this.getExtension(filePath);
    // Only apply to source code files, not JSON/yaml configs
    const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.php', '.rb', '.vue', '.svelte']);
    if (!codeExtensions.has(extension)) return;

    if (lines.length > 300) {
      vulnerabilities.push({
        severity: 'low',
        rule: 'SEC026: overly-complex-file',
        line: lines.length,
        message: `File exceeds 300 lines (${lines.length} lines). Consider splitting into smaller modules for maintainability and security review.`,
      });
    }
  }

  /**
   * Detect async functions without try/catch or .catch().
   * Rule SEC-L02 equivalent.
   */
  private checkMissingAsyncErrorHandling(
    lines: string[],
    vulnerabilities: Vulnerability[],
  ): void {
    let inAsyncFunction = false;
    let braceDepth = 0;
    let hasTryCatch = false;
    let hasCatch = false;
    let functionLine = 0;
    let functionStartBraceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Detect async function or arrow
      if (/async\s+function\b/.test(trimmed) || /async\s*\(/.test(trimmed) || /=>\s*\{/.test(trimmed) && /async\b/.test(trimmed)) {
        if (!inAsyncFunction) {
          inAsyncFunction = true;
          functionLine = i + 1;
          hasTryCatch = false;
          hasCatch = false;
        }
      }

      if (inAsyncFunction) {
        // Track braces to understand function boundaries
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }

        if (!hasTryCatch && /\btry\s*\{/.test(trimmed)) {
          hasTryCatch = true;
        }

        // Check for .catch() pattern
        if (!hasCatch && /\.catch\s*\(/.test(trimmed)) {
          hasCatch = true;
        }

        // Check for await inside the function
        const containsAwait = /\bawait\b/.test(trimmed);

        // When we exit the function scope
        if (functionStartBraceDepth > 0 && braceDepth <= functionStartBraceDepth) {
          // If there was an await but no error handling, flag it
          if (containsAwait && !hasTryCatch && !hasCatch) {
            vulnerabilities.push({
              severity: 'low',
              rule: 'SEC027: missing-async-error-handling',
              line: functionLine,
              message:
                'Async function contains await without try/catch or .catch(). Unhandled promise rejections may crash the process.',
            });
          }
          inAsyncFunction = false;
        }
      }
    }
  }

  private getExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filePath.substring(lastDot).toLowerCase();
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const securityEngine = new SecurityEngine();
