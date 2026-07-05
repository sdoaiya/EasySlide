import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkAccessCode, verifyAccessCode } from '@/api/endpoints';
import { useT } from '@/hooks/useT';

const STORAGE_KEY = 'easyslide-access-code';

const translations = {
  zh: {
    title: '本机访问口令',
    subtitle: '仅在你显式启用访问码时需要填写；本机默认直接进入工作台。',
    placeholder: '请输入本机访问口令',
    label: '访问口令',
    submit: '进入工作台',
    backHome: '返回工作台',
    error: '口令错误，请重试',
    networkError: '网络错误，请稍后重试',
  },
  en: {
    title: 'Local access code',
    subtitle: 'Only required when access-code protection is explicitly enabled. Local use opens directly by default.',
    placeholder: 'Enter local access code',
    label: 'Access code',
    submit: 'Enter workspace',
    backHome: 'Back to workspace',
    error: 'Invalid code, please try again',
    networkError: 'Network error, please try later',
  },
};

export function AccessCodeGuard({ children }: { children: ReactNode }) {
  const t = useT(translations);
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'prompt' | 'pass'>('loading');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const checkAccess = async () => {
    setStatus('loading');
    try {
      const res = await checkAccessCode();
      if (!res.data.enabled) { setStatus('pass'); return; }
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const v = await verifyAccessCode(saved);
        if (v.data.valid) { setStatus('pass'); return; }
        localStorage.removeItem(STORAGE_KEY);
      }
      setStatus('prompt');
    } catch {
      setStatus('pass');
    }
  };

  useEffect(() => { checkAccess(); }, []);

  const handleSubmit = async () => {
    if (!code.trim()) return;
    setVerifying(true);
    setError('');
    try {
      const res = await verifyAccessCode(code.trim());
      if (res.data.valid) {
        localStorage.setItem(STORAGE_KEY, code.trim());
        setStatus('pass');
      } else {
        setError(t('error'));
      }
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setError(status === 403 ? t('error') : t('networkError'));
    } finally {
      setVerifying(false);
    }
  };

  if (status === 'loading') return null;
  if (status === 'pass') return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">{t('title')}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{t('subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/app')}
            className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {t('backHome')}
          </button>
        </div>

        <form onSubmit={e => { e.preventDefault(); handleSubmit(); }} className="space-y-3">
          <input
            type="password"
            placeholder={t('placeholder')}
            value={code}
            onChange={e => setCode(e.target.value)}
            autoFocus
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            aria-label={t('label')}
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={verifying || !code.trim()}
            className="h-11 w-full rounded-xl bg-gradient-to-r from-sky-500 to-emerald-400 text-sm font-semibold text-white transition hover:shadow-lg disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-100 disabled:text-slate-400"
          >
            {verifying ? '...' : t('submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
