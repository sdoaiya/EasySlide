import { useNavigate } from 'react-router-dom';
import { MaterialGeneratorModal } from '@/components/shared/MaterialGeneratorModal';

export function MaterialGeneratePage() {
  const navigate = useNavigate();

  return (
    <main className="h-[calc(100dvh-var(--app-titlebar-offset,0px))] min-h-0 bg-[var(--app-background)] lg:pl-[var(--app-nav-offset,216px)]">
      <MaterialGeneratorModal isOpen onClose={() => navigate('/home')} presentation="workspace" />
    </main>
  );
}
