/**
 * Templates - Multi-Framework Starter Configs
 * 
 * Provides pre-built starter configurations for 10 popular frameworks.
 * Each template includes:
 * - package.json with curated dependencies
 * - Essential config files (vite.config, tsconfig, etc.)
 * - Directory structure suggestion
 * - A `generateStarterFiles()` function returning essential files as Record<string, string>
 * 
 * The templates are used by the generator to bootstrap projects faster
 * and ensure consistent quality across different frameworks.
 * 
 * Supported frameworks:
 * React, Next.js, Vue 3, Svelte (SvelteKit), Angular, Nuxt 3,
 * Astro, Remix, Express, FastAPI
 * 
 * @author Dieudonné MATANDA (ALTER EGO) — AENEWS UNIVERSEL
 * @version 1.0.0
 */

// ============================================
// 🔹 TYPES
// ============================================

export interface TemplateConfig {
  /** Framework identifier (lowercase) */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Short description */
  description: string;
  /** Framework category for routing decisions */
  category: 'ssr' | 'static' | 'spa' | 'api' | 'fullstack';
  /** Default deployment platform */
  defaultPlatform: 'vercel' | 'cloudflare' | 'railway';
  /** Suggested directory structure */
  directoryStructure: string[];
  /** package.json content (dependencies, scripts, etc.) */
  packageJson: Record<string, any>;
  /** Generate essential config/source files */
  generateStarterFiles: (projectName: string) => Record<string, string>;
}

// ============================================
// 🔹 TEMPLATES REGISTRY
// ============================================

const templates: Record<string, TemplateConfig> = {
  // ────────────────────────────────────────────────────────────────
  // 1. REACT (Vite + React 18 + TypeScript + Tailwind CSS)
  // ────────────────────────────────────────────────────────────────
  react: {
    id: 'react',
    name: 'React',
    description: 'Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui',
    category: 'spa',
    defaultPlatform: 'cloudflare',
    directoryStructure: [
      'src/',
      'src/components/',
      'src/hooks/',
      'src/lib/',
      'src/pages/',
      'src/styles/',
      'public/',
    ],
    packageJson: {
      name: '',
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'tsc -b && vite build',
        preview: 'vite preview',
        lint: 'eslint .',
      },
      dependencies: {
        react: '^18.3.1',
        'react-dom': '^18.3.1',
        'react-router-dom': '^6.27.0',
        'class-variance-authority': '^0.7.0',
        clsx: '^2.1.1',
        'tailwind-merge': '^2.5.4',
        lucide: '^0.453.0',
      },
      devDependencies: {
        '@types/react': '^18.3.12',
        '@types/react-dom': '^18.3.1',
        '@vitejs/plugin-react': '^4.3.4',
        autoprefixer: '^10.4.20',
        postcss: '^8.4.47',
        tailwindcss: '^3.4.14',
        typescript: '^5.6.3',
        vite: '^5.4.10',
      },
    },
    generateStarterFiles: (projectName) => ({
      'vite.config.ts': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
`,
      'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
`,
      'src/main.tsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
      'src/App.tsx': `import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { routes } from './lib/routes';

const router = createBrowserRouter(routes);

export default function App() {
  return <RouterProvider router={router} />;
}
`,
      'src/lib/routes.tsx': `import { RouteObject } from 'react-router-dom';
import Home from '../pages/Home';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Home />,
  },
];
`,
      'src/pages/Home.tsx': `export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <main className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-foreground">${projectName}</h1>
        <p className="text-muted-foreground">Built with React + Vite + TypeScript</p>
      </main>
    </div>
  );
}
`,
      'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;
`,
      'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
`,
      'postcss.config.js': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`,
      'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    }),
  },

  // ────────────────────────────────────────────────────────────────
  // 2. NEXT.JS (App Router + TypeScript + Tailwind CSS + shadcn/ui)
  // ────────────────────────────────────────────────────────────────
  next: {
    id: 'next',
    name: 'Next.js',
    description: 'App Router + TypeScript + Tailwind CSS + shadcn/ui',
    category: 'ssr',
    defaultPlatform: 'vercel',
    directoryStructure: [
      'src/app/',
      'src/app/(routes)/',
      'src/components/',
      'src/components/ui/',
      'src/lib/',
      'src/hooks/',
      'public/',
    ],
    packageJson: {
      name: '',
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
        lint: 'next lint',
      },
      dependencies: {
        next: '^14.2.15',
        react: '^18.3.1',
        'react-dom': '^18.3.1',
        'class-variance-authority': '^0.7.0',
        clsx: '^2.1.1',
        'tailwind-merge': '^2.5.4',
        lucide: '^0.453.0',
      },
      devDependencies: {
        '@types/node': '^22.8.1',
        '@types/react': '^18.3.12',
        '@types/react-dom': '^18.3.1',
        autoprefixer: '^10.4.20',
        postcss: '^8.4.47',
        tailwindcss: '^3.4.14',
        typescript: '^5.6.3',
      },
    },
    generateStarterFiles: (projectName) => ({
      'next.config.js': `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`,
      'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
`,
      'src/app/layout.tsx': `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '${projectName}',
  description: 'Built with Next.js',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
`,
      'src/app/page.tsx': `export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">${projectName}</h1>
        <p className="text-muted-foreground">Built with Next.js + TypeScript</p>
      </div>
    </main>
  );
}
`,
      'src/app/globals.css': `@tailwind base;
@tailwind components;
@tailwind utilities;
`,
      'tailwind.config.ts': `import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;
`,
      'postcss.config.mjs': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`,
    }),
  },

  // ────────────────────────────────────────────────────────────────
  // 3. VUE 3 (Vite + Vue 3 + TypeScript + Pinia)
  // ────────────────────────────────────────────────────────────────
  vue: {
    id: 'vue',
    name: 'Vue 3',
    description: 'Vite + Vue 3 + TypeScript + Pinia',
    category: 'spa',
    defaultPlatform: 'cloudflare',
    directoryStructure: [
      'src/',
      'src/components/',
      'src/views/',
      'src/stores/',
      'src/router/',
      'src/composables/',
      'src/assets/',
      'public/',
    ],
    packageJson: {
      name: '',
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'vue-tsc -b && vite build',
        preview: 'vite preview',
      },
      dependencies: {
        vue: '^3.5.12',
        'vue-router': '^4.4.5',
        pinia: '^2.2.6',
      },
      devDependencies: {
        '@vitejs/plugin-vue': '^5.1.4',
        typescript: '^5.6.3',
        vite: '^5.4.10',
        'vue-tsc': '^2.1.10',
      },
    },
    generateStarterFiles: (projectName) => ({
      'vite.config.ts': `import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
`,
      'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
`,
      'src/main.ts': `import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './assets/main.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
`,
      'src/App.vue': `<template>
  <RouterView />
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>
`,
      'src/router/index.ts': `import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '@/views/HomeView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
  ],
});

export default router;
`,
      'src/views/HomeView.vue': `<template>
  <main class="min-h-screen flex items-center justify-center">
    <div class="text-center space-y-4">
      <h1 class="text-4xl font-bold">${projectName}</h1>
      <p class="text-muted-foreground">Built with Vue 3 + TypeScript</p>
    </div>
  </main>
</template>

<script setup lang="ts">
</script>
`,
      'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
    }),
  },

  // ────────────────────────────────────────────────────────────────
  // 4. SVELTEKIT (SvelteKit + TypeScript)
  // ────────────────────────────────────────────────────────────────
  svelte: {
    id: 'svelte',
    name: 'SvelteKit',
    description: 'SvelteKit + TypeScript',
    category: 'ssr',
    defaultPlatform: 'vercel',
    directoryStructure: [
      'src/routes/',
      'src/lib/',
      'src/components/',
      'src/stores/',
      'static/',
    ],
    packageJson: {
      name: '',
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'vite dev',
        build: 'vite build',
        preview: 'vite preview',
      },
      dependencies: {
        '@sveltejs/adapter-auto': '^3.0.0',
      },
      devDependencies: {
        '@sveltejs/kit': '^2.7.0',
        '@sveltejs/vite-plugin-svelte': '^4.0.0',
        svelte: '^5.0.0',
        'svelte-check': '^4.0.0',
        typescript: '^5.6.3',
        vite: '^5.4.10',
      },
    },
    generateStarterFiles: (projectName) => ({
      'svelte.config.js': `import adapter from '@sveltejs/adapter-auto';

export default {
  kit: {
    adapter: adapter(),
  },
};
`,
      'vite.config.ts': `import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
});
`,
      'src/app.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${projectName}</title>
    %sveltekit.head%
  </head>
  <body data-sveltekit-prerender="true">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
`,
      'src/routes/+page.svelte': `<main class="min-h-screen flex items-center justify-center">
  <div class="text-center space-y-4">
    <h1 class="text-4xl font-bold">${projectName}</h1>
    <p class="text-muted-foreground">Built with SvelteKit + TypeScript</p>
  </div>
</main>
`,
      'src/app.d.ts': `declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
`,
    }),
  },

  // ────────────────────────────────────────────────────────────────
  // 5. ANGULAR (Angular 17+ + standalone components)
  // ────────────────────────────────────────────────────────────────
  angular: {
    id: 'angular',
    name: 'Angular',
    description: 'Angular 17+ + standalone components + TypeScript',
    category: 'spa',
    defaultPlatform: 'cloudflare',
    directoryStructure: [
      'src/app/',
      'src/app/components/',
      'src/app/pages/',
      'src/app/services/',
      'src/assets/',
      'public/',
    ],
    packageJson: {
      name: '',
      version: '0.1.0',
      scripts: {
        ng: 'ng',
        start: 'ng serve',
        build: 'ng build',
      },
      dependencies: {
        '@angular/animations': '^18.2.11',
        '@angular/common': '^18.2.11',
        '@angular/compiler': '^18.2.11',
        '@angular/core': '^18.2.11',
        '@angular/forms': '^18.2.11',
        '@angular/platform-browser': '^18.2.11',
        '@angular/platform-browser-dynamic': '^18.2.11',
        '@angular/router': '^18.2.11',
        rxjs: '^7.8.1',
        tslib: '^2.6.3',
        zone: '^0.15.0',
      },
      devDependencies: {
        '@angular-devkit/build-angular': '^18.2.11',
        '@angular/cli': '^18.2.11',
        '@angular/compiler-cli': '^18.2.11',
        typescript: '^5.6.3',
      },
    },
    generateStarterFiles: (projectName) => ({
      'src/main.ts': `import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent).catch((err) => console.error(err));
`,
      'src/index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${projectName}</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <app-root></app-root>
  </body>
</html>
`,
      'src/app/app.component.ts': `import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class AppComponent {}
`,
      'src/app/app.routes.ts': `import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./home.component').then(m => m.HomeComponent) },
];
`,
      'src/app/home.component.ts': `import { Component } from '@angular/core';

@Component({
  selector: 'app-home',
  standalone: true,
  template: \`
    <main class="min-h-screen flex items-center justify-center">
      <div class="text-center space-y-4">
        <h1 class="text-4xl font-bold">${projectName}</h1>
        <p class="text-muted-foreground">Built with Angular 17+</p>
      </div>
    </main>
  \`,
})
export class HomeComponent {}
`,
    }),
  },

  // ────────────────────────────────────────────────────────────────
  // 6. NUXT 3 (Nuxt 3 + TypeScript + Pinia)
  // ────────────────────────────────────────────────────────────────
  nuxt: {
    id: 'nuxt',
    name: 'Nuxt 3',
    description: 'Nuxt 3 + TypeScript + Pinia',
    category: 'ssr',
    defaultPlatform: 'vercel',
    directoryStructure: [
      'pages/',
      'components/',
      'composables/',
      'stores/',
      'server/api/',
      'public/',
    ],
    packageJson: {
      name: '',
      version: '0.1.0',
      private: true,
      scripts: {
        build: 'nuxt build',
        dev: 'nuxt dev',
        generate: 'nuxt generate',
        preview: 'nuxt preview',
      },
      dependencies: {
        nuxt: '^3.13.2',
        vue: '^3.5.12',
        'vue-router': '^4.4.5',
      },
      devDependencies: {
        '@pinia/nuxt': '^0.5.3',
        pinia: '^2.2.6',
        typescript: '^5.6.3',
      },
    },
    generateStarterFiles: (projectName) => ({
      'nuxt.config.ts': `export default defineNuxtConfig({
  compatibilityDate: '2024-10-01',
  devtools: { enabled: false },
  modules: ['@pinia/nuxt'],
});
`,
      'tsconfig.json': `{
  "extends": "./.nuxt/tsconfig.json"
}
`,
      'app.vue': `<template>
  <NuxtPage />
</template>
`,
      'pages/index.vue': `<template>
  <main class="min-h-screen flex items-center justify-center">
    <div class="text-center space-y-4">
      <h1 class="text-4xl font-bold">${projectName}</h1>
      <p class="text-muted-foreground">Built with Nuxt 3 + TypeScript</p>
    </div>
  </main>
</template>
`,
    }),
  },

  // ────────────────────────────────────────────────────────────────
  // 7. ASTRO (Astro + React islands + TypeScript)
  // ────────────────────────────────────────────────────────────────
  astro: {
    id: 'astro',
    name: 'Astro',
    description: 'Astro + React islands + TypeScript',
    category: 'static',
    defaultPlatform: 'cloudflare',
    directoryStructure: [
      'src/pages/',
      'src/components/',
      'src/layouts/',
      'src/styles/',
      'public/',
    ],
    packageJson: {
      name: '',
      version: '0.1.0',
      type: 'module',
      scripts: {
        dev: 'astro dev',
        build: 'astro build',
        preview: 'astro preview',
      },
      dependencies: {
        astro: '^4.16.12',
        '@astrojs/react': '^3.6.4',
        react: '^18.3.1',
        'react-dom': '^18.3.1',
      },
      devDependencies: {
        '@types/react': '^18.3.12',
        '@types/react-dom': '^18.3.1',
        typescript: '^5.6.3',
      },
    },
    generateStarterFiles: (projectName) => ({
      'astro.config.mjs': `import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [react()],
});
`,
      'tsconfig.json': `{
  "extends": "astro/tsconfigs/strict"
}
`,
      'src/layouts/Base.astro': `---
interface Props { title: string }
const { title } = Astro.props;
---
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>
  </head>
  <body>
    <slot />
  </body>
</html>
`,
      'src/pages/index.astro': `---
import Base from '../layouts/Base.astro';
---
<Base title="${projectName}">
  <main class="min-h-screen flex items-center justify-center">
    <div class="text-center space-y-4">
      <h1 class="text-4xl font-bold">${projectName}</h1>
      <p class="text-muted-foreground">Built with Astro + React</p>
    </div>
  </main>
</Base>
`,
    }),
  },

  // ────────────────────────────────────────────────────────────────
  // 8. REMIX (Remix + TypeScript + Tailwind CSS)
  // ────────────────────────────────────────────────────────────────
  remix: {
    id: 'remix',
    name: 'Remix',
    description: 'Remix + TypeScript + Tailwind CSS',
    category: 'ssr',
    defaultPlatform: 'vercel',
    directoryStructure: [
      'app/',
      'app/routes/',
      'app/components/',
      'app/lib/',
      'app/styles/',
      'public/',
    ],
    packageJson: {
      name: '',
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'remix vite:dev',
        build: 'remix vite:build',
        start: 'remix-serve ./build/server/index.js',
      },
      dependencies: {
        '@remix-run/node': '^2.14.0',
        '@remix-run/react': '^2.14.0',
        '@remix-run/serve': '^2.14.0',
        isbot: '^5.1.13',
        react: '^18.3.1',
        'react-dom': '^18.3.1',
      },
      devDependencies: {
        '@remix-run/dev': '^2.14.0',
        '@types/react': '^18.3.12',
        '@types/react-dom': '^18.3.1',
        typescript: '^5.6.3',
        vite: '^5.4.10',
        '@remix-run/css-bundle': '^2.14.0',
        tailwindcss: '^3.4.14',
      },
    },
    generateStarterFiles: (projectName) => ({
      'vite.config.ts': `import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [remix()],
});
`,
      'app/root.tsx': `import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
`,
      'app/routes/_index.tsx': `export default function Index() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">${projectName}</h1>
        <p className="text-muted-foreground">Built with Remix + TypeScript</p>
      </div>
    </main>
  );
}
`,
    }),
  },

  // ────────────────────────────────────────────────────────────────
  // 9. EXPRESS (Express + TypeScript + Prisma)
  // ────────────────────────────────────────────────────────────────
  express: {
    id: 'express',
    name: 'Express',
    description: 'Express + TypeScript + Prisma ORM',
    category: 'api',
    defaultPlatform: 'railway',
    directoryStructure: [
      'src/',
      'src/routes/',
      'src/middleware/',
      'src/services/',
      'src/lib/',
      'prisma/',
    ],
    packageJson: {
      name: '',
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'tsx watch src/index.ts',
        build: 'tsc',
        start: 'node dist/index.js',
      },
      dependencies: {
        express: '^4.21.0',
        cors: '^2.8.5',
        helmet: '^7.1.0',
        'express-rate-limit': '^7.4.1',
      },
      devDependencies: {
        '@types/express': '^5.0.0',
        '@types/cors': '^2.8.17',
        '@types/node': '^22.8.1',
        prisma: '^5.20.0',
        'tsx': '^4.19.2',
        typescript: '^5.6.3',
      },
    },
    generateStarterFiles: (projectName) => ({
      'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
`,
      'src/index.ts': `import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { healthRouter } from './routes/health';

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
app.use(rateLimit({ windowMs: 60000, max: 100 }));

// Routes
app.use('/api/health', healthRouter);

app.listen(PORT, () => {
  console.log(\`${projectName} running on port \${PORT}\`);
});

export default app;
`,
      'src/routes/health.ts': `import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
`,
      'prisma/schema.prisma': `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
`,
    }),
  },

  // ────────────────────────────────────────────────────────────────
  // 10. FASTAPI (Python FastAPI + SQLAlchemy)
  // ────────────────────────────────────────────────────────────────
  fastapi: {
    id: 'fastapi',
    name: 'FastAPI',
    description: 'Python FastAPI + SQLAlchemy + Pydantic',
    category: 'api',
    defaultPlatform: 'railway',
    directoryStructure: [
      'app/',
      'app/api/',
      'app/models/',
      'app/schemas/',
      'app/services/',
      'app/core/',
      'tests/',
    ],
    packageJson: {
      name: '',
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'uvicorn app.main:app --reload --port 8000',
        start: 'uvicorn app.main:app --host 0.0.0.0 --port 8000',
      },
      dependencies: {},
    },
    generateStarterFiles: (projectName) => ({
      'requirements.txt': `fastapi>=0.115.0
uvicorn[standard]>=0.32.0
sqlalchemy>=2.0.35
pydantic>=2.9.0
pydantic-settings>=2.6.0
python-dotenv>=1.0.1
`,
      'app/main.py': `from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="${projectName}",
    description="Built with FastAPI + SQLAlchemy",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": "placeholder"}
`,
      'app/core/config.py': `from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "${projectName}"
    database_url: str = "sqlite:///./app.db"
    debug: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
`,
      'Dockerfile': `FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
`,
    }),
  },
};

// ============================================
// 🎯 PUBLIC API
// ============================================

/**
 * Get a template by framework identifier.
 * 
 * @param framework - The framework name (e.g. 'react', 'next', 'vue')
 * @returns The template config, or undefined if not found
 * 
 * @example
 * ```ts
 * const template = getTemplate('next');
 * console.log(template.name);           // 'Next.js'
 * console.log(template.defaultPlatform); // 'vercel'
 * const files = template.generateStarterFiles('my-app');
 * ```
 */
export function getTemplate(framework: string): TemplateConfig | undefined {
  return templates[framework.toLowerCase()];
}

/**
 * List all available templates.
 * 
 * @returns Array of template summaries (id, name, description, category)
 */
export function listTemplates(): Array<{
  id: string;
  name: string;
  description: string;
  category: string;
  defaultPlatform: string;
}> {
  return Object.values(templates).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    defaultPlatform: t.defaultPlatform,
  }));
}

/**
 * Auto-detect the best template from a project classification.
 * 
 * Uses the classification's `recommendedStack` and `type` to pick
 * the most appropriate template.
 * 
 * @param classification - The orchestrator's project classification
 * @returns The best-matching TemplateConfig
 */
export function detectTemplate(classification?: any): TemplateConfig {
  if (!classification) {
    return templates.react; // Sensible default
  }

  const stack = (classification.recommendedStack || []).map((s: string) =>
    s.toLowerCase()
  );
  const type = classification.type || 'webapp';

  // Explicit framework match from recommended stack
  for (const tech of stack) {
    if (tech.includes('next')) return templates.next;
    if (tech.includes('nuxt')) return templates.nuxt;
    if (tech.includes('angular')) return templates.angular;
    if (tech.includes('svelte')) return templates.svelte;
    if (tech.includes('vue') && !tech.includes('nuxt')) return templates.vue;
    if (tech.includes('astro')) return templates.astro;
    if (tech.includes('remix')) return templates.remix;
    if (tech.includes('express')) return templates.express;
    if (tech.includes('fastapi') || tech.includes('python')) return templates.fastapi;
  }

  // Type-based fallback
  const typeMap: Record<string, TemplateConfig> = {
    landing: templates.react,
    dashboard: templates.react,
    webapp: templates.next,
    ecommerce: templates.next,
    api: templates.express,
  };

  return typeMap[type] || templates.react;
}

/**
 * Get the starter files for a template, with the package.json name field
 * already populated.
 * 
 * @param framework  - Framework identifier
 * @param projectName - The project name (used in package.json and index.html)
 * @returns Record of file path → file content, or empty if template not found
 */
export function getStarterFiles(
  framework: string,
  projectName: string
): Record<string, string> {
  const template = getTemplate(framework);
  if (!template) {
    return {};
  }

  const files = template.generateStarterFiles(projectName);

  // Inject the project name into package.json
  if (files['package.json']) {
    try {
      const pkg = JSON.parse(files['package.json']);
      pkg.name = projectName;
      files['package.json'] = JSON.stringify(pkg, null, 2);
    } catch {
      // If parsing fails, leave as-is
    }
  }

  return files;
}
