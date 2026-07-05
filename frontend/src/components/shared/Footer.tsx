import React from 'react';
import { useTranslation } from 'react-i18next';
import { getStaticAssetUrl } from '@/api/client';

const qrCells = [
  1, 1, 1, 0, 1, 1, 1,
  1, 0, 1, 0, 1, 0, 1,
  1, 1, 1, 1, 1, 1, 1,
  0, 1, 0, 1, 0, 1, 0,
  1, 1, 0, 0, 1, 1, 1,
  1, 0, 1, 1, 0, 0, 1,
  1, 1, 1, 0, 1, 1, 1,
];

export const Footer: React.FC = () => {
  const { i18n } = useTranslation();

  if (!i18n.language?.startsWith('zh')) {
    return (
      <footer className="relative w-full border-t border-sky-100 bg-white py-10 px-6 mt-auto">
        <div className="max-w-7xl mx-auto grid gap-8 lg:grid-cols-[1fr_auto] text-sm text-slate-500">
          <div>
            <div className="flex items-center gap-2 font-semibold text-cyan-700">
              <img src={getStaticAssetUrl('/logo-nav.png')} alt="EasySlide Logo" className="w-8 h-8 rounded-full" />
              <span>EasySlide</span>
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-950">AI presentation workspace</h2>
            <p className="mt-2 max-w-3xl leading-7">EasySlide is an AI presentation workspace for generating, editing, refining, and exporting polished slide decks.</p>
            <p className="mt-2 max-w-3xl leading-7">Start from a prompt, an outline, a description, or an existing PDF / PPTX, then continue refining content, layout, and visual direction.</p>
            <p className="mt-4 text-xs text-slate-400">© 2026 EasySlide. All rights reserved.</p>
          </div>
          <div className="grid gap-3 text-slate-500">
            <div className="font-medium text-slate-700">Public pages:</div>
            <a href="/privacy" className="hover:text-cyan-700">Privacy</a>
            <a href="/terms" className="hover:text-cyan-700">Terms</a>
            <a href="/cookies" className="hover:text-cyan-700">Cookies</a>
          </div>
        </div>
        <nav
          aria-label="Footer utility shortcuts"
          className="fixed bottom-4 left-1/2 z-40 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-500 shadow-lg shadow-slate-200/60 backdrop-blur md:flex"
        >
          <a href="/privacy" className="rounded-full px-3 py-1.5 hover:bg-sky-50 hover:text-cyan-700">Privacy</a>
          <a href="/terms" className="rounded-full px-3 py-1.5 hover:bg-sky-50 hover:text-cyan-700">Terms</a>
          <a href="/cookies" className="rounded-full px-3 py-1.5 hover:bg-sky-50 hover:text-cyan-700">Cookies</a>
        </nav>
      </footer>
    );
  }

  return (
    <footer className="relative w-full border-t border-sky-100 bg-white py-10 px-6 mt-auto">
      <div className="max-w-7xl mx-auto grid gap-8 lg:grid-cols-[1fr_auto] text-sm text-slate-500">
        <div>
          <div className="flex items-center gap-2 font-semibold text-cyan-700">
            <img src={getStaticAssetUrl('/logo-nav.png')} alt="EasySlide Logo" className="w-8 h-8 rounded-full" />
            <span>EasySlide</span>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-950">让 PPT 创作更舒适自然</h2>
          <p className="mt-2 max-w-3xl leading-7">让 AI 协助完成从构思到成稿的 PPT 创作流程</p>
          <p className="mt-2 max-w-3xl leading-7">EasySlide 帮你从一句想法开始生成大纲与页面内容，并持续优化内容、版式与风格。支持参考文件、资产复用与模板复用，让整个演示流程更轻松、更清晰，也更容易掌控。</p>
          <p className="mt-4 text-xs text-slate-400">© 2026 EasySlide. 保留所有权利。</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 text-slate-500">
          <div className="flex flex-wrap gap-2">
            <a href="/contact" className="hover:text-cyan-700">联系我们</a>
            <span>/</span>
            <a href="/feedback" className="hover:text-cyan-700">建议与反馈</a>
          </div>
          <a href="/qq" className="hover:text-cyan-700">扫码加入QQ群</a>
          <a href="/follow" className="hover:text-cyan-700">关注我们</a>
          <a href="/copyright" className="hover:text-cyan-700">版权投诉</a>
          <a href="/abuse" className="hover:text-cyan-700">滥用举报</a>
          <div className="flex flex-wrap gap-3 pt-2">
            <a href="/privacy" className="hover:text-cyan-700">隐私政策</a>
            <a href="/terms" className="hover:text-cyan-700">服务条款</a>
            <a href="/cookies" className="hover:text-cyan-700">Cookie 政策</a>
          </div>
          <div className="mt-3 w-36 rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-sm">
            <div className="text-xs font-medium text-slate-600">扫描加入QQ群</div>
            <div role="img" aria-label="扫码加入QQ群二维码" className="mx-auto mt-2 grid h-24 w-24 grid-cols-7 gap-0.5 rounded-xl bg-slate-50 p-2">
              {qrCells.map((filled, index) => (
                <span key={index} aria-hidden="true" className={filled ? 'rounded-[2px] bg-slate-950' : 'rounded-[2px] bg-white'} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <nav
        aria-label="底部悬浮工具条"
        className="fixed bottom-4 left-1/2 z-40 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-500 shadow-lg shadow-slate-200/60 backdrop-blur md:flex"
      >
        <a href="/privacy" className="rounded-full px-3 py-1.5 hover:bg-sky-50 hover:text-cyan-700">隐私政策</a>
        <a href="/terms" className="rounded-full px-3 py-1.5 hover:bg-sky-50 hover:text-cyan-700">服务条款</a>
        <a href="/cookies" className="rounded-full px-3 py-1.5 hover:bg-sky-50 hover:text-cyan-700">Cookie 政策</a>
      </nav>
      <div
        role="group"
        aria-label="页面快捷入口"
        className="fixed bottom-4 right-5 z-40 hidden items-center gap-2 rounded-full border border-slate-200 bg-white/90 p-2 text-xs text-slate-500 shadow-lg shadow-slate-200/60 backdrop-blur md:flex"
      >
        <a href="/feedback" aria-label="反馈" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-sky-50 hover:text-cyan-700">馈</a>
        <a href="/qq" aria-label="社群" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-sky-50 hover:text-cyan-700">群</a>
      </div>
    </footer>
  );
};
