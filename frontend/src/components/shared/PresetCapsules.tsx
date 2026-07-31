import { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useT } from '@/hooks/useT';
import { Modal } from '@/components/shared/Modal';

// ─── i18n ────────────────────────────────────────────────────────────────────
const presetI18n = {
  zh: {
    preset: {
      addCustom: '自定义',
      modalTitle: '添加自定义预设',
      nameLabel: '预设名称',
      namePlaceholder: '例如：学术风格',
      contentLabel: '提示词内容',
      contentPlaceholder: '例如：使用学术论文的严谨表述，引用数据时标注来源',
      add: '添加',
      cancel: '取消',
    },
  },
  en: {
    preset: {
      addCustom: 'Custom',
      modalTitle: 'Add Custom Preset',
      nameLabel: 'Preset Name',
      namePlaceholder: 'e.g., Academic style',
      contentLabel: 'Prompt Content',
      contentPlaceholder: 'e.g., Use rigorous academic language, cite data sources',
      add: 'Add',
      cancel: 'Cancel',
    },
  },
};

// ─── Types ───────────────────────────────────────────────────────────────────
export interface Preset {
  name: string;
  content: string;
}

export type PresetType = 'outline' | 'description';

// ─── System presets ──────────────────────────────────────────────────────────
const SYSTEM_PRESETS: Record<PresetType, Record<'zh' | 'en', Preset[]>> = {
  outline: {
    zh: [],
    en: [],
  },
  description: {
    zh: [],
    en: [],
  },
};

const STORAGE_KEY_PREFIX = 'presetCapsules_';

function loadUserPresets(type: PresetType): Preset[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${type}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUserPresets(type: PresetType, presets: Preset[]) {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${type}`, JSON.stringify(presets));
}

// ─── Component ───────────────────────────────────────────────────────────────
interface PresetCapsulesProps {
  type: PresetType;
  onAppend: (text: string) => void;
}

export default function PresetCapsules({ type, onAppend }: PresetCapsulesProps) {
  const t = useT(presetI18n);
  const [userPresets, setUserPresets] = useState<Preset[]>(() => loadUserPresets(type));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newContent, setNewContent] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const { i18n } = useTranslation();
  const currentLang = i18n.language?.startsWith('zh') ? 'zh' : 'en';
  const systemPresets = SYSTEM_PRESETS[type][currentLang];

  useEffect(() => {
    if (isModalOpen && nameInputRef.current) {
      // Delay focus slightly to allow modal animation
      const timer = setTimeout(() => nameInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isModalOpen]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setNewName('');
    setNewContent('');
  }, []);

  const handleAddPreset = useCallback(() => {
    const trimmedName = newName.trim();
    const trimmedContent = newContent.trim();
    if (!trimmedName || !trimmedContent) return;

    const updated = [...userPresets, { name: trimmedName, content: trimmedContent }];
    setUserPresets(updated);
    saveUserPresets(type, updated);
    handleCloseModal();
  }, [newName, newContent, userPresets, type, handleCloseModal]);

  const handleDeletePreset = useCallback((index: number) => {
    const updated = userPresets.filter((_, i) => i !== index);
    setUserPresets(updated);
    saveUserPresets(type, updated);
  }, [userPresets, type]);

  const capsuleBase = 'inline-flex min-h-8 max-w-[200px] cursor-pointer items-center gap-1 truncate rounded-[var(--app-radius-control)] px-2.5 py-1 text-xs transition-colors';
  const systemCapsule = `${capsuleBase} border border-[var(--app-border)] bg-[var(--app-surface-hover)] text-[var(--app-text-secondary)] hover:border-[var(--app-accent)] hover:text-[var(--app-accent)]`;
  const userCapsule = `${capsuleBase} border border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent)] hover:bg-[var(--app-surface-hover)]`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 mt-2" data-testid={`${type}-presets`}>
        {/* System presets */}
        {systemPresets.map((preset, i) => (
          <button
            key={`sys-${i}`}
            type="button"
            data-testid={`${type}-system-preset-${i}`}
            className={systemCapsule}
            title={preset.content}
            onClick={() => onAppend(preset.content)}
          >
            {preset.name}
          </button>
        ))}

        {/* User presets */}
        {userPresets.map((preset, i) => (
          <span
            key={`usr-${i}`}
            className={userCapsule}
            title={preset.content}
            data-testid={`${type}-user-preset-${i}`}
          >
            <button
              type="button"
              className="truncate"
              onClick={() => onAppend(preset.content)}
            >
              {preset.name}
            </button>
            <button
              type="button"
              data-testid={`${type}-delete-preset-${i}`}
              aria-label="Delete preset"
              className="ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] transition-colors hover:bg-[var(--app-surface-hover)]"
              onClick={(e) => { e.stopPropagation(); handleDeletePreset(i); }}
            >
              <X size={12} />
            </button>
          </span>
        ))}

        {/* Add button */}
        <button
          type="button"
          data-testid={`${type}-add-preset`}
          onClick={() => setIsModalOpen(true)}
          className={`${capsuleBase} border border-dashed border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-tertiary)] hover:border-[var(--app-accent)] hover:text-[var(--app-accent)]`}
        >
          <Plus size={10} />
          {t('preset.addCustom')}
        </button>
      </div>

      {/* Add preset modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={t('preset.modalTitle')}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--app-text-secondary)]">
              {t('preset.nameLabel')}
            </label>
            <input
              ref={nameInputRef}
              data-testid={`${type}-preset-name-input`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('preset.namePlaceholder')}
              className="w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] transition-colors placeholder:text-[var(--app-text-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--app-text-secondary)]">
              {t('preset.contentLabel')}
            </label>
            <textarea
              data-testid={`${type}-preset-content-input`}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder={t('preset.contentPlaceholder')}
              rows={3}
              className="w-full resize-y rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] transition-colors placeholder:text-[var(--app-text-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              data-testid={`${type}-preset-cancel`}
              onClick={handleCloseModal}
              className="rounded-[var(--app-radius-control)] px-4 py-2 text-sm text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-surface-hover)]"
            >
              {t('preset.cancel')}
            </button>
            <button
              type="button"
              data-testid={`${type}-preset-confirm`}
              onClick={handleAddPreset}
              disabled={!newName.trim() || !newContent.trim()}
                  className="rounded-[var(--app-radius-control)] bg-[var(--app-primary-action)] px-4 py-2 text-sm text-[var(--app-surface)] transition-colors hover:bg-[var(--app-primary-action-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('preset.add')}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
