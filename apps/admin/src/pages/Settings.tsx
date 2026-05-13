import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings, Globe, Brain, Shield, Wrench, Zap, Bell,
  Save, RotateCcw, Eye, EyeOff, Check, Info, Loader2,
} from 'lucide-react';
import api from '@/lib/api';

// ─── Toggle Switch ───────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative rounded-full transition-colors duration-200 cursor-pointer ${checked ? 'bg-blue-500' : 'bg-white/10'}`}
      style={{ width: 40, height: 22 }}
    >
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

// ─── Masked Input ────────────────────────────────────────────────────────────

function MaskedInput({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder-gray-600 font-mono focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ message, visible }: { message: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-xl bg-[#1A1D24] border border-emerald-500/20 shadow-lg z-50 animate-slide-in">
      <Check className="w-4 h-4 text-emerald-400" />
      <span className="text-sm text-gray-300">{message}</span>
    </div>
  );
}

// ─── Section Wrapper ─────────────────────────────────────────────────────────

function SettingsSection({ title, icon: Icon, description, children, onSave, saving }: {
  title: string;
  icon: React.ElementType;
  description: string;
  children: React.ReactNode;
  onSave: () => void;
  saving?: boolean;
}) {
  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 mb-6">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          </div>
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 text-xs text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save
        </button>
      </div>
      {children}
    </div>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'general', label: 'General', icon: Globe },
  { id: 'platform', label: 'Platform', icon: Zap },
] as const;

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<string>('general');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });

  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast({ message: '', visible: false }), 3000);
  }, []);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getSettings();
      // Backend returns settings as flat key-value object from Redis
      // Handle both { success, data } and direct format
      const data = res.data || res;
      setSettings(typeof data === 'object' && !Array.isArray(data) ? { ...data } : {});
    } catch (err: any) {
      setError(err?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const saveSettings = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateSettings(settings);
      showToast('Settings saved successfully');
    } catch (err: any) {
      setError(err?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const getSetting = (key: string, defaultValue: string = ''): string => {
    return settings[key] ?? defaultValue;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0B0E]">
      <style>{`
        .animate-slide-in { animation: slideIn 0.3s ease-out; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div className="p-6 max-w-[1000px] mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-6 h-6 text-gray-400" />
          <h1 className="text-2xl font-bold text-white">Platform Settings</h1>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 mb-4">
            {error}
          </div>
        )}

        {/* General Settings */}
        {activeTab === 'general' && (
          <SettingsSection title="General Settings" icon={Globe} description="Core platform configuration" onSave={saveSettings} saving={saving}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">Max Projects Per User</label>
                <input
                  type="number"
                  value={getSetting('maxProjectsPerUser', '10')}
                  onChange={e => updateSetting('maxProjectsPerUser', e.target.value)}
                  min={1}
                  max={100}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">Max Daily Cost Per User ($)</label>
                <input
                  type="number"
                  value={getSetting('maxDailyCost', '10')}
                  onChange={e => updateSetting('maxDailyCost', e.target.value)}
                  min={0}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">Sandbox Pool Size</label>
                <input
                  type="number"
                  value={getSetting('sandboxPoolSize', '3')}
                  onChange={e => updateSetting('sandboxPoolSize', e.target.value)}
                  min={1}
                  max={20}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">Worker Concurrency</label>
                <input
                  type="number"
                  value={getSetting('workerConcurrency', '5')}
                  onChange={e => updateSetting('workerConcurrency', e.target.value)}
                  min={1}
                  max={20}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </div>
            </div>
            <div className="flex flex-col gap-4 mt-5">
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                <div>
                  <p className="text-sm text-white">MCP Tools Enabled</p>
                  <p className="text-xs text-gray-500 mt-0.5">Enable Model Context Protocol tools</p>
                </div>
                <Toggle
                  checked={getSetting('mcpToolsEnabled', 'true') === 'true'}
                  onChange={v => updateSetting('mcpToolsEnabled', String(v))}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                <div>
                  <p className="text-sm text-white">Auto Healing</p>
                  <p className="text-xs text-gray-500 mt-0.5">Automatically retry failed jobs</p>
                </div>
                <Toggle
                  checked={getSetting('autoHealingEnabled', 'true') === 'true'}
                  onChange={v => updateSetting('autoHealingEnabled', String(v))}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                <div>
                  <p className="text-sm text-white">Open Registration</p>
                  <p className="text-xs text-gray-500 mt-0.5">Allow new users to register</p>
                </div>
                <Toggle
                  checked={getSetting('registrationEnabled', 'true') === 'true'}
                  onChange={v => updateSetting('registrationEnabled', String(v))}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                <div>
                  <p className="text-sm text-white">Maintenance Mode</p>
                  <p className="text-xs text-gray-500 mt-0.5">Disable platform for non-admin users</p>
                </div>
                <Toggle
                  checked={getSetting('maintenanceMode', 'false') === 'true'}
                  onChange={v => updateSetting('maintenanceMode', String(v))}
                />
              </div>
            </div>
          </SettingsSection>
        )}

        {/* Platform Settings */}
        {activeTab === 'platform' && (
          <SettingsSection title="Platform Configuration" icon={Zap} description="Platform URLs and access settings" onSave={saveSettings} saving={saving}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">Allowed Origins (CORS)</label>
                <textarea
                  value={getSetting('allowedOrigins', '')}
                  onChange={e => updateSetting('allowedOrigins', e.target.value)}
                  placeholder="https://aenews.dev&#10;https://studio.aenews.net"
                  rows={4}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 resize-none"
                />
                <p className="text-xs text-gray-600 mt-1">One URL per line</p>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">Cost Alert Email</label>
                <input
                  type="email"
                  value={getSetting('costAlertEmail', '')}
                  onChange={e => updateSetting('costAlertEmail', e.target.value)}
                  placeholder="admin@aenews.dev"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                />
              </div>
            </div>

            {/* Info Box */}
            <div className="flex items-start gap-2 mt-5 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
              <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-gray-400">
                Settings are stored in Redis and applied immediately. Some changes may require a service restart to take full effect.
                AI model configuration is managed through environment variables and the MCP package configuration.
              </p>
            </div>
          </SettingsSection>
        )}
      </div>

      <Toast message={toast.message} visible={toast.visible} />
    </div>
  );
}
