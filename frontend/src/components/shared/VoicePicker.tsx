import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, Search, Loader2, X } from 'lucide-react';
import { apiClient } from '@/api/client';
import { getSettings } from '@/api/endpoints';
import { useT } from '@/hooks/useT';
import { cn } from '@/utils';

const voicePickerI18n = {
  zh: {
    voice: {
      label: '声音',
      placeholder: '搜索声音（名称）',
      allProviders: '全部来源',
      edge: 'Edge 在线声音',
      fish: 'Fish 克隆声音',
      asset: '已保存角色',
      preview: '试听',
      noVoices: '没有匹配的声音',
      loading: '加载声音目录…',
      followDefault: '跟随全局默认',
    },
  },
  en: {
    voice: {
      label: 'Voice',
      placeholder: 'Search voices (name)',
      allProviders: 'All providers',
      edge: 'Edge voices',
      fish: 'Fish cloned voices',
      asset: 'Saved roles',
      preview: 'Preview',
      noVoices: 'No matching voices',
      loading: 'Loading voice catalog…',
      followDefault: 'Follow global default',
    },
  },
};

export interface CatalogVoice {
  voice_id: string;
  provider: 'edge' | 'fish_audio';
  upstream_id: string;
  name: string;
  gender?: string | null;
  languages?: string[];
  /** 来自「已保存角色」资产（Settings 里管理的角色预设） */
  role_asset?: boolean;
}

interface VoicePickerProps {
  value: string;
  onChange: (voiceId: string) => void;
  language?: string;
  /** 是否允许「跟随全局默认」（值为空字符串） */
  allowUnset?: boolean;
  /** 限定列表只显示该来源的声音（如多人对话限定同引擎），缺省显示全部来源 */
  providerFilter?: 'edge' | 'fish_audio';
  className?: string;
}

const providerLabel = (t: (key: string) => string, item: CatalogVoice) =>
  item.role_asset ? t('voice.asset') : item.provider === 'edge' ? t('voice.edge') : t('voice.fish');

/**
 * 统一声音选择器：从 /api/voices 加载 Edge + Fish 目录，并合并设置里的
 * 「已保存角色」资产；支持搜索、来源筛选与试听；选择结果始终是 canonical voice id。
 * 列表项显示名称、语言与来源，不展示裸 ID。
 */
export const VoicePicker: React.FC<VoicePickerProps> = ({ value, onChange, language = 'zh', allowUnset = true, providerFilter, className }) => {
  const t = useT(voicePickerI18n);
  const [voices, setVoices] = useState<CatalogVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('');
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    // 两个请求独立失败处理：目录失败 → 空目录；「已保存角色」资产失败 → 仅没有资产，不清空目录
    const loadCatalog = apiClient.get<{ data: { voices: CatalogVoice[] } }>(`/api/voices?language=${encodeURIComponent(language)}`)
      .then((response) => (response.data?.data?.voices ?? []) as CatalogVoice[])
      .catch(() => [] as CatalogVoice[]);
    const loadAssets = getSettings()
      .then((response) => (response.data?.fish_audio_voice_assets || []).map((asset) => ({
        voice_id: `fish:${asset.voice}`,
        provider: 'fish_audio' as const,
        upstream_id: asset.voice,
        name: asset.name,
        languages: asset.language ? [asset.language] : [],
        role_asset: true,
      })))
      .catch(() => [] as CatalogVoice[]);
    Promise.all([loadCatalog, loadAssets])
      .then(([catalog, assets]) => {
        if (!active) return;
        const assetIds = new Set(assets.map((asset) => asset.voice_id));
        setVoices([...catalog.filter((item) => !assetIds.has(item.voice_id)), ...assets]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [language]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return voices.filter((item) => {
      if (providerFilter && item.provider !== providerFilter) return false;
      if (provider && item.provider !== provider) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q)
        || (item.upstream_id || '').toLowerCase().includes(q);
    });
  }, [voices, query, provider, providerFilter]);

  const selected = useMemo(
    () => voices.find((item) => item.voice_id === value),
    [voices, value],
  );

  const preview = async (voiceId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setPreviewing(voiceId);
    try {
      const response = await apiClient.get(`/api/voices/${encodeURIComponent(voiceId)}/preview`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data as Blob);
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch {
      // 试听不可用时静默降级（外部 API 未配置等）
    } finally {
      setPreviewing(null);
    }
  };

  const showProviderFilter = !providerFilter;

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 w-full items-center gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-left text-sm transition-colors hover:border-[var(--app-accent-soft)]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Volume2 size={14} className="flex-shrink-0 text-[var(--app-text-tertiary)]" aria-hidden="true" />
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-[var(--app-text-tertiary)]')}>
          {selected ? selected.name : (allowUnset && !value ? t('voice.followDefault') : t('voice.placeholder'))}
        </span>
        {loading && <Loader2 size={14} className="animate-spin text-[var(--app-text-tertiary)]" />}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-[var(--app-radius-panel)] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--app-shadow-floating)]">
          <div className="flex items-center gap-1 border-b border-[var(--app-border-soft)] p-2">
            <Search size={14} className="flex-shrink-0 text-[var(--app-text-tertiary)]" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('voice.placeholder')}
              className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--app-text-tertiary)]"
              aria-label={t('voice.placeholder')}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="清除搜索" className="text-[var(--app-text-tertiary)] hover:text-[var(--app-text-secondary)]">
                <X size={14} />
              </button>
            )}
          </div>
          {showProviderFilter && (
            <div className="flex items-center gap-2 border-b border-[var(--app-border-soft)] px-2 py-1.5">
              {[
                { key: '', label: t('voice.allProviders') },
                { key: 'edge', label: t('voice.edge') },
                { key: 'fish_audio', label: t('voice.fish') },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setProvider(option.key)}
                  className={cn(
                    'rounded-[var(--app-radius-control)] px-2 py-1 text-xs transition-colors',
                    provider === option.key
                      ? 'bg-[var(--app-accent-soft)] text-[var(--app-accent)]'
                      : 'text-[var(--app-text-tertiary)] hover:bg-[var(--app-surface-hover)]',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          <ul role="listbox" className="max-h-56 overflow-y-auto p-1">
            {allowUnset && (
              <li role="option" aria-selected={value === ''}>
                <button
                  type="button"
                  onClick={() => { onChange(''); setOpen(false); }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-[var(--app-radius-control)] px-2 py-1.5 text-left text-sm hover:bg-[var(--app-surface-hover)]',
                    value === '' && 'bg-[var(--app-accent-soft)] text-[var(--app-accent)]',
                  )}
                >
                  <span className="flex-1 truncate text-[var(--app-text-secondary)]">{t('voice.followDefault')}</span>
                </button>
              </li>
            )}
            {filtered.map((item) => (
              <li key={item.voice_id} role="option" aria-selected={value === item.voice_id}>
                <div className={cn(
                  'flex w-full items-center gap-2 rounded-[var(--app-radius-control)] px-2 py-1.5 text-left text-sm hover:bg-[var(--app-surface-hover)]',
                  value === item.voice_id && 'bg-[var(--app-accent-soft)] text-[var(--app-accent)]',
                )}>
                  <button
                    type="button"
                    onClick={() => { onChange(item.voice_id); setOpen(false); }}
                    className="flex-1 truncate"
                  >
                    <span className="block truncate">{item.name}</span>
                    <span className="block truncate text-[11px] text-[var(--app-text-tertiary)]">
                      {(item.languages?.length ? item.languages.join('、') : '')}
                      {item.languages?.length ? ' · ' : ''}
                      {providerLabel(t, item)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => void preview(item.voice_id, event)}
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-tertiary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-accent)]"
                    title={t('voice.preview')}
                    aria-label={`${t('voice.preview')} ${item.name}`}
                  >
                    {previewing === item.voice_id
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Volume2 size={14} />}
                  </button>
                </div>
              </li>
            ))}
            {filtered.length === 0 && !loading && (
              <li className="px-2 py-3 text-center text-xs text-[var(--app-text-tertiary)]">{t('voice.noVoices')}</li>
            )}
            {loading && (
              <li className="px-2 py-3 text-center text-xs text-[var(--app-text-tertiary)]">{t('voice.loading')}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
