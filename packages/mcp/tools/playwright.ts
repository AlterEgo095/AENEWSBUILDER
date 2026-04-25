/**
 * Playwright MCP Tool
 * E2E testing automation for generated projects
 */

import { chromium, Browser, Page } from 'playwright';

export interface PlaywrightTool {
  name: 'playwright';
  permissions: ['network', 'execute', 'read'];
  execute: (params: PlaywrightParams) => Promise<PlaywrightResult>;
}

export interface PlaywrightParams {
  url: string;
  tests?: TestCase[];
  screenshot?: boolean;
  headless?: boolean;
  timeout?: number;
}

export interface TestCase {
  name: string;
  actions: Action[];
  assertions?: Assertion[];
}

export interface Action {
  type: 'goto' | 'click' | 'fill' | 'wait' | 'scroll' | 'hover';
  selector?: string;
  value?: string;
  timeout?: number;
}

export interface Assertion {
  type: 'visible' | 'text' | 'value' | 'count';
  selector: string;
  expected: any;
}

export interface PlaywrightResult {
  success: boolean;
  data?: {
    testResults: TestResult[];
    screenshots?: string[];
    duration: number;
  };
  error?: string;
}

export interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

class PlaywrightAdapter {
  private browser: Browser | null = null;

  /**
   * Execute Playwright tests
   */
  async execute(params: PlaywrightParams): Promise<PlaywrightResult> {
    const startTime = Date.now();

    try {
      // Launch browser
      this.browser = await chromium.launch({
        headless: params.headless !== false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
      });

      const page = await context.newPage();

      // Run tests
      const testResults: TestResult[] = [];
      const screenshots: string[] = [];

      if (params.tests && params.tests.length > 0) {
        for (const test of params.tests) {
          const result = await this.runTest(page, test, params.timeout || 30000);
          testResults.push(result);

          if (params.screenshot) {
            const screenshot = await page.screenshot({ fullPage: true });
            screenshots.push(screenshot.toString('base64'));
          }
        }
      } else {
        // Default: just navigate and screenshot
        await page.goto(params.url, {
          waitUntil: 'networkidle',
          timeout: params.timeout || 30000,
        });

        if (params.screenshot) {
          const screenshot = await page.screenshot({ fullPage: true });
          screenshots.push(screenshot.toString('base64'));
        }

        testResults.push({
          name: 'Navigation',
          passed: true,
          duration: Date.now() - startTime,
        });
      }

      await this.browser.close();
      this.browser = null;

      return {
        success: true,
        data: {
          testResults,
          screenshots: screenshots.length > 0 ? screenshots : undefined,
          duration: Date.now() - startTime,
        },
      };
    } catch (error: any) {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Run a single test case
   */
  private async runTest(
    page: Page,
    test: TestCase,
    timeout: number
  ): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // Execute actions
      for (const action of test.actions) {
        await this.executeAction(page, action, timeout);
      }

      // Execute assertions
      if (test.assertions) {
        for (const assertion of test.assertions) {
          await this.executeAssertion(page, assertion, timeout);
        }
      }

      return {
        name: test.name,
        passed: true,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        name: test.name,
        passed: false,
        duration: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * Execute action
   */
  private async executeAction(
    page: Page,
    action: Action,
    defaultTimeout: number
  ): Promise<void> {
    const timeout = action.timeout || defaultTimeout;

    switch (action.type) {
      case 'goto':
        await page.goto(action.value || '', {
          waitUntil: 'networkidle',
          timeout,
        });
        break;

      case 'click':
        if (action.selector) {
          await page.click(action.selector, { timeout });
        }
        break;

      case 'fill':
        if (action.selector && action.value) {
          await page.fill(action.selector, action.value, { timeout });
        }
        break;

      case 'wait':
        await page.waitForTimeout(parseInt(action.value || '1000'));
        break;

      case 'scroll':
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        break;

      case 'hover':
        if (action.selector) {
          await page.hover(action.selector, { timeout });
        }
        break;
    }
  }

  /**
   * Execute assertion
   */
  private async executeAssertion(
    page: Page,
    assertion: Assertion,
    timeout: number
  ): Promise<void> {
    switch (assertion.type) {
      case 'visible':
        await page.waitForSelector(assertion.selector, {
          state: 'visible',
          timeout,
        });
        break;

      case 'text':
        const element = await page.waitForSelector(assertion.selector, { timeout });
        const text = await element?.textContent();
        if (text !== assertion.expected) {
          throw new Error(
            `Expected text "${assertion.expected}" but got "${text}"`
          );
        }
        break;

      case 'value':
        const input = await page.waitForSelector(assertion.selector, { timeout });
        const value = await input?.inputValue();
        if (value !== assertion.expected) {
          throw new Error(
            `Expected value "${assertion.expected}" but got "${value}"`
          );
        }
        break;

      case 'count':
        const elements = await page.$$(assertion.selector);
        if (elements.length !== assertion.expected) {
          throw new Error(
            `Expected ${assertion.expected} elements but found ${elements.length}`
          );
        }
        break;
    }
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export default PlaywrightAdapter;
