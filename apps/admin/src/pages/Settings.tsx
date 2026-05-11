'use client';

import React, { useState, useCallback } from 'react';
import {
  Settings, Globe, Brain, Shield, Wrench, Zap, Bell,
  Save, RotateCcw, Eye, EyeOff, Plus, X, Check,
  Info,
} from 'lucide-react';
import { mockSettings } from '../data/mock-data';
import type { PlatformSettings, AIModel } from '../types';

// ─── Toggle Switch ───────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 ${
        checked ? 'bg-blue-500' : 'bg-white/10'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      style={{ width: 40, height: 22 }}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
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

// ─── Section Wrapper ─────────────────────────────────────────────────────────

function SettingsSection({ title, icon: Icon, description, children, onSave, onReset }: {
  title: string;
  icon: React.ElementType;
  description: string;
  children: React.ReactNode;
  onSave: () => void;
  onReset: () => void;
}) {
  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 mb-6">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Icon className="w-4.5 h-4.5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-400 hover:bg-white/10 hover:text-gray-300 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
          <button
            onClick={onSave}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 text-xs text-white font-medium hover:opacity-90 transition-opacity"
          >
            <Save className="w-3 h-3" />
            Save
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Field Row ───────────────────────────────────────────────────────────────

function Field({ label, description, children }: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-300 mb-1.5">{label}</label>
      {description && <p className="text-xs text-gray-600 mb-2">{description}</p>}
      {children}
    </div>
  );
}

// ─── Tag Input ───────────────────────────────────────────────────────────────

function TagInput({ tags, onChange, placeholder }: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');
  return (
    <div className="flex flex-wrap gap-1.5 p-2.5 bg-white/5 border border-white/10 rounded-lg min-h-[42px] focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/20 transition-colors">
      {tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-white/10 text-gray-300 rounded border border-white/5">
          {tag}
          <button
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="text-gray-500 hover:text-white transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
            e.preventDefault();
            const val = input.trim().replace(/,$/, '');
            if (val && !tags.includes(val)) {
              onChange([...tags, val]);
            }
            setInput('');
          }
        }}
        placeholder={placeholder}
        className="flex-1 min-w-[120px] bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none"
      />
    </div>
  );
}

// ─── Select ──────────────────────────────────────────────────────────────────

function Select<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer min-w-[160px]"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-[#1A1D24]">
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ─── Slider ──────────────────────────────────────────────────────────────────

function Slider({ value, onChange, min = 0, max = 1, step = 0.1 }: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500"
      />
      <span className="text-sm text-white font-medium tabular-nums w-10 text-right">
        {typeof step === 'number' && step < 1 ? value.toFixed(1) : value}
      </span>
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

// ─── Tab Navigation ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'general', label: 'General', icon: Globe },
  { id: 'ai', label: 'AI Config', icon: Brain },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'mcp', label: 'MCP Config', icon: Wrench },
  { id: 'queue', label: 'Queue', icon: Zap },
  { id: 'notifications', label: 'Notifications', icon: Bell },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [settings, setSettings] = useState<PlatformSettings>(JSON.parse(JSON.stringify(mockSettings)));
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });

  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast({ message: '', visible: false }), 3000);
  }, []);

  const updateSection = useCallback(<K extends keyof PlatformSettings>(section: K, updates: Partial<PlatformSettings[K]>) => {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...updates },
    }));
  }, []);

  const resetSection = useCallback((section: keyof PlatformSettings) => {
    setSettings((prev) => ({
      ...prev,
      [section]: JSON.parse(JSON.stringify(mockSettings[section])),
    }));
    showToast(`${section.charAt(0).toUpperCase() + section.slice(1)} settings reset to defaults`);
  }, [showToast]);

  const saveSection = useCallback((section: string) => {
    // Would call API here
    showToast(`${section} settings saved successfully`);
  }, [showToast]);

  const aiModelOptions: { value: AIModel; label: string }[] = [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
    { value: 'claude-haiku-3.5', label: 'Claude Haiku 3.5' },
    { value: 'gemini-pro', label: 'Gemini Pro' },
    { value: 'deepseek-v3', label: 'DeepSeek V3' },
  ];

  return (
    <div className="min-h-screen bg-[#0A0B0E]">
      <style>{`
        .animate-slide-in { animation: slideIn 0.3s ease-out; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 14px; height: 14px; border-radius: 50%;
          background: #3b82f6; cursor: pointer; border: 2px solid #111318;
        }
        input[type=range]::-webkit-slider-runnable-track {
          height: 6px; border-radius: 3px; background: rgba(255,255,255,0.1);
        }
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
                  activeTab === tab.id
                    ? 'bg-white/10 text-white'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* General Settings */}
        {activeTab === 'general' && (
          <SettingsSection
            title="General Settings"
            icon={Globe}
            description="Core platform configuration"
            onSave={() => saveSection('General')}
            onReset={() => resetSection('general')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Platform Name" description="The name displayed across the application">
                <input
                  type="text"
                  value={settings.general.platformName}
                  onChange={(e) => updateSection('general', { platformName: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </Field>
              <Field label="Platform URL" description="Base URL for the platform">
                <input
                  type="url"
                  value={settings.general.platformUrl}
                  onChange={(e) => updateSection('general', { platformUrl: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </Field>
              <Field label="Default User Role" description="Role assigned to newly registered users">
                <Select
                  value={settings.general.defaultUserRole}
                  onChange={(v) => updateSection('general', { defaultUserRole: v })}
                  options={[
                    { value: 'admin' as const, label: 'Admin' },
                    { value: 'user' as const, label: 'User' },
                    { value: 'viewer' as const, label: 'Viewer' },
                  ]}
                />
              </Field>
            </div>
            <div className="flex flex-col gap-4 mt-5">
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                <div>
                  <p className="text-sm text-white">Maintenance Mode</p>
                  <p className="text-xs text-gray-500 mt-0.5">Disable access for all non-admin users</p>
                </div>
                <Toggle
                  checked={settings.general.maintenanceMode}
                  onChange={(v) => updateSection('general', { maintenanceMode: v })}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                <div>
                  <p className="text-sm text-white">Open Registration</p>
                  <p className="text-xs text-gray-500 mt-0.5">Allow new users to register on the platform</p>
                </div>
                <Toggle
                  checked={settings.general.registrationOpen}
                  onChange={(v) => updateSection('general', { registrationOpen: v })}
                />
              </div>
            </div>
          </SettingsSection>
        )}

        {/* AI Configuration */}
        {activeTab === 'ai' && (
          <SettingsSection
            title="AI Configuration"
            icon={Brain}
            description="Model settings, API keys, and budget controls"
            onSave={() => saveSection('AI')}
            onReset={() => resetSection('ai')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="OpenAI API Key">
                <MaskedInput
                  value={settings.ai.openaiApiKey}
                  onChange={(v) => updateSection('ai', { openaiApiKey: v })}
                  placeholder="sk-proj-..."
                />
              </Field>
              <Field label="Anthropic API Key">
                <MaskedInput
                  value={settings.ai.anthropicApiKey}
                  onChange={(v) => updateSection('ai', { anthropicApiKey: v })}
                  placeholder="sk-ant-..."
                />
              </Field>
              <Field label="Default Model" description="Model used for new generation requests">
                <Select
                  value={settings.ai.defaultModel}
                  onChange={(v) => updateSection('ai', { defaultModel: v })}
                  options={aiModelOptions}
                />
              </Field>
              <Field label="Max Tokens per Request" description="Maximum tokens for a single AI call">
                <input
                  type="number"
                  value={settings.ai.maxTokens}
                  onChange={(e) => updateSection('ai', { maxTokens: parseInt(e.target.value) || 4096 })}
                  min={256}
                  max={128000}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </Field>
              <Field label="Temperature" description="Controls randomness (0 = deterministic, 1 = creative)">
                <Slider
                  value={settings.ai.temperature}
                  onChange={(v) => updateSection('ai', { temperature: v })}
                />
              </Field>
            </div>
            <div className="border-t border-white/5 mt-5 pt-5">
              <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-400" />
                Budget Controls
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Field label="Daily Budget Limit ($)" description="Max spending per day across all AI calls">
                  <input
                    type="number"
                    value={settings.ai.dailyBudgetLimit}
                    onChange={(e) => updateSection('ai', { dailyBudgetLimit: parseFloat(e.target.value) || 0 })}
                    min={0}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                  />
                </Field>
                <Field label="Hourly Budget Limit ($)" description="Max spending per hour">
                  <input
                    type="number"
                    value={settings.ai.hourlyBudgetLimit}
                    onChange={(e) => updateSection('ai', { hourlyBudgetLimit: parseFloat(e.target.value) || 0 })}
                    min={0}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                  />
                </Field>
              </div>
              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                  <div>
                    <p className="text-sm text-white">Circuit Breaker</p>
                    <p className="text-xs text-gray-500 mt-0.5">Temporarily disable model on repeated failures</p>
                  </div>
                  <Toggle
                    checked={settings.ai.circuitBreakerEnabled}
                    onChange={(v) => updateSection('ai', { circuitBreakerEnabled: v })}
                  />
                </div>
                {settings.ai.circuitBreakerEnabled && (
                  <Field label="Failure Threshold" description="Number of consecutive failures before breaking circuit">
                    <input
                      type="number"
                      value={settings.ai.circuitBreakerThreshold}
                      onChange={(e) => updateSection('ai', { circuitBreakerThreshold: parseInt(e.target.value) || 5 })}
                      min={1}
                      max={100}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                    />
                  </Field>
                )}
              </div>
            </div>
          </SettingsSection>
        )}

        {/* Security Settings */}
        {activeTab === 'security' && (
          <SettingsSection
            title="Security Settings"
            icon={Shield}
            description="Authentication, rate limiting, and access controls"
            onSave={() => saveSection('Security')}
            onReset={() => resetSection('security')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="JWT Expiry" description="How long authentication tokens remain valid">
                <Select
                  value={settings.security.jwtExpiry}
                  onChange={(v) => updateSection('security', { jwtExpiry: v })}
                  options={[
                    { value: '1h' as const, label: '1 Hour' },
                    { value: '24h' as const, label: '24 Hours' },
                    { value: '7d' as const, label: '7 Days' },
                    { value: '30d' as const, label: '30 Days' },
                  ]}
                />
              </Field>
              <Field label="Rate Limit: Max Requests" description="Maximum requests per window per IP">
                <input
                  type="number"
                  value={settings.security.rateLimitMax}
                  onChange={(e) => updateSection('security', { rateLimitMax: parseInt(e.target.value) || 100 })}
                  min={1}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </Field>
              <Field label="Rate Limit: Window" description="Time window for rate limiting">
                <Select
                  value={settings.security.rateLimitWindow}
                  onChange={(v) => updateSection('security', { rateLimitWindow: v })}
                  options={[
                    { value: '1min' as const, label: '1 Minute' },
                    { value: '5min' as const, label: '5 Minutes' },
                    { value: '15min' as const, label: '15 Minutes' },
                  ]}
                />
              </Field>
              <Field label="IP Ban Threshold" description="Number of violations before IP is banned">
                <input
                  type="number"
                  value={settings.security.ipBanThreshold}
                  onChange={(e) => updateSection('security', { ipBanThreshold: parseInt(e.target.value) || 50 })}
                  min={1}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </Field>
            </div>
            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                <div>
                  <p className="text-sm text-white">Content Security Policy (CSP)</p>
                  <p className="text-xs text-gray-500 mt-0.5">Enable CSP headers to prevent XSS attacks</p>
                </div>
                <Toggle
                  checked={settings.security.cspEnabled}
                  onChange={(v) => updateSection('security', { cspEnabled: v })}
                />
              </div>
              <Field label="CORS Origins" description="Allowed origins for cross-origin requests (Enter to add)">
                <TagInput
                  tags={settings.security.corsOrigins}
                  onChange={(v) => updateSection('security', { corsOrigins: v })}
                  placeholder="https://example.com"
                />
              </Field>
            </div>
          </SettingsSection>
        )}

        {/* MCP Configuration */}
        {activeTab === 'mcp' && (
          <SettingsSection
            title="MCP Configuration"
            icon={Wrench}
            description="MCP tool registry, timeouts, and rate limits"
            onSave={() => saveSection('MCP')}
            onReset={() => resetSection('mcp')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="MCP Registry Secret" description="Secret for authenticating MCP registry access">
                <MaskedInput
                  value={settings.mcp.registrySecret}
                  onChange={(v) => updateSection('mcp', { registrySecret: v })}
                  placeholder="mcp-reg-..."
                />
              </Field>
              <Field label="Default MCP Timeout (seconds)" description="Default timeout for MCP tool executions">
                <input
                  type="number"
                  value={settings.mcp.defaultTimeout}
                  onChange={(e) => updateSection('mcp', { defaultTimeout: parseInt(e.target.value) || 30 })}
                  min={5}
                  max={300}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </Field>
              <Field label="Max Concurrent MCP Executions" description="Maximum number of MCP tools running simultaneously">
                <input
                  type="number"
                  value={settings.mcp.maxConcurrentExecutions}
                  onChange={(e) => updateSection('mcp', { maxConcurrentExecutions: parseInt(e.target.value) || 10 })}
                  min={1}
                  max={50}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </Field>
            </div>
            <div className="border-t border-white/5 mt-5 pt-5">
              <h3 className="text-sm font-medium text-white mb-4">Per-Tool Rate Limits</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Tool</th>
                      <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Limit</th>
                      <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Window</th>
                      <th className="text-center py-2 px-3 text-xs text-gray-500 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settings.mcp.perToolRateLimits.map((rule, i) => (
                      <tr key={i} className="border-b border-white/5">
                        <td className="py-2 px-3 text-white font-mono text-xs">{rule.tool}</td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            value={rule.limit}
                            onChange={(e) => {
                              const newLimits = [...settings.mcp.perToolRateLimits];
                              newLimits[i] = { ...newLimits[i], limit: parseInt(e.target.value) || 0 };
                              updateSection('mcp', { perToolRateLimits: newLimits });
                            }}
                            min={1}
                            className="w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500/50"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={rule.window}
                            onChange={(e) => {
                              const newLimits = [...settings.mcp.perToolRateLimits];
                              newLimits[i] = { ...newLimits[i], window: e.target.value };
                              updateSection('mcp', { perToolRateLimits: newLimits });
                            }}
                            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500/50"
                          >
                            <option value="1min" className="bg-[#1A1D24]">1 min</option>
                            <option value="5min" className="bg-[#1A1D24]">5 min</option>
                            <option value="1h" className="bg-[#1A1D24]">1 hour</option>
                          </select>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            onClick={() => {
                              const newLimits = settings.mcp.perToolRateLimits.filter((_, idx) => idx !== i);
                              updateSection('mcp', { perToolRateLimits: newLimits });
                            }}
                            className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={() => {
                  updateSection('mcp', {
                    perToolRateLimits: [...settings.mcp.perToolRateLimits, { tool: '', limit: 10, window: '1min' }],
                  });
                }}
                className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 border-dashed text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add Rate Limit
              </button>
            </div>
          </SettingsSection>
        )}

        {/* Queue Configuration */}
        {activeTab === 'queue' && (
          <SettingsSection
            title="Queue Configuration"
            icon={Zap}
            description="BullMQ worker settings and job management"
            onSave={() => saveSection('Queue')}
            onReset={() => resetSection('queue')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Worker Concurrency" description="Number of jobs each worker processes simultaneously">
                <input
                  type="number"
                  value={settings.queue.workerConcurrency}
                  onChange={(e) => updateSection('queue', { workerConcurrency: parseInt(e.target.value) || 5 })}
                  min={1}
                  max={20}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </Field>
              <Field label="Job Timeout (seconds)" description="Maximum time a job can run before being terminated">
                <input
                  type="number"
                  value={settings.queue.jobTimeout}
                  onChange={(e) => updateSection('queue', { jobTimeout: parseInt(e.target.value) || 300 })}
                  min={30}
                  max={3600}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </Field>
              <Field label="Max Retry Attempts" description="Number of times a failed job will be retried">
                <input
                  type="number"
                  value={settings.queue.maxRetryAttempts}
                  onChange={(e) => updateSection('queue', { maxRetryAttempts: parseInt(e.target.value) || 3 })}
                  min={0}
                  max={10}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </Field>
              <Field label="Stalled Job Timeout (seconds)" description="Time before a stalled job is marked as failed">
                <input
                  type="number"
                  value={settings.queue.stalledJobTimeout}
                  onChange={(e) => updateSection('queue', { stalledJobTimeout: parseInt(e.target.value) || 120 })}
                  min={30}
                  max={600}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </Field>
            </div>
            <div className="mt-5">
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                <div>
                  <p className="text-sm text-white">Dead Letter Queue (DLQ)</p>
                  <p className="text-xs text-gray-500 mt-0.5">Route permanently failed jobs to a separate queue for inspection</p>
                </div>
                <Toggle
                  checked={settings.queue.dlqEnabled}
                  onChange={(v) => updateSection('queue', { dlqEnabled: v })}
                />
              </div>
            </div>
          </SettingsSection>
        )}

        {/* Notification Settings */}
        {activeTab === 'notifications' && (
          <SettingsSection
            title="Notification Settings"
            icon={Bell}
            description="Configure alerts and notification channels"
            onSave={() => saveSection('Notification')}
            onReset={() => resetSection('notifications')}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                <div>
                  <p className="text-sm text-white">Error Notifications</p>
                  <p className="text-xs text-gray-500 mt-0.5">Get notified when system errors occur</p>
                </div>
                <Toggle
                  checked={settings.notifications.errorNotifications}
                  onChange={(v) => updateSection('notifications', { errorNotifications: v })}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                <div>
                  <p className="text-sm text-white">Deployment Notifications</p>
                  <p className="text-xs text-gray-500 mt-0.5">Get notified when deployments complete or fail</p>
                </div>
                <Toggle
                  checked={settings.notifications.deploymentNotifications}
                  onChange={(v) => updateSection('notifications', { deploymentNotifications: v })}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                <div>
                  <p className="text-sm text-white">Email Notifications</p>
                  <p className="text-xs text-gray-500 mt-0.5">Send notification emails to platform admins</p>
                </div>
                <Toggle
                  checked={settings.notifications.emailNotifications}
                  onChange={(v) => updateSection('notifications', { emailNotifications: v })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
              <Field label="Cost Threshold Alert ($)" description="Trigger alert when daily cost exceeds this amount">
                <input
                  type="number"
                  value={settings.notifications.costThresholdAlert}
                  onChange={(e) => updateSection('notifications', { costThresholdAlert: parseFloat(e.target.value) || 0 })}
                  min={0}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                />
              </Field>
              <Field label="Slack Webhook URL" description="Incoming webhook URL for Slack notifications">
                <MaskedInput
                  value={settings.notifications.slackWebhookUrl}
                  onChange={(v) => updateSection('notifications', { slackWebhookUrl: v })}
                  placeholder="https://hooks.slack.com/services/..."
                />
              </Field>
            </div>
          </SettingsSection>
        )}
      </div>

      <Toast message={toast.message} visible={toast.visible} />
    </div>
  );
}
