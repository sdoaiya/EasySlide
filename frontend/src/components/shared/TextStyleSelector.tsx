import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ImagePlus, Loader2, Save, X } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { Textarea } from './Textarea';
import { PRESET_STYLES } from '@/config/presetStyles';
import { presetStylesI18n } from '@/config/presetStylesI18n';
import {
  extractStyleFromImage,
  listUserStyleTemplates,
  createUserStyleTemplate,
  deleteUserStyleTemplate,
  type UserStyleTemplate,
} from '@/api/endpoints';

const STYLE_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899',
];

const i18n = {
  zh: {
    presetStyles: presetStylesI18n.zh,
    stylePlaceholder: '描述您想要的 PPT 风格，例如：简约商务风格，使用蓝色和白色配色，字体清晰大方...',
    presetStylesLabel: '预设风格：',
    myStylesLabel: '我的风格：',
    styleTip: '提示：点击预设风格快速填充，或自定义描述风格、配色、布局等要求',
    extractFromImage: '从图片提取风格',
    extracting: '提取中...',
    extractSuccess: '风格提取成功',
    extractFailed: '风格提取失败',
    saveAsTemplate: '保存为模板',
    saveStyle: '保存',
    cancel: '取消',
    styleName: '风格名称',
    styleNamePlaceholder: '输入风格名称...',
    saveSuccess: '风格模板已保存',
    saveFailed: '保存失败',
    deleteSuccess: '风格模板已删除',
    deleteFailed: '删除失败',
    noContent: '请先输入风格描述',
  },
  en: {
    presetStyles: presetStylesI18n.en,
    stylePlaceholder: 'Describe your desired PPT style, e.g., minimalist business style...',
    presetStylesLabel: 'Preset styles:',
    myStylesLabel: 'My styles:',
    styleTip: 'Tip: Click preset styles to quick fill, or customize',
    extractFromImage: 'Extract from image',
    extracting: 'Extracting...',
    extractSuccess: 'Style extracted successfully',
    extractFailed: 'Style extraction failed',
    saveAsTemplate: 'Save as template',
    saveStyle: 'Save',
    cancel: 'Cancel',
    styleName: 'Style name',
    styleNamePlaceholder: 'Enter style name...',
    saveSuccess: 'Style template saved',
    saveFailed: 'Save failed',
    deleteSuccess: 'Style template deleted',
    deleteFailed: 'Delete failed',
    noContent: 'Please enter a style description first',
  },
};

interface TextStyleSelectorProps {
  value: string;
  onChange: (value: string) => void;
  onToast?: (msg: { message: string; type: 'success' | 'error' }) => void;
}

export const TextStyleSelector: React.FC<TextStyleSelectorProps> = ({ value, onChange, onToast }) => {
  const t = useT(i18n);
  const [hoveredPresetId, setHoveredPresetId] = useState<string | null>(null);
  const [isExtractingStyle, setIsExtractingStyle] = useState(false);
  const styleImageInputRef = useRef<HTMLInputElement>(null);

  const [userStyles, setUserStyles] = useState<UserStyleTemplate[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveColor, setSaveColor] = useState(STYLE_COLORS[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [hoveredUserStyleId, setHoveredUserStyleId] = useState<string | null>(null);

  const loadUserStyles = useCallback(async () => {
    try {
      const res = await listUserStyleTemplates();
      if (res.data?.templates) setUserStyles(res.data.templates);
    } catch { /* ignore load failure */ }
  }, []);

  useEffect(() => { loadUserStyles(); }, [loadUserStyles]);

  const handleSave = async () => {
    if (!value.trim()) {
      onToast?.({ message: t('noContent'), type: 'error' });
      return;
    }
    if (!saveName.trim()) return;
    setIsSaving(true);
    try {
      await createUserStyleTemplate({ name: saveName.trim(), description: value.trim(), color: saveColor });
      onToast?.({ message: t('saveSuccess'), type: 'success' });
      setShowSaveDialog(false);
      setSaveName('');
      setSaveColor(STYLE_COLORS[0]);
      loadUserStyles();
    } catch {
      onToast?.({ message: t('saveFailed'), type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteUserStyleTemplate(id);
      onToast?.({ message: t('deleteSuccess'), type: 'success' });
      setUserStyles((prev) => prev.filter((s) => s.id !== id));
    } catch {
      onToast?.({ message: t('deleteFailed'), type: 'error' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Textarea
          placeholder={t('stylePlaceholder')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="pr-24 text-sm"
        />
        <button
          type="button"
          onClick={() => {
            if (!value.trim()) {
              onToast?.({ message: t('noContent'), type: 'error' });
              return;
            }
            setSaveColor(STYLE_COLORS[Math.floor(Math.random() * STYLE_COLORS.length)]);
            setShowSaveDialog(true);
          }}
          className="absolute right-2 top-2 flex items-center gap-1 rounded-[var(--app-radius-control)] px-2 py-1 text-xs font-medium text-[var(--app-text-tertiary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-accent)]"
        >
          <Save size={12} />
          {t('saveAsTemplate')}
        </button>
      </div>

      {showSaveDialog && (
        <div className="flex items-center gap-2 rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] p-3">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder={t('styleNamePlaceholder')}
            className="flex-1 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 text-sm text-[var(--app-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)]"
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            autoFocus
          />
          <div className="flex gap-1">
            {STYLE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSaveColor(c)}
                className={`h-5 w-5 rounded-full ring-1 ring-[var(--app-border)] transition-transform ${saveColor === c ? 'scale-125 ring-2 ring-[var(--app-accent)]' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !saveName.trim()}
            className="rounded-[var(--app-radius-control)] bg-[var(--app-primary-action)] px-3 py-1 text-xs font-medium text-[var(--app-surface)] transition-colors hover:bg-[var(--app-primary-action-hover)] disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={12} className="animate-spin" /> : t('saveStyle')}
          </button>
          <button
            type="button"
            onClick={() => { setShowSaveDialog(false); setSaveName(''); }}
            className="p-1 text-[var(--app-text-tertiary)] transition-colors hover:text-[var(--app-text)]"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {userStyles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--app-text-tertiary)]">
            {t('myStylesLabel')}
          </p>
          <div className="flex flex-wrap gap-2">
            {userStyles.map((style) => (
              <div key={style.id} className="relative group">
                <button
                  type="button"
                  onClick={() => onChange(style.description)}
                  onMouseEnter={() => setHoveredUserStyleId(style.id)}
                  onMouseLeave={() => setHoveredUserStyleId(null)}
                  className="flex items-center gap-1.5 rounded-[var(--app-radius-control)] border border-[var(--app-accent)] bg-[var(--app-accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--app-accent)] transition-colors hover:bg-[var(--app-surface-hover)]"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-[var(--app-border)]"
                    style={{ backgroundColor: style.color || STYLE_COLORS[0] }}
                  />
                  {style.name}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(style.id); }}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[var(--app-error)] text-[var(--app-surface)] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:opacity-90"
                >
                  <X size={10} />
                </button>
                {hoveredUserStyleId === style.id && (
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="w-64 max-w-xs rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5 shadow-[var(--app-shadow-soft)]">
                      <p className="line-clamp-4 text-xs text-[var(--app-text-tertiary)]">
                        {style.description}
                      </p>
                    </div>
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                      <div className="h-3 w-3 rotate-45 border-b border-r border-[var(--app-border)] bg-[var(--app-surface)]" />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-[var(--app-text-tertiary)]">
          {t('presetStylesLabel')}
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESET_STYLES.map((preset) => (
            <div key={preset.id} className="relative">
              <button
                type="button"
                onClick={() => onChange(t(preset.descriptionKey))}
                onMouseEnter={() => setHoveredPresetId(preset.id)}
                onMouseLeave={() => setHoveredPresetId(null)}
                className="flex items-center gap-1.5 rounded-[var(--app-radius-control)] border border-[var(--app-border)] px-3 py-1.5 text-xs font-medium text-[var(--app-text-secondary)] transition-colors hover:border-[var(--app-accent)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-accent)]"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-[var(--app-border)]"
                  style={{ backgroundColor: preset.color }}
                />
                {t(preset.nameKey)}
              </button>
              {hoveredPresetId === preset.id && preset.previewImage && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="w-72 rounded-[var(--app-radius-card)] border border-[var(--app-accent)] bg-[var(--app-surface)] p-2.5 shadow-[var(--app-shadow-soft)]">
                    <img
                      src={preset.previewImage}
                      alt={t(preset.nameKey)}
                      className="w-full h-40 object-cover rounded"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <p className="mt-2 line-clamp-3 px-1 text-xs text-[var(--app-text-tertiary)]">
                      {t(preset.descriptionKey)}
                    </p>
                  </div>
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                    <div className="h-3 w-3 rotate-45 border-b border-r border-[var(--app-accent)] bg-[var(--app-surface)]" />
                  </div>
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() => styleImageInputRef.current?.click()}
            disabled={isExtractingStyle}
            className="flex items-center gap-1 rounded-[var(--app-radius-control)] border border-dashed border-[var(--app-border)] px-3 py-1.5 text-xs font-medium text-[var(--app-text-secondary)] transition-colors hover:border-[var(--app-accent)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-accent)]"
          >
            {isExtractingStyle ? (
              <><Loader2 size={12} className="animate-spin" />{t('extracting')}</>
            ) : (
              <><ImagePlus size={12} />{t('extractFromImage')}</>
            )}
          </button>
          <input
            ref={styleImageInputRef}
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              e.target.value = '';
              setIsExtractingStyle(true);
              try {
                const result = await extractStyleFromImage(file);
                if (result.data?.style_description) {
                  onChange(result.data.style_description);
                  onToast?.({ message: t('extractSuccess'), type: 'success' });
                }
              } catch (error: any) {
                onToast?.({ message: `${t('extractFailed')}: ${error?.message || ''}`, type: 'error' });
              } finally {
                setIsExtractingStyle(false);
              }
            }}
            className="hidden"
          />
        </div>
      </div>

      <p className="text-xs text-[var(--app-text-tertiary)]">
        {t('styleTip')}
      </p>
    </div>
  );
};
