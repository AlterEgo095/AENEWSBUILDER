import { useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Clock, DollarSign, FileCode, CheckCircle, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { useApi } from '@/hooks/useApi';
import { PROJECT_STATE_VARIANT } from '@/types';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Backend returns project object directly (not wrapped in { data })
  const { data: project, loading, error } = useApi(
    () => api.getProject(id!),
    { immediate: !!id },
  );

  const state = project?.state || 'INIT';
  const displayState = project ? state : null;

  // Extract files from context or files field
  const files: Record<string, string> = project?.files || {};
  const contextFiles = (project?.context as Record<string, any>)?.files || {};
  const allFiles = Object.keys(files).length > 0 ? files : contextFiles;
  const fileEntries = Object.entries(allFiles);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-6 h-6 border-2 border-zinc-600 border-t-blue-400 rounded-full" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/projects')} iconLeft={<ArrowLeft size={14} />}>
          Back to Projects
        </Button>
        <Card>
          <p className="text-sm text-red-400">{error || 'Project not found'}</p>
        </Card>
      </div>
    );
  }

  const totalCost = project.stats?.totalCost || project.cost || project.totalCost || 0;
  const isCompleted = state === 'DONE';
  const createdAt = project.createdAt;

  return (
    <div className="space-y-6">
      {/* Back */}
      <Button variant="ghost" size="sm" onClick={() => navigate('/projects')} iconLeft={<ArrowLeft size={14} />}>
        Back to Projects
      </Button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white">{project.name || 'Untitled Project'}</h2>
            {displayState && (
              <Badge variant={PROJECT_STATE_VARIANT[state] || 'neutral'}>
                {state}
              </Badge>
            )}
          </div>
          <p className="text-sm text-zinc-500 mt-1">ID: {project.id}</p>
        </div>
        {project.deployUrl && (
          <Button
            variant="outline"
            size="sm"
            iconLeft={<ExternalLink size={14} />}
            onClick={() => window.open(project.deployUrl, '_blank')}
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
                {new Date(createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <DollarSign size={16} className="text-zinc-500" />
            <div>
              <p className="text-xs text-zinc-500">Cost</p>
              <p className="text-sm font-semibold text-white">${totalCost.toFixed(2)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            {isCompleted ? (
              <CheckCircle size={16} className="text-emerald-400" />
            ) : (
              <XCircle size={16} className="text-red-400" />
            )}
            <div>
              <p className="text-xs text-zinc-500">Status</p>
              <p className="text-sm text-zinc-200">{state}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* User Info */}
      {project.user && (
        <Card>
          <CardHeader>
            <CardTitle>Owner</CardTitle>
          </CardHeader>
          <p className="text-sm text-zinc-300">{project.user.name} ({project.user.email})</p>
        </Card>
      )}

      {/* Prompt */}
      {project.prompt && (
        <Card>
          <CardHeader>
            <CardTitle>Original Prompt</CardTitle>
          </CardHeader>
          <p className="text-sm text-zinc-300 leading-relaxed">{project.prompt}</p>
        </Card>
      )}

      {/* Events Timeline */}
      {project.events && Array.isArray(project.events) && project.events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Event Timeline</CardTitle>
            <CardDescription>{project.events.length} events</CardDescription>
          </CardHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {project.events.map((evt: any) => (
              <div key={evt.id} className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] text-sm">
                <span className="text-xs text-zinc-500 whitespace-nowrap mt-0.5">
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </span>
                <Badge variant={evt.event === 'error' || evt.event === 'failed' ? 'danger' : 'neutral'} dot={false} className="text-[10px]">
                  {evt.event}
                </Badge>
                <span className="text-zinc-400 text-xs">{evt.state} → {evt.nextState}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Files */}
      {fileEntries.length > 0 && (
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
                  {typeof content === 'string' ? content : JSON.stringify(content, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        </Card>
      )}

      {/* Cost Records */}
      {project.costRecords && Array.isArray(project.costRecords) && project.costRecords.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cost Records</CardTitle>
            <CardDescription>{project.costRecords.length} records</CardDescription>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left text-xs text-zinc-500 px-3 py-2">Operation</th>
                  <th className="text-right text-xs text-zinc-500 px-3 py-2">Tokens</th>
                  <th className="text-right text-xs text-zinc-500 px-3 py-2">Cost</th>
                  <th className="text-right text-xs text-zinc-500 px-3 py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {project.costRecords.map((r: any) => (
                  <tr key={r.id} className="border-b border-white/[0.03]">
                    <td className="px-3 py-2 text-zinc-300 text-xs">{r.operation}</td>
                    <td className="px-3 py-2 text-zinc-400 text-xs text-right">{(r.tokens || 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-zinc-300 text-xs text-right">${(r.cost || 0).toFixed(4)}</td>
                    <td className="px-3 py-2 text-zinc-500 text-xs text-right">{new Date(r.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
