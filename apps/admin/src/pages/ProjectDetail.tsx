import { useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Clock, DollarSign, FileCode, CheckCircle, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { useApi } from '@/hooks/useApi';
import type { Project } from '@/types';

const statusVariant = {
  pending: 'warning' as const,
  processing: 'info' as const,
  completed: 'success' as const,
  failed: 'danger' as const,
};

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: response, loading, error } = useApi(
    () => api.getProject(id!),
    { immediate: !!id },
  );

  const project: Project | null = (response?.data as Project) || null;

  // Fallback data
  const p = project || {
    id: id || 'unknown',
    userId: 'user-1',
    name: 'E-Commerce Platform',
    prompt: 'Build a modern e-commerce platform with product catalog, cart, checkout, and admin panel using Next.js with TypeScript and Tailwind CSS.',
    status: 'completed' as const,
    state: 'DONE',
    progress: 100,
    files: {
      'package.json': '{"name": "ecommerce", "version": "1.0.0", "dependencies": {"next": "^15.0.0", "react": "^19.0.0"}}',
      'src/app/page.tsx': 'export default function Home() { return <main>...</main>; }',
      'src/app/layout.tsx': 'export default function RootLayout({ children }) { return <html>{children}</html>; }',
      'src/components/ProductCard.tsx': 'export function ProductCard({ product }) { return <div>...</div>; }',
      'src/components/Cart.tsx': 'export function Cart() { return <div>...</div>; }',
      'tailwind.config.ts': 'export default { content: ["./src/**/*.{ts,tsx}"] };',
    },
    deployUrl: 'https://ecommerce-demo.aenews.app',
    createdAt: '2025-01-15T10:30:00Z',
    updatedAt: '2025-01-15T11:45:00Z',
    cost: 3.42,
  };

  const fileEntries = Object.entries(p.files);

  return (
    <div className="space-y-6">
      {/* Back */}
      <Button variant="ghost" size="sm" onClick={() => navigate('/projects')} iconLeft={<ArrowLeft size={14} />}>
        Back to Projects
      </Button>

      {error && (
        <Card>
          <p className="text-sm text-red-400">{error}</p>
        </Card>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white">{p.name}</h2>
            <Badge variant={statusVariant[p.status]}>{p.status}</Badge>
          </div>
          <p className="text-sm text-zinc-500 mt-1">ID: {p.id}</p>
        </div>
        {p.deployUrl && (
          <Button
            variant="outline"
            size="sm"
            iconLeft={<ExternalLink size={14} />}
            onClick={() => window.open(p.deployUrl, '_blank')}
          >
            View Deploy
          </Button>
        )}
      </div>

      {/* Meta */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <Clock size={16} className="text-zinc-500" />
            <div>
              <p className="text-xs text-zinc-500">Created</p>
              <p className="text-sm text-zinc-200">
                {new Date(p.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <DollarSign size={16} className="text-zinc-500" />
            <div>
              <p className="text-xs text-zinc-500">Cost</p>
              <p className="text-sm font-semibold text-white">${p.cost.toFixed(2)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            {p.status === 'completed' ? (
              <CheckCircle size={16} className="text-emerald-400" />
            ) : (
              <XCircle size={16} className="text-red-400" />
            )}
            <div>
              <p className="text-xs text-zinc-500">Progress</p>
              <p className="text-sm text-zinc-200">{p.progress}%</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Prompt */}
      <Card>
        <CardHeader>
          <CardTitle>Original Prompt</CardTitle>
        </CardHeader>
        <p className="text-sm text-zinc-300 leading-relaxed">{p.prompt}</p>
      </Card>

      {/* Files */}
      <Card>
        <CardHeader>
          <CardTitle>Generated Files</CardTitle>
          <CardDescription>{fileEntries.length} files</CardDescription>
        </CardHeader>
        <div className="space-y-2">
          {fileEntries.map(([name, content]) => (
            <details key={name} className="group">
              <summary className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.03] cursor-pointer transition-colors text-sm">
                <FileCode size={14} className="text-brand shrink-0" />
                <span className="text-zinc-300 font-mono text-xs">{name}</span>
              </summary>
              <pre className="mt-1 ml-6 p-3 rounded-lg bg-surface-0 text-xs text-zinc-400 font-mono overflow-x-auto max-h-48 overflow-y-auto">
                {content}
              </pre>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}
