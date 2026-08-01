import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronRight,
  Command,
  FileOutput,
  Github,
  Layers3,
  Menu,
  Play,
  ScanText,
  Sparkles,
  X,
} from 'lucide-react';

const GITHUB_URL = 'https://github.com/sdoaiya/EasySlide';

const capabilities = [
  { index: '01', title: '从想法开始', body: '输入一句话、长文或已有资料，先把叙事方向理清。', icon: Sparkles, tone: 'coral' },
  { index: '02', title: '内容变成结构', body: 'AI 把素材拆成大纲、页面描述与每一页的视觉重点。', icon: ScanText, tone: 'blue' },
  { index: '03', title: '细节继续打磨', body: '编辑文案、替换素材、调整主题，让成稿保持你的判断。', icon: Layers3, tone: 'yellow' },
  { index: '04', title: '交付不再返工', body: '导出 PPTX、PDF、图片或视频，统一追踪每一个任务。', icon: FileOutput, tone: 'green' },
];

const workflow = [
  { number: '01', title: 'Content Spine', detail: '先锁定核心信息与叙事顺序' },
  { number: '02', title: 'PPT Workspace', detail: '把结构变成可编辑的页面' },
  { number: '03', title: 'Media & Export', detail: '补齐素材并交付最终版本' },
];

const caseStudies = [
  { image: '/case/case1-thumb.webp', title: 'Product narrative', meta: 'STRATEGY / 12 SLIDES' },
  { image: '/case/case2-thumb.webp', title: 'Research made clear', meta: 'REPORT / 18 SLIDES' },
  { image: '/case/case3-thumb.webp', title: 'A sharper pitch', meta: 'FUNDRAISING / 10 SLIDES' },
];

function ProductPreview() {
  return (
    <div className="landing-product-preview" aria-label="EasySlide 工作台预览">
      <div className="preview-topbar">
        <div className="preview-dots" aria-hidden="true"><i /><i /><i /></div>
        <div className="preview-brand"><img src="/logo-nav-transparent.png" alt="" /> <span>EasySlide</span></div>
        <span className="preview-status"><span /> synced</span>
      </div>
      <div className="preview-body">
        <aside className="preview-sidebar">
          <div className="preview-sidebar-mark"><Command size={13} /></div>
          <div className="preview-sidebar-line active" />
          <div className="preview-sidebar-line" />
          <div className="preview-sidebar-line" />
          <div className="preview-sidebar-line short" />
          <div className="preview-sidebar-line" />
        </aside>
        <div className="preview-main">
          <div className="preview-heading">
            <div><span className="preview-kicker">PROJECT / PRODUCT STRATEGY</span><strong>From signal to story</strong></div>
            <span className="preview-page-count">06 / 12</span>
          </div>
          <div className="preview-canvas">
            <div className="canvas-grid" />
            <div className="canvas-copy"><span>01 — CONTEXT</span><strong>Make the<br /><em>next move</em><br />obvious.</strong><small>Turn complex research into a clear visual argument.</small></div>
            <div className="canvas-shape shape-one" /><div className="canvas-shape shape-two" /><div className="canvas-shape shape-three" />
            <div className="canvas-caption">EASYSLIDE / 2026</div>
          </div>
          <div className="preview-thumbnails"><span className="thumb selected">01</span><span className="thumb">02</span><span className="thumb">03</span><span className="thumb">04</span><span className="thumb">05</span><span className="thumb add">+</span></div>
        </div>
        <aside className="preview-inspector"><span className="inspector-label">DESIGN SYSTEM</span><div className="inspector-rule" /><div className="inspector-row"><span>Typography</span><b>Inter / 48</b></div><div className="inspector-row"><span>Accent</span><i className="swatch coral" /><i className="swatch blue" /><i className="swatch yellow" /></div><div className="inspector-block" /><div className="inspector-block small" /><div className="inspector-button"><Play size={11} fill="currentColor" /> Preview</div></aside>
      </div>
    </div>
  );
}

function LandingPage() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!('IntersectionObserver' in window)) {
      items.forEach((item) => item.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }), { threshold: 0.14 });
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  const goToCreate = () => {
    setMenuOpen(false);
    navigate('/create');
  };

  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="官网导航">
        <button className="landing-logo" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="EasySlide 首页">
          <img src="/logo-nav-transparent.png" alt="EasySlide" />
          <span>EasySlide</span>
        </button>
        <div className={`landing-nav-links ${menuOpen ? 'open' : ''}`}>
          <a href="#capabilities" onClick={() => setMenuOpen(false)}>能力</a>
          <a href="#workflow" onClick={() => setMenuOpen(false)}>工作流</a>
          <a href="#opensource" onClick={() => setMenuOpen(false)}>开源</a>
          <button className="nav-github" type="button" onClick={() => window.open(GITHUB_URL, '_blank', 'noopener,noreferrer')}><Github size={15} /> GitHub <ArrowUpRight size={14} /></button>
          <button className="nav-cta mobile-only" type="button" onClick={goToCreate}>开始创作 <ChevronRight size={15} /></button>
        </div>
        <button className="nav-menu" type="button" onClick={() => setMenuOpen((value) => !value)} aria-label={menuOpen ? '关闭菜单' : '打开菜单'} aria-expanded={menuOpen}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
        <button className="nav-cta desktop-only" type="button" onClick={goToCreate}>开始创作 <ChevronRight size={15} /></button>
      </nav>

      <section className="landing-hero">
        <div className="hero-grid-lines" aria-hidden="true" />
        <div className="landing-container hero-layout">
          <div className="hero-copy">
            <p className="hero-eyebrow"><span className="eyebrow-dot" /> AI PRESENTATION WORKSPACE <span className="eyebrow-year">/ 2026</span></p>
            <h1>让每一页，<br /><span>都有清晰的下一步。</span></h1>
            <p className="hero-lead">从一句话到一份真正能拿去沟通的演示文稿。EasySlide 把内容、结构、视觉和交付放进同一个创作工作台。</p>
            <div className="hero-actions"><button className="button-dark" type="button" onClick={goToCreate}>从想法开始 <ArrowUpRight size={17} /></button><a className="button-outline" href="#workflow"><Play size={15} fill="currentColor" /> 看看它如何工作</a></div>
            <div className="hero-proof"><span><strong>4</strong> 个工作区</span><span className="proof-separator" /><span><strong>∞</strong> 次迭代</span><span className="proof-separator" /><span><strong>100%</strong> 可编辑</span></div>
          </div>
          <div className="hero-visual" data-reveal><div className="visual-index">DESIGN / 001 <ArrowDown size={13} /></div><ProductPreview /><div className="visual-note note-left">STRUCTURE<br /><strong>→</strong> clarity</div><div className="visual-note note-right">LIVE<br /><strong>●</strong> ready</div></div>
        </div>
        <a className="scroll-cue" href="#capabilities"><span>向下探索</span><ArrowDown size={15} /></a>
      </section>

      <section id="capabilities" className="landing-section capabilities-section">
        <div className="landing-container">
          <div className="section-intro" data-reveal><p className="section-label">THE WHOLE PICTURE</p><h2>不是替你做决定。<br /><em>是让决定更容易被看见。</em></h2><p>好的演示不是信息的堆积，而是让听众知道应该记住什么、相信什么，以及下一步是什么。</p></div>
          <div className="capability-grid">{capabilities.map(({ index, title, body, icon: Icon, tone }, itemIndex) => <article className={`capability-item tone-${tone}`} data-reveal key={title} style={{ transitionDelay: `${itemIndex * 70}ms` }}><div className="capability-top"><span>{index}</span><Icon size={20} strokeWidth={1.6} /></div><h3>{title}</h3><p>{body}</p><span className="capability-arrow"><ArrowUpRight size={16} /></span></article>)}</div>
        </div>
      </section>

      <section id="workflow" className="landing-section workflow-section">
        <div className="landing-container workflow-layout">
          <div className="workflow-copy" data-reveal><p className="section-label">ONE CONTINUOUS THREAD</p><h2>从内容主线，<br /><em>到最终交付。</em></h2><p>项目不被拆散在不同工具里。每次修改都有来处，每个输出都有去处。</p><a className="text-link" href={GITHUB_URL} target="_blank" rel="noreferrer">在 GitHub 查看项目 <ArrowUpRight size={15} /></a></div>
          <div className="workflow-track">{workflow.map(({ number, title, detail }, index) => <div className="workflow-step" data-reveal key={title} style={{ transitionDelay: `${index * 100}ms` }}><div className="step-number">{number}</div><div className="step-line" /><div><h3>{title}</h3><p>{detail}</p></div><Check size={16} className="step-check" /></div>)}</div>
        </div>
      </section>

      <section className="landing-section showcase-section"><div className="landing-container"><div className="showcase-header" data-reveal><div><p className="section-label">SELECTED OUTPUTS</p><h2>把复杂的内容，<br /><em>做成值得被记住的页面。</em></h2></div><span>Built in EasySlide <ArrowUpRight size={15} /></span></div><div className="showcase-grid">{caseStudies.map(({ image, title, meta }, index) => <a className={`showcase-card showcase-card-${index + 1}`} data-reveal href={GITHUB_URL} target="_blank" rel="noreferrer" key={title} style={{ transitionDelay: `${index * 90}ms` }}><div className="showcase-image"><img src={image} alt={title} loading="lazy" /></div><div className="showcase-meta"><span>{meta}</span><strong>{title}</strong><ArrowUpRight size={16} /></div></a>)}</div></div></section>

      <section className="landing-section evidence-section"><div className="landing-container"><div className="evidence-header" data-reveal><p className="section-label">BUILT FOR THE LAST 10%</p><h2>生成只是起点。<br /><em>完成，才是产品。</em></h2></div><div className="evidence-board" data-reveal><div className="evidence-board-top"><span>DELIVERY BOARD</span><span>ALL SYSTEMS <b>●</b></span></div><div className="evidence-columns"><div><span className="column-label">CONTENT</span><strong>Content Spine</strong><p>叙事清晰 · 来源可追踪</p></div><div><span className="column-label">DESIGN</span><strong>Editable PPT</strong><p>主题统一 · 页面可调</p></div><div><span className="column-label">DELIVERY</span><strong>Export Center</strong><p>进度透明 · 结果可取</p></div></div><div className="evidence-progress"><span /><span /><span /></div></div></div></section>

      <section id="opensource" className="landing-section open-source-section"><div className="landing-container open-source-inner" data-reveal><div><p className="section-label">OPEN SOURCE, OPEN ENDED</p><h2>把工作台带回<br /><em>你的创作方式。</em></h2><p>EasySlide 是一个持续演进的开源项目。看看它如何工作，也欢迎把你的想法带进来。</p></div><a className="github-card" href={GITHUB_URL} target="_blank" rel="noreferrer"><span className="github-card-icon"><Github size={24} /></span><span><strong>GitHub / sdoaiya / EasySlide</strong><small>查看源代码与项目进展</small></span><ArrowUpRight size={19} /></a></div></section>

      <footer className="landing-footer"><div className="landing-container"><div className="footer-main"><div><button className="landing-logo footer-logo" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><img src="/logo-nav-transparent.png" alt="EasySlide" /><span>EasySlide</span></button><p>Give every idea a clearer next step.</p></div><div className="footer-links"><a href="#capabilities">能力</a><a href="#workflow">工作流</a><a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={13} /></a></div></div><div className="footer-bottom"><span>© 2026 EasySlide</span><span>Made for ideas that need to move.</span></div></div></footer>
    </main>
  );
}

export { LandingPage };
