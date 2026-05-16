/**
 * Generator - Context-Aware Incremental File Generation
 * 
 * v2.0 — Adds context awareness:
 * - Each `generateFile()` call receives previously generated files
 * - Builds a smart context window containing only relevant dependency files
 * - System prompt includes project classification + tech stack
 * - Token budget management (~4000 tokens for dependency context)
 * 
 * v2.1 — CRITICAL FIXES 5, 6, 8:
 * - FIX 5: Brand Name Enforcement — extracts brand from prompt, injects into system prompt
 * - FIX 6: HTML Cross-Validation — removes dead CSS/JS references from HTML
 * - FIX 8: Unlinked CSS Auto-Link — adds missing CSS link tags to HTML
 * 
 * @author Dieudonné MATANDA (ALTER EGO) — AENEWS UNIVERSEL
 * @version 2.1.0-brand-crossval
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { FileSpec } from '../services/orchestrator.service.js';
import { MODEL_REGISTRY, AIProvider, MODEL_ROTATION_POOLS, resolveModelName, getModelSpecialParams, getEffectiveMaxTokens } from '../services/ai-failover.js';

// ============================================
// 🔹 TYPES
// ============================================

/** Shape of the context object passed to generateFile() */
export interface GenerationContext {
  /** Project classification from the orchestrator */
  classification?: any;
  /** All files generated so far (path → content) */
  generatedFiles: Record<string, string>;
  /** Recommended tech stack from classification */
  techStack?: string[];
  /** The original user prompt — used for brand name extraction (CRITICAL FIX 5) */
  originalPrompt?: string;
}

/** Estimated token count for a string (rough: 1 token ≈ 4 chars) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ============================================
// 🏷️ BRAND NAME EXTRACTION (CRITICAL FIX 5)
// ============================================

/**
 * Extract brand/project name from the user's prompt.
 * Looks for patterns like "called X", "nommé X", "nom X", "named X", "appellée X"
 */
function extractBrandName(prompt: string, fallback: string): string {
  if (!prompt) return fallback;
  // Match patterns: "called X", "nommé X", "nom X", "named X", "appellée X", "appelé X"
  const brandNameMatch = prompt.match(/(?:called|nommé|nom|named|appellée|appelé)\s+["']?(\w+)["']?/i);
  if (brandNameMatch && brandNameMatch[1]) {
    return brandNameMatch[1];
  }
  return fallback;
}

// ============================================
// 🔗 HTML CROSS-VALIDATION (CRITICAL FIX 6)
// ============================================

/**
 * Escape special regex characters in a string.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Cross-validate HTML references against actually generated files.
 * Removes CSS/JS references to files that don't exist. (CRITICAL FIX 6)
 */
export function crossValidateHTMLReferences(htmlContent: string, generatedFiles: Map<string, string>): string {
    let fixed = htmlContent;
    // Find all CSS/JS references in HTML
    const cssRefs = [...fixed.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/gi)];
    const jsRefs = [...fixed.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/gi)];
    
    const allRefs = [...cssRefs, ...jsRefs];
    for (const match of allRefs) {
        const ref = match[1];
        // Normalize path (remove ./ prefix)
        const normalized = ref.replace(/^\.\//, '');
        // Check if the referenced file exists in generated files
        const exists = Array.from(generatedFiles.keys()).some(f => 
            f.endsWith(normalized) || normalized.endsWith(f.replace(/^\//, ''))
        );
        if (!exists) {
            // Remove the reference if the file doesn't exist
            if (ref.endsWith('.css')) {
                fixed = fixed.replace(new RegExp(`<link[^>]*href=["']${escapeRegex(ref)}["'][^>]*/?>`, 'gi'), '');
            } else if (ref.endsWith('.js')) {
                fixed = fixed.replace(new RegExp(`<script[^>]*src=["']${escapeRegex(ref)}["'][^>]*>\\s*</script>`, 'gi'), '');
            }
        }
    }
    // Clean up empty lines left by removed references
    fixed = fixed.replace(/\n[ \t]*\n[ \t]*\n/g, '\n\n');
    return fixed;
}

// ============================================
// 📎 UNLINKED CSS FILES AUTO-LINK (CRITICAL FIX 8)
// ============================================

/**
 * Add missing CSS link tags for generated CSS files that aren't referenced in HTML.
 * (CRITICAL FIX 8)
 */
export function addMissingCSSLinks(htmlContent: string, generatedFiles: Map<string, string>): string {
    const cssFiles = Array.from(generatedFiles.keys()).filter(f => f.endsWith('.css'));
    const linkedCSS = new Set(
        [...htmlContent.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/gi)].map(m => m[1].replace(/^\.\//, ''))
    );
    
    const missingCSS = cssFiles.filter(f => {
        const normalized = f.replace(/^\//, '');
        // Strip assets/ prefix for cross-matching (path normalization FIX 14)
        const strippedAssets = normalized.replace(/^assets\//, '');
        return !Array.from(linkedCSS).some(linked => 
            linked.endsWith(normalized) || 
            normalized.endsWith(linked) ||
            linked.endsWith(strippedAssets) ||
            strippedAssets.endsWith(linked.replace(/^assets\//, '')) ||
            linked === strippedAssets
        );
    });
    
    if (missingCSS.length === 0) return htmlContent;
    
    // Find </head> and insert missing CSS links before it
    const links = missingCSS.map(f => `    <link rel="stylesheet" href="${f}">`).join('\n');
    return htmlContent.replace('</head>', `${links}\n</head>`);
}

// ============================================
// ES MODULE SCRIPT TAG FIX (CRITICAL FIX 9)
// ============================================

/**
 * Detect if any generated JS file uses ES module syntax (import/export)
 * and if so, add type="module" to all script tags in HTML.
 * Without this, browsers will refuse to execute import/export statements
 * loaded as regular <script> tags.
 */
export function fixModuleScriptTags(htmlContent: string, generatedFiles: Map<string, string>): string {
    // Check if any JS file uses ES module syntax
    const jsFiles = Array.from(generatedFiles.entries()).filter(([path]) => path.endsWith('.js'));
    const usesESModules = jsFiles.some(([_, content]) => {
        const c = content || '';
        // Check for import/export statements (not in comments)
        return /import\s+.*from\s+['"]/.test(c) || /export\s+(default\s+)?/.test(c);
    });
    
    if (!usesESModules) return htmlContent;
    
    logger.info('[FIX9] ES module syntax detected in JS files - adding type="module" to script tags');
    
    // Add type="module" to all script tags that reference local JS files
    return htmlContent.replace(
        /<script\s+src=["']([^"']+\.js)["']\s*>/gi,
        '<script type="module" src="$1">'
    );
}


// ============================================

// ============================================
// MISSING SCRIPT TAGS AUTO-INJECT (CRITICAL FIX 13)
// ============================================

/**
 * Add missing <script> tags for generated JS files that aren't referenced in HTML.
 * (CRITICAL FIX 13)
 */
export function addMissingScriptTags(htmlContent: string, generatedFiles: Map<string, string>, useModules: boolean): string {
    // Find all JS references already in HTML
    const existingJSRefs = new Set(
        [...htmlContent.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/gi)].map(m => {
            const ref = m[1].replace(/^\.\//, '');
            return ref;
        })
    );
    
    // Find all generated JS files
    const jsFiles = Array.from(generatedFiles.keys()).filter(f => f.endsWith('.js'));
    
    // Find JS files not referenced in HTML (with path normalization for assets/ prefix)
    const missingJS = jsFiles.filter(f => {
        const normalized = f.replace(/^\//, '');
        // Strip assets/ prefix for cross-matching
        const strippedAssets = normalized.replace(/^assets\//, '');
        return !Array.from(existingJSRefs).some(ref => 
            ref === normalized || 
            ref === f || 
            ref.endsWith('/' + normalized) ||
            ref.endsWith('/' + f) ||
            normalized.endsWith(ref.replace(/^assets\//, '')) ||
            strippedAssets === ref ||
            strippedAssets === ref.replace(/^assets\//, '') ||
            ref.endsWith(strippedAssets)
        );
    });
    
    if (missingJS.length === 0) return htmlContent;
    
    // Sort: data/utility files first, main/app files last
    const sorted = missingJS.sort((a, b) => {
        const aName = a.split('/').pop() || '';
        const bName = b.split('/').pop() || '';
        const isMainA = /main|app|index|init/.test(aName);
        const isMainB = /main|app|index|init/.test(bName);
        if (isMainA && !isMainB) return 1;
        if (!isMainA && isMainB) return -1;
        return 0;
    });
    
    // Generate script tags
    const typeAttr = useModules ? ' type="module"' : '';
    const scriptTags = sorted.map(f => `    <script${typeAttr} src="${f}"></script>`).join('\n');
    
    logger.info(`[FIX13] Injecting ${sorted.length} missing script tags: ${sorted.join(', ')}`);
    
    // Insert before </body>
    return htmlContent.replace('</body>', `${scriptTags}\n</body>`);
}

// 🔹 UTILITY FUNCTIONS
// ============================================

/**
 * Normalize CSS/JS paths in HTML to match actual file locations.
 * Replaces ./styles/ -> css/ and ./scripts/ -> js/ 
 */
function normalizeAssetPaths(htmlContent: string): string {
  // Replace ./styles/ references with css/
  htmlContent = htmlContent.replace(/\.\/styles\//g, 'css/');
  htmlContent = htmlContent.replace(/\.\/styles\//g, 'css/');
  htmlContent = htmlContent.replace(/styles\//g, 'css/');
  
  // Replace ./scripts/ references with js/
  htmlContent = htmlContent.replace(/\.\/scripts\//g, 'js/');
  htmlContent = htmlContent.replace(/scripts\//g, 'js/');
  
  // Also handle href="./styles/xxx.css" and src="./scripts/xxx.js"
  htmlContent = htmlContent.replace(/href=["']\.?\/?styles\//g, 'href="css/');
  htmlContent = htmlContent.replace(/src=["']\.?\/?scripts\//g, 'src="js/');
  
  return htmlContent;
}

/**
 * Strip TypeScript syntax from generated JavaScript content.
 * Removes interfaces, type annotations, as-casts, and generic syntax.
 */
function stripTypeScriptFromJS(content: string): string {
  // Remove interface blocks (including nested braces)
  content = content.replace(/interface\s+\w+\s*(?:extends\s+\w+\s*)?\{[^}]*(?:\{[^}]*\}[^}]*)*\}/g, '');
  
  // Remove type annotation blocks (type X = ...)
  content = content.replace(/type\s+\w+\s*(?:<[^>]+>)?\s*=\s*[^;]+;/g, '');
  
  // Remove enum blocks
  content = content.replace(/enum\s+\w+\s*\{[^}]*\}/g, '');
  
  // Remove type annotations in function parameters: (param: Type) -> (param)
  content = content.replace(/(\w+)\s*:\s*(?:string|number|boolean|any|void|never|unknown|null|undefined)(?:\[\])?\s*([,)])/g, '$1$2');
  
  // Remove return type annotations: ): Type => or ): Type {
  content = content.replace(/\)\s*:\s*(?:string|number|boolean|any|void|never|unknown|null|undefined)(?:\[\])?\s*(=>|\{)/g, ') $1');
  
  // Remove 'as Type' casts
  content = content.replace(/\s+as\s+\w+/g, '');
  
  // Remove generic type parameters in function declarations: function name<T>
  content = content.replace(/(<[A-Z]\w*(?:\s+extends\s+\w+)?(?:,\s*[A-Z]\w*(?:\s+extends\s+\w+)?)*>)/g, '');
  
  // Remove non-null assertion operator
  content = content.replace(/(\w+)!/g, '$1');
  
  // Remove import type statements
  content = content.replace(/import\s+type\s+\{[^}]*\}\s+from\s+['"][^'"]+['"]\s*;?/g, '');
  
  // Remove export type statements  
  content = content.replace(/export\s+type\s+[^;]+;/g, '');
  
  return content;
}

// ============================================
// 🔹 AI CLIENTS
// ============================================

const openai = new OpenAI({ apiKey: config.openai.apiKey });
const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

// DashScope client (OpenAI-compatible with custom baseURL)
let dashscope: OpenAI | null = null;
if (config.dashscope.enabled && config.dashscope.apiKey) {
  dashscope = new OpenAI({
    apiKey: config.dashscope.apiKey,
    baseURL: config.dashscope.baseUrl,
  });
  logger.info(`[Generator] DashScope enabled: ${config.dashscope.baseUrl}`);
}

// Round-robin model rotation counter
let rotationCounters: Record<string, number> = {
  'qwen-turbo': 0, 'qwen-plus': 0, 'qwen-max': 0,
  'qwen3-235b-a22b': 0, 'qwen3-30b-a3b': 0,
  'qwen3-coder-480b': 0, 'qwen3-coder-plus': 0, 'qwen3-coder-flash': 0,
  'qwen3.6-plus': 0, 'qwen3.6-flash': 0,
  'qwen3-32b': 0, 'qwen3.5-35b': 0, 'qwen3.5-plus': 0, 'qwen3-max': 0,
  'qwen-vl-max': 0, 'qwen-coder-plus': 0,
};

/**
 * Pick next DashScope model in the same tier (round-robin rotation)
 * Falls back to OpenAI/Anthropic if DashScope is unavailable
 */
function rotateModel(model: string): string {
  const registry = MODEL_REGISTRY[model];
  if (!registry) return model;

  if (registry.provider === AIProvider.DASHSCOPE && dashscope) {
    const pool = MODEL_ROTATION_POOLS[registry.tier] || [];
    const dsModels = pool.filter(m => MODEL_REGISTRY[m]?.provider === AIProvider.DASHSCOPE);
    if (dsModels.length > 1) {
      const idx = (rotationCounters[model] || 0) % dsModels.length;
      rotationCounters[model] = idx + 1;
      const rotated = dsModels[idx];
      logger.debug(`[Generator] Rotating ${model} → ${rotated}`);
      return rotated;
    }
  }
  return model;
}

export class Generator {
  /** Max tokens for the dependency context window (keep prompt focused) */
  private readonly CONTEXT_TOKEN_BUDGET = 24000;

  /**
   * Generate a single file with full context awareness.
   * 
   * @param fileSpec  - The file specification from the plan
   * @param model     - Which LLM to use for generation
   * @param context   - Previously generated files + project metadata
   * @returns The generated file content (raw code, no markdown fences)
   */
  async generateFile(
    fileSpec: FileSpec,
    model: string,
    context: GenerationContext
  ): Promise<string> {
    // Apply model rotation (round-robin within same tier)
    const activeModel = rotateModel(model);

    logger.info(
      { file: fileSpec.path, model: activeModel, original: model, deps: fileSpec.dependencies.length },
      '🔨 Generating file (context-aware + rotation)'
    );

    const prompt = this.buildPrompt(fileSpec, context);
    const systemPrompt = this.buildSystemPrompt(context);

    try {
      let rawContent: string;
      const registry = MODEL_REGISTRY[activeModel];
      const provider = registry?.provider;

      if (provider === AIProvider.DASHSCOPE && dashscope) {
        rawContent = await this.generateWithDashScope(systemPrompt, prompt, activeModel);
      } else if (provider === AIProvider.OPENAI || activeModel.startsWith('gpt')) {
        rawContent = await this.generateWithOpenAI(systemPrompt, prompt, activeModel);
      } else if (provider === AIProvider.CLAUDE || activeModel.startsWith('claude')) {
        rawContent = await this.generateWithAnthropic(systemPrompt, prompt, activeModel);
      } else {
        // Unknown model — try DashScope first, then OpenAI fallback
        if (dashscope) {
          try {
            rawContent = await this.generateWithDashScope(systemPrompt, prompt, activeModel);
          } catch {
            rawContent = await this.generateWithOpenAI(systemPrompt, prompt, 'gpt-4o');
          }
        } else {
          rawContent = await this.generateWithOpenAI(systemPrompt, prompt, 'gpt-4o');
        }
      }

      // Strip markdown code fences if the LLM wrapped the output
      let processedContent = this.extractCode(rawContent);
      
      // CRITICAL FIX: Strip TypeScript syntax from .js files
      if (fileSpec.path.endsWith('.js')) {
        processedContent = stripTypeScriptFromJS(processedContent);
        logger.debug({ file: fileSpec.path }, '🧹 Stripped TypeScript syntax from .js file');
      }
      
      // CRITICAL FIX: Normalize CSS/JS paths in HTML files
      if (fileSpec.path.endsWith('.html') || fileSpec.path.endsWith('.htm')) {
        processedContent = normalizeAssetPaths(processedContent);
        logger.debug({ file: fileSpec.path }, '🔧 Normalized asset paths in HTML file');
      }
      
      return processedContent;
    } catch (error) {
      logger.error({ error, file: fileSpec.path }, '❌ Generation failed');
      throw error;
    }
  }

  // ============================================
  // 🧠 PROMPT BUILDING
  // ============================================

  /**
   * Build the system prompt with project-level context.
   * Includes classification, tech stack, and general coding guidelines.
   * CRITICAL FIX 5: Now includes brand name enforcement.
   */
  private buildSystemPrompt(context: GenerationContext): string {
    // CRITICAL FIX 5: Extract brand name from original prompt
    const brandName = extractBrandName(context.originalPrompt || '', '');

    const parts: string[] = [
      'You are a WORLD-CLASS senior software engineer with 15+ years of experience.',
      'You generate PRODUCTION-READY, PREMIUM code that is:',
      '  - Clean, well-typed, and follows modern best practices',
      '  - Properly structured with clear separation of concerns',
      '  - Responsive and accessible (mobile-first design)',
      '  - Performant with optimized rendering and data fetching',
      '  - Secure with proper input validation and error handling',
    ];

    // CRITICAL FIX 5: Brand Name Enforcement — always present when we have a brand name
    if (brandName) {
      parts.push(
        '',
        '## ⚠️ CRITICAL BRAND RULE',
        'You MUST use the exact brand/project name specified in the user\'s prompt.',
        'Extract the brand name from the prompt and use it consistently throughout ALL files -',
        'in titles, headings, navigation, footer, and any text references.',
        'NEVER substitute a different name. If the prompt says the project is called "NeuroFlow",',
        'every file must say "NeuroFlow", not "Nexus" or any other name.',
        '',
        `The project/brand name is: "${brandName}". Use this EXACT name everywhere.`,
      );
    } else if (context.originalPrompt) {
      parts.push(
        '',
        '## ⚠️ CRITICAL BRAND RULE',
        'You MUST use the exact brand/project name specified in the user\'s prompt.',
        'Extract the brand name from the prompt and use it consistently throughout ALL files -',
        'in titles, headings, navigation, footer, and any text references.',
        'NEVER substitute a different name.',
      );
    }

    parts.push(
      '',
      '## MODULE SYSTEM (CRITICAL FIX 9)',
      'If you use import/export in JavaScript files, ensure ALL JS files consistently use ES modules.',
      'The HTML must include type="module" on script tags.',
      'Alternatively, you can use a global pattern where all modules attach to a window.App namespace',
      'and are loaded in dependency order without import/export.',
      'NEVER mix ES module syntax (import/export) with regular script loading - pick one pattern and stick with it.',
    );

    parts.push(
      '',
      '## CROSS-FILE CONSISTENCY (CRITICAL FIX 12)',
      'When generating multiple files that interact (HTML + JS), you MUST:',
      '1. Use the EXACT same element IDs and class names in both HTML and JS',
      '2. Use data-* attributes for JS hooks (e.g., data-cart-button) and keep class names for styling only',
      '3. Ensure all DOM selectors in JS (document.getElementById, querySelector) reference elements that exist in the HTML',
      "4. If one JS module depends on another, ensure the dependent module's script is loaded AFTER the dependency",
      '5. Use a consistent data sharing pattern: either window.App namespace or ES modules with explicit imports - never mix both',
    );

    // Add project classification context
    if (context.classification) {
      const cls = context.classification;
      parts.push(
        '\n## Project Context',
        `- Project type: ${cls.type || 'unknown'}`,
        `- Complexity: ${cls.complexity || 'medium'}`,
        `- Features: ${(cls.features || []).join(', ')}`,
        `- Estimated files: ${cls.estimatedFiles || 'N/A'}`
      );
    }

    // Add tech stack context
    if (context.techStack && context.techStack.length > 0) {
      parts.push(
        '\n## Tech Stack',
        `Use these technologies: ${context.techStack.join(', ')}`,
        'Follow the idiomatic patterns and conventions of each technology.'
      );
    }

    parts.push(
      '\n## Code Quality Standards',
      '- For .ts files: Use TypeScript with STRICT types (never use `any` unless absolutely unavoidable)',
      '- For .js files: Use ONLY pure JavaScript (ES6+). NEVER use TypeScript syntax (interfaces, type annotations, enums, generics, as-casts) in .js files',
      '  IMPORTANT: All .js files must be pure JavaScript (ES6+). Do NOT use TypeScript syntax like interfaces, type annotations, or enums in .js files. Only use TypeScript syntax in .ts files.',
      '- Use proper async/await with try/catch for all async operations',
      '- Add JSDoc comments for exported functions and complex logic',
      '- Use ES2024+ syntax (optional chaining, nullish coalescing, etc.)',
      '- Follow the single responsibility principle — one export per file',
      '- Use meaningful variable and function names (no abbreviations)',
      '- Handle edge cases and validate all external inputs',
      '- Use CSS-in-JS or Tailwind CSS for styling (no separate .css files unless necessary)',
      '- Ensure responsive design with mobile-first approach',
      '- Add proper loading, error, and empty states for UI components',
      '- Use named exports; default export only for page-level components',
      '\n## Directory Structure',
      'All CSS files go in css/ directory, all JS files go in js/ directory.',
      'HTML must reference them as css/filename.css and js/filename.js (relative paths).',
      'Do NOT use ./styles/ or ./scripts/ paths — use css/ and js/ instead.',
      '',
      'FILE PATHS: All generated files must use simple, flat directory paths: css/*.css, js/*.js, images/*, data/*.json.',
      'Do NOT use nested paths like assets/css/ or static/js/.',
      'HTML must reference files using these exact paths (css/, js/, images/, data/).',
      '',
      '\n## Output',
      '- Return ONLY the file content. No explanations, no markdown headers.',
      '- Do NOT wrap in ```code blocks.',
      '- Ensure the code is complete and ready to run.'
    );

    return parts.join('\n');
  }

  /**
   * Build the user prompt with file spec + smart dependency context.
   * 
   * Selects only the most relevant previously generated files based on
   * the current fileSpec's dependency list, respecting the token budget.
   */
  private buildPrompt(fileSpec: FileSpec, context: GenerationContext): string {
    const parts: string[] = [];

    // ── File specification ─────────────────────────────────────────
    parts.push(
      `## Generate File: ${fileSpec.path}`,
      '',
      `**Description:** ${fileSpec.description}`,
      `**Type:** ${fileSpec.type}`,
      `**Priority:** ${fileSpec.priority}`,
    );

    if (fileSpec.dependencies.length > 0) {
      parts.push(`**Dependencies:** ${fileSpec.dependencies.join(', ')}`);
    }

    // ── Smart dependency context ───────────────────────────────────
    const depContext = this.buildDependencyContext(fileSpec, context.generatedFiles);
    if (depContext) {
      parts.push(
        '',
        '## Context: Related Files',
        'The following files have already been generated. Use them for import paths,',
        'type references, and to ensure consistency.',
        '',
        depContext
      );
    }

    // ── Generation instructions ────────────────────────────────────
    parts.push(
      '',
      '## Instructions',
      '- Generate ONLY the content for the file specified above.',
      '- Import from dependency files using relative paths matching the project structure.',
      '- Ensure all TypeScript types are properly referenced.',
      '- Use the exact export names from dependency files.'
    );

    return parts.join('\n');
  }

  /**
   * Select and format the most relevant previously-generated files
   * to include as context. Respects the CONTEXT_TOKEN_BUDGET to avoid
   * blowing up the prompt.
   * 
   * Priority order:
   * 1. Files explicitly listed in fileSpec.dependencies
   * 2. Files whose path suggests they are closely related (same directory, shared types)
   */
  private buildDependencyContext(
    fileSpec: FileSpec,
    generatedFiles: Record<string, string>
  ): string {
    if (!generatedFiles || Object.keys(generatedFiles).length === 0) {
      return '';
    }

    const contextParts: string[] = [];
    let usedTokens = 0;

    // ── Phase 1: Explicit dependencies (highest priority) ──────────
    for (const depPath of fileSpec.dependencies) {
      // Try exact match or fuzzy match
      let matchedPath: string | undefined = depPath;
      if (!generatedFiles[depPath]) {
        // Fuzzy match: find the file that best matches the dependency name
        matchedPath = Object.keys(generatedFiles).find(
          (p) =>
            p.endsWith(depPath) ||
            p.endsWith(`/${depPath}`) ||
            p.includes(depPath)
        );
      }

      if (matchedPath && generatedFiles[matchedPath]) {
        const content = generatedFiles[matchedPath];
        const tokens = estimateTokens(content);

        if (usedTokens + tokens <= this.CONTEXT_TOKEN_BUDGET) {
          contextParts.push(`--- ${matchedPath} ---\n${content}`);
          usedTokens += tokens;
        } else {
          // Budget exhausted — stop adding context
          break;
        }
      }
    }

    // ── Phase 2: Related files from same directory (if budget remains) ─
    if (usedTokens < this.CONTEXT_TOKEN_BUDGET) {
      const currentDir = fileSpec.path.includes('/')
        ? fileSpec.path.substring(0, fileSpec.path.lastIndexOf('/'))
        : '';

      // Shared types/config files are universally useful
      const universalPatterns = [
        'types.ts', 'types/index.ts', 'types.d.ts',
        'config.ts', 'constants.ts', 'utils.ts', 'helpers.ts',
        'package.json', 'tsconfig.json',
      ];

      const candidates = Object.keys(generatedFiles).filter((path) => {
        // Skip files already included as explicit deps
        if (contextParts.some((p) => p.startsWith(`--- ${path} ---`))) {
          return false;
        }
        // Match files in same directory
        if (currentDir && path.startsWith(currentDir)) {
          return true;
        }
        // Match universal patterns
        return universalPatterns.some((pattern) => path.endsWith(pattern));
      });

      for (const path of candidates) {
        const content = generatedFiles[path];
        const tokens = estimateTokens(content);

        if (usedTokens + tokens <= this.CONTEXT_TOKEN_BUDGET) {
          contextParts.push(`--- ${path} ---\n${content}`);
          usedTokens += tokens;
        } else {
          break;
        }
      }
    }

    if (contextParts.length === 0) {
      return '';
    }

    // Add token usage header for debugging
    const header = `<!-- Context: ${contextParts.length} file(s), ~${usedTokens} tokens -->`;
    return header + '\n' + contextParts.join('\n\n');
  }

  // ============================================
  // 🤖 AI GENERATION
  // ============================================

  /**
   * Generate using OpenAI (GPT-4o or GPT-4o-mini)
   */
  private async generateWithOpenAI(
    systemPrompt: string,
    userPrompt: string,
    model: string
  ): Promise<string> {
    if (!openai) throw new Error('OpenAI not configured');
    const effectiveMaxTokens = getEffectiveMaxTokens(model, config.cost.maxTokensPerRequest);
    const response = await openai.chat.completions.create({
      model: model === 'gpt-4o-mini' ? 'gpt-4o-mini' : 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: effectiveMaxTokens,
    });

    return response.choices[0].message.content || '';
  }

  /**
   * Generate using Anthropic (Claude Sonnet or Claude Opus)
   */
  private async generateWithAnthropic(
    systemPrompt: string,
    userPrompt: string,
    model: string
  ): Promise<string> {
    if (!anthropic) throw new Error('Anthropic not configured');
    const anthropicModel =
      model === 'claude-opus'
        ? 'claude-3-opus-20240229'
        : 'claude-3-5-sonnet-20241022';

    const effectiveMaxTokens = getEffectiveMaxTokens(anthropicModel, config.cost.maxTokensPerRequest);

    const response = await anthropic.messages.create({
      model: anthropicModel,
      max_tokens: effectiveMaxTokens,
      temperature: 0.2,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected Anthropic response type');
    }

    return content.text;
  }

  // ============================================
  // 🔧 UTILITIES
  // ============================================

  /**
   * Generate using DashScope (Qwen models via OpenAI-compatible API)
   */
  private async generateWithDashScope(
    systemPrompt: string,
    userPrompt: string,
    model: string
  ): Promise<string> {
    if (!dashscope) {
      throw new Error('DashScope client not initialized');
    }

    // ═══ CRITICAL FIX v3.0.1: Use centralized resolveModelName + getModelSpecialParams ═══
    // This ensures qwen3-coder-480b → qwen3-coder-480b-a35b-instruct AND
    // ALL DashScope models get enable_thinking: false automatically (CRITICAL FIX)
    const actualModel = resolveModelName(model);
    const specialParams = getModelSpecialParams(model);

    // CRITICAL FIX 7: Use getEffectiveMaxTokens to cap per-model limits
    const effectiveMaxTokens = getEffectiveMaxTokens(model, config.cost.maxTokensPerRequest);

    const response = await dashscope.chat.completions.create({
      model: actualModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: effectiveMaxTokens,
      ...specialParams,  // Inject enable_thinking: false for ALL DashScope models (CRITICAL FIX)
    });

    return response.choices[0]?.message?.content || '';
  }

  /**
   * Extract code from markdown code blocks if present.
   * LLMs sometimes wrap output in ```tsx ... ``` fences.
   */
  extractCode(content: string): string {
    // If the entire response is one code block, extract just the content
    const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/g;
    const matches = [...content.matchAll(codeBlockRegex)];

    if (matches.length === 1) {
      // Single code block — extract the content
      return matches[0][1].trim();
    }

    if (matches.length > 1) {
      // Multiple code blocks — take the first one (most likely the main file)
      return matches[0][1].trim();
    }

    // No code block found — return as-is
    return content.trim();
  }
}
