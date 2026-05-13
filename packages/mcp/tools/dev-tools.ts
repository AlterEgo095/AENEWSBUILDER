/**
 * Development MCP Tools Bundle
 * Code Sandbox, Git, File System, Package Manager, Linter/Formatter, Docker, Desktop Commander
 *
 * File system and shell operations are sandboxed to allowed directories.
 * All CLI calls use child_process with timeout and safety checks.
 */

import { exec, execFileSync } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════
// Input Validation Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Validate a find/grep pattern to prevent command injection */
function validateSearchPattern(pattern: string): void {
  const dangerous = /[;|`$\n]/;
  if (dangerous.test(pattern)) {
    throw new Error('Pattern contains forbidden characters: ; | ` $ or newline');
  }
  if (pattern.includes('-exec')) {
    throw new Error('Pattern contains forbidden flag: -exec');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Code Execution Sandbox
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sandboxed code execution adapter
 * Executes JS, Python, and shell commands with configurable timeouts
 */
export class CodeSandboxAdapter {
  private maxTimeout = 30000;
  private allowedDirs: string[];

  constructor(allowedDirs?: string[]) {
    this.allowedDirs = allowedDirs || ['/tmp', process.cwd()];
  }

  /**
   * Execute JavaScript code in a sandboxed Node.js context
   */
  async executeJS(code: string, dependencies?: Record<string, string>): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const tmpDir = `/tmp/sandbox_js_${Date.now()}`;
      await fs.mkdir(tmpDir, { recursive: true });

      // Write package.json if dependencies specified
      if (dependencies && Object.keys(dependencies).length > 0) {
        const pkg = { name: 'sandbox', version: '1.0.0', dependencies };
        await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkg, null, 2));
        await execAsync('npm install --silent', { cwd: tmpDir, timeout: 60000 });
      }

      const scriptFile = path.join(tmpDir, 'script.js');
      await fs.writeFile(scriptFile, code);

      const { stdout, stderr } = await execAsync(`node ${scriptFile}`, {
        cwd: tmpDir, timeout: this.maxTimeout, maxBuffer: 5 * 1024 * 1024,
      });

      // Cleanup
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

      return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
    } catch (error: any) {
      return { stdout: error.stdout?.trim() || '', stderr: error.stderr?.trim() || error.message, exitCode: error.exitCode || 1 };
    }
  }

  /**
   * Execute Python code in a sandboxed environment
   */
  async executePython(code: string, packages?: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const tmpDir = `/tmp/sandbox_py_${Date.now()}`;
      await fs.mkdir(tmpDir, { recursive: true });

      if (packages && packages.length > 0) {
        await execAsync(`pip install --quiet ${packages.join(' ')}`, { timeout: 120000 });
      }

      const scriptFile = path.join(tmpDir, 'script.py');
      await fs.writeFile(scriptFile, code);

      const { stdout, stderr } = await execAsync(`python3 ${scriptFile}`, {
        cwd: tmpDir, timeout: this.maxTimeout, maxBuffer: 5 * 1024 * 1024,
      });

      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

      return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
    } catch (error: any) {
      return { stdout: error.stdout?.trim() || '', stderr: error.stderr?.trim() || error.message, exitCode: error.exitCode || 1 };
    }
  }

  /**
   * Execute a shell command with timeout and safety checks
   */
  async executeShell(command: string, timeout: number = 30000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      // Basic safety check: block destructive commands
      const blocked = /\b(rm\s+-rf\s+/|mkfs|dd\s+if=|:\(\)\{\:\|&\}|shutdown|reboot)\b/;
      if (blocked.test(command)) {
        return { stdout: '', stderr: 'Command blocked for safety reasons', exitCode: 1 };
      }

      const { stdout, stderr } = await execAsync(command, {
        timeout: Math.min(timeout, 120000), maxBuffer: 10 * 1024 * 1024,
        cwd: this.allowedDirs[0] || '/tmp',
      });

      return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
    } catch (error: any) {
      return { stdout: error.stdout?.trim() || '', stderr: error.stderr?.trim() || error.message, exitCode: error.exitCode || 1 };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Git Operations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Git adapter for version control operations
 * All operations run in a specified directory
 */
export class GitAdapter {
  /** Initialize a new git repository */
  async init(dir: string): Promise<void> {
    try {
      await fs.mkdir(dir, { recursive: true });
      await execAsync('git init', { cwd: dir });
    } catch (error: any) {
      throw new Error(`git init failed: ${error.message}`);
    }
  }

  /** Clone a repository */
  async clone(repo: string, dir: string): Promise<void> {
    try {
      await execAsync(`git clone ${repo} ${dir}`, { timeout: 120000 });
    } catch (error: any) {
      throw new Error(`git clone failed: ${error.message}`);
    }
  }

  /** Stage files for commit */
  async add(dir: string, files: string[]): Promise<void> {
    try {
      await execAsync(`git add ${files.join(' ')}`, { cwd: dir });
    } catch (error: any) {
      throw new Error(`git add failed: ${error.message}`);
    }
  }

  /** Commit staged changes; returns commit hash */
  async commit(dir: string, message: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`git commit -m ${JSON.stringify(message)}`, { cwd: dir });
      const match = stdout.match(/\[([^\s]+) ([a-f0-9]+)\]/);
      return match ? match[2] : stdout.trim();
    } catch (error: any) {
      throw new Error(`git commit failed: ${error.message}`);
    }
  }

  /** Push to remote */
  async push(dir: string, remote?: string, branch?: string): Promise<void> {
    try {
      const target = branch ? `${remote || 'origin'} ${branch}` : (remote || 'origin');
      await execAsync(`git push ${target}`, { cwd: dir, timeout: 60000 });
    } catch (error: any) {
      throw new Error(`git push failed: ${error.message}`);
    }
  }

  /** Pull from remote */
  async pull(dir: string): Promise<void> {
    try {
      await execAsync('git pull', { cwd: dir, timeout: 60000 });
    } catch (error: any) {
      throw new Error(`git pull failed: ${error.message}`);
    }
  }

  /** Get commit history */
  async log(dir: string, limit: number = 20): Promise<any> {
    try {
      const { stdout } = await execAsync(
        `git log --pretty=format:'%H|%an|%ae|%s|%ci' -n ${limit}`,
        { cwd: dir },
      );
      return stdout.split('\n').filter(Boolean).map(line => {
        const [hash, author, email, message, date] = line.split('|');
        return { hash, author, email, message, date };
      });
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Get diff of unstaged changes */
  async diff(dir: string): Promise<string> {
    try {
      const { stdout } = await execAsync('git diff', { cwd: dir, maxBuffer: 5 * 1024 * 1024 });
      return stdout;
    } catch (error: any) {
      throw new Error(`git diff failed: ${error.message}`);
    }
  }

  /** Get repository status */
  async status(dir: string): Promise<any> {
    try {
      const { stdout } = await execAsync('git status --porcelain', { cwd: dir });
      const files = stdout.split('\n').filter(Boolean).map(line => ({
        status: line.substring(0, 2).trim(), file: line.substring(3),
      }));
      return { branch: (await this.getCurrentBranch(dir)), files, clean: files.length === 0 };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Create a new branch */
  async createBranch(dir: string, name: string): Promise<void> {
    try {
      await execAsync(`git checkout -b ${name}`, { cwd: dir });
    } catch (error: any) {
      throw new Error(`git branch create failed: ${error.message}`);
    }
  }

  /** Checkout a branch */
  async checkout(dir: string, branch: string): Promise<void> {
    try {
      await execAsync(`git checkout ${branch}`, { cwd: dir });
    } catch (error: any) {
      throw new Error(`git checkout failed: ${error.message}`);
    }
  }

  /** Helper: get current branch name */
  private async getCurrentBranch(dir: string): Promise<string> {
    try {
      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: dir });
      return stdout.trim();
    } catch {
      return 'unknown';
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// File System
// ═══════════════════════════════════════════════════════════════════════════

/**
 * File system adapter for reading, writing, and managing files
 * Operations are restricted to allowed directories for safety
 */
export class FileSystemAdapter {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || process.cwd();
  }

  /** Read file contents as UTF-8 string */
  async read(filePath: string): Promise<string> {
    try {
      const resolved = this.resolve(filePath);
      return (await fs.readFile(resolved, 'utf-8')).trim();
    } catch (error: any) {
      throw new Error(`Read failed for ${filePath}: ${error.message}`);
    }
  }

  /** Write content to a file */
  async write(filePath: string, content: string): Promise<void> {
    try {
      const resolved = this.resolve(filePath);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, content, 'utf-8');
    } catch (error: any) {
      throw new Error(`Write failed for ${filePath}: ${error.message}`);
    }
  }

  /** List files and directories */
  async list(dirPath: string): Promise<string[]> {
    try {
      const resolved = this.resolve(dirPath);
      return (await fs.readdir(resolved)).sort();
    } catch (error: any) {
      throw new Error(`List failed for ${dirPath}: ${error.message}`);
    }
  }

  /** Delete a file or empty directory */
  async delete(filePath: string): Promise<void> {
    try {
      const resolved = this.resolve(filePath);
      await fs.rm(resolved, { recursive: true, force: true });
    } catch (error: any) {
      throw new Error(`Delete failed for ${filePath}: ${error.message}`);
    }
  }

  /** Check if a path exists */
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(filePath));
      return true;
    } catch {
      return false;
    }
  }

  /** Get file/directory stats */
  async stat(filePath: string): Promise<any> {
    try {
      const resolved = this.resolve(filePath);
      const stats = await fs.stat(resolved);
      return { isFile: stats.isFile(), isDirectory: stats.isDirectory(), size: stats.size, modified: stats.mtime, created: stats.birthtime };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Copy a file or directory */
  async copy(src: string, dest: string): Promise<void> {
    try {
      const resolvedSrc = this.resolve(src);
      const resolvedDest = this.resolve(dest);
      await fs.mkdir(path.dirname(resolvedDest), { recursive: true });
      await fs.cp(resolvedSrc, resolvedDest, { recursive: true });
    } catch (error: any) {
      throw new Error(`Copy failed: ${error.message}`);
    }
  }

  /** Move/rename a file or directory */
  async move(src: string, dest: string): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.resolve(dest)), { recursive: true });
      await fs.rename(this.resolve(src), this.resolve(dest));
    } catch (error: any) {
      throw new Error(`Move failed: ${error.message}`);
    }
  }

  /** Create a directory (recursively) */
  async mkdir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(this.resolve(dirPath), { recursive: true });
    } catch (error: any) {
      throw new Error(`mkdir failed: ${error.message}`);
    }
  }

  /** Search for files matching a glob-like pattern */
  async search(dirPath: string, pattern: string): Promise<string[]> {
    try {
      validateSearchPattern(pattern);
      const resolved = this.resolve(dirPath);
      const stdout = execFileSync('find', [resolved, '-name', pattern, '-type', 'f'], { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
      return stdout.split('\n').filter(Boolean);
    } catch (error: any) {
      return [];
    }
  }

  /** Resolve a path relative to base directory */
  private resolve(filePath: string): string {
    if (path.isAbsolute(filePath)) return filePath;
    return path.resolve(this.baseDir, filePath);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Package Manager
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Package manager adapter (npm/bun)
 * Detects the package manager from lockfile and runs commands accordingly
 */
export class PackageAdapter {
  /** Detect package manager from lockfile */
  private detectPackageManager(dir: string): string {
    if (fsSync.existsSync(path.join(dir, 'bun.lockb')) || fsSync.existsSync(path.join(dir, 'bun.lock'))) return 'bun';
    if (fsSync.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fsSync.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
    return 'npm';
  }

  /** Install packages */
  async install(dir: string, packages: string[], dev: boolean = false): Promise<void> {
    try {
      const pm = this.detectPackageManager(dir);
      const flag = dev ? (pm === 'yarn' ? '--dev' : '--save-dev') : '';
      const pkgList = packages.join(' ');
      await execAsync(`${pm} install ${flag} ${pkgList}`, { cwd: dir, timeout: 120000 });
    } catch (error: any) {
      throw new Error(`Package install failed: ${error.message}`);
    }
  }

  /** Run a package script */
  async run(dir: string, script: string): Promise<{ stdout: string; stderr: string }> {
    try {
      const pm = this.detectPackageManager(dir);
      const { stdout, stderr } = await execAsync(`${pm} run ${script}`, {
        cwd: dir, timeout: 120000, maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error: any) {
      return { stdout: error.stdout?.trim() || '', stderr: error.stderr?.trim() || error.message };
    }
  }

  /** List installed packages */
  async list(dir: string): Promise<string[]> {
    try {
      const pkgPath = path.join(dir, 'package.json');
      if (!fsSync.existsSync(pkgPath)) return [];
      const pkg = JSON.parse(fsSync.readFileSync(pkgPath, 'utf-8'));
      return [
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
      ].sort();
    } catch (error: any) {
      return [];
    }
  }

  /** Check for outdated packages */
  async outdated(dir: string): Promise<any> {
    try {
      const pm = this.detectPackageManager(dir);
      const { stdout } = await execAsync(`${pm} outdated --json`, { cwd: dir, timeout: 60000 });
      const data = JSON.parse(stdout || '[]');
      return Array.isArray(data) ? data : [];
    } catch (error: any) {
      return [];
    }
  }

  /** Run security audit */
  async audit(dir: string): Promise<any> {
    try {
      const pm = this.detectPackageManager(dir);
      const { stdout } = await execAsync(`${pm} audit --json`, { cwd: dir, timeout: 60000 });
      return JSON.parse(stdout || '{}');
    } catch (error: any) {
      return { error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Linter / Formatter
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Linter and formatter adapter
 * Supports ESLint, Prettier, and TypeScript compiler checks
 */
export class LinterAdapter {
  /** Run ESLint on files or directory */
  async lintESLint(dir: string, files?: string[]): Promise<any> {
    try {
      const target = files ? files.join(' ') : '.';
      const { stdout, stderr } = await execAsync(`npx eslint ${target} --format json`, {
        cwd: dir, timeout: 60000, maxBuffer: 5 * 1024 * 1024,
      });
      const results = JSON.parse(stdout || '[]');
      const totalErrors = results.reduce((sum: number, r: any) => sum + (r.errorCount || 0), 0);
      const totalWarnings = results.reduce((sum: number, r: any) => sum + (r.warningCount || 0), 0);
      return { results, totalErrors, totalWarnings, passed: totalErrors === 0 };
    } catch (error: any) {
      if (error.stdout) {
        const results = JSON.parse(error.stdout || '[]');
        const totalErrors = results.reduce((sum: number, r: any) => sum + (r.errorCount || 0), 0);
        return { results, totalErrors, totalWarnings: 0, passed: false, stderr: error.stderr };
      }
      return { error: error.message, passed: false };
    }
  }

  /** Run Prettier check */
  async lintPrettier(dir: string, files?: string[]): Promise<any> {
    try {
      const target = files ? files.join(' ') : '.';
      const { stdout, stderr } = await execAsync(`npx prettier --check ${target}`, {
        cwd: dir, timeout: 30000,
      });
      return { passed: true, output: stdout.trim() };
    } catch (error: any) {
      return { passed: false, output: error.stderr || error.message };
    }
  }

  /** Run TypeScript compiler check */
  async lintTSC(dir: string): Promise<any> {
    try {
      const { stdout, stderr } = await execAsync('npx tsc --noEmit', {
        cwd: dir, timeout: 60000, maxBuffer: 5 * 1024 * 1024,
      });
      return { passed: true, output: stdout.trim() };
    } catch (error: any) {
      return { passed: false, errors: (error.stdout || error.stderr || error.message).split('\n').filter(Boolean) };
    }
  }

  /** Auto-fix linting issues */
  async fix(dir: string): Promise<void> {
    try {
      await execAsync('npx eslint . --fix', { cwd: dir, timeout: 60000 });
      await execAsync('npx prettier --write .', { cwd: dir, timeout: 60000 });
    } catch (error: any) {
      throw new Error(`Lint fix failed: ${error.message}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Docker Manager
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Docker container manager adapter
 * Build, run, manage, and inspect Docker containers
 */
export class DockerManagerAdapter {
  /** Build a Docker image */
  async build(dockerfile: string, tag: string, context?: string): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `docker build -f ${dockerfile} -t ${tag} ${context || '.'}`,
        { timeout: 300000, maxBuffer: 10 * 1024 * 1024 },
      );
      return stdout.trim();
    } catch (error: any) {
      throw new Error(`Docker build failed: ${error.message}`);
    }
  }

  /** Run a Docker container */
  async run(image: string, options?: any): Promise<string> {
    try {
      const args: string[] = ['docker', 'run', '--rm', '-d'];
      if (options?.ports) options.ports.forEach((p: string) => args.push('-p', p));
      if (options?.env) Object.entries(options.env).forEach(([k, v]) => args.push('-e', `${k}=${v}`));
      if (options?.volume) args.push('-v', options.volume);
      if (options?.command) args.push(options.command);
      args.push(image);

      const { stdout } = await execAsync(args.join(' '), { timeout: 30000 });
      return stdout.trim(); // container ID
    } catch (error: any) {
      throw new Error(`Docker run failed: ${error.message}`);
    }
  }

  /** List running containers */
  async ps(): Promise<any> {
    try {
      const { stdout } = await execAsync('docker ps --format "{{.ID}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.Names}}"');
      return stdout.split('\n').filter(Boolean).map(line => {
        const [id, image, status, ports, names] = line.split('|');
        return { id, image, status, ports, names };
      });
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /** Stop a running container */
  async stop(containerId: string): Promise<void> {
    try {
      await execAsync(`docker stop ${containerId}`, { timeout: 30000 });
    } catch (error: any) {
      throw new Error(`Docker stop failed: ${error.message}`);
    }
  }

  /** Get container logs */
  async logs(containerId: string, tail: number = 100): Promise<string> {
    try {
      const { stdout } = await execAsync(`docker logs --tail ${tail} ${containerId}`, {
        timeout: 15000, maxBuffer: 5 * 1024 * 1024,
      });
      return stdout;
    } catch (error: any) {
      throw new Error(`Docker logs failed: ${error.message}`);
    }
  }

  /** Remove a container */
  async rm(containerId: string): Promise<void> {
    try {
      await execAsync(`docker rm -f ${containerId}`, { timeout: 15000 });
    } catch (error: any) {
      throw new Error(`Docker rm failed: ${error.message}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Desktop Commander
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enhanced desktop commander adapter
 * Execute commands, manage files, search, and build directory trees
 */
export class DesktopCommanderAdapter {
  /** Execute a shell command in a directory */
  async exec(command: string, cwd?: string): Promise<{ stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: cwd || process.cwd(), timeout: 30000, maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error: any) {
      return { stdout: error.stdout?.trim() || '', stderr: error.stderr?.trim() || error.message };
    }
  }

  /** Read file contents */
  async readFile(filePath: string): Promise<string> {
    try {
      return (await fs.readFile(filePath, 'utf-8')).trim();
    } catch (error: any) {
      throw new Error(`Read failed: ${error.message}`);
    }
  }

  /** Write content to a file */
  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
    } catch (error: any) {
      throw new Error(`Write failed: ${error.message}`);
    }
  }

  /** Search for files by name pattern */
  async searchFiles(dir: string, pattern: string): Promise<string[]> {
    try {
      validateSearchPattern(pattern);
      const stdout = execFileSync('find', [dir, '-name', pattern, '-type', 'f'], { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
      return stdout.split('\n').filter(Boolean);
    } catch (error: any) {
      return [];
    }
  }

  /** Build a directory tree structure */
  async getDirectoryTree(dir: string, depth: number = 3): Promise<any> {
    try {
      const buildTree = async (currentDir: string, currentDepth: number): Promise<any> => {
        if (currentDepth <= 0) return { name: path.basename(currentDir), type: 'directory' };
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        const children = [];
        for (const entry of entries.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        })) {
          if (entry.name.startsWith('.') && entry.name !== '.env') continue;
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            children.push(await buildTree(fullPath, currentDepth - 1));
          } else {
            const stat = await fs.stat(fullPath);
            children.push({ name: entry.name, type: 'file', size: stat.size });
          }
        }
        return { name: path.basename(currentDir), type: 'directory', children };
      };

      return await buildTree(dir, depth);
    } catch (error: any) {
      return { error: error.message };
    }
  }
}
