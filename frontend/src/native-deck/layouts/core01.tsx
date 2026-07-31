import type { NativeLayoutComponentProps } from '../types'
import { FlintChart } from '@/components/native-deck/FlintChart'

function text(props: Record<string, unknown>, key: string) {
  return typeof props[key] === 'string' ? props[key] : ''
}

function items(props: Record<string, unknown>, key: string) {
  const value = props[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function Core01Cover({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-cover">
      <div className="core01-cover-mark" />
      <div className="core01-cover-copy">
        <p className="core01-kicker">{text(props, 'kicker')}</p>
        <h1>{text(props, 'title')}</h1>
        <p className="core01-cover-subtitle">{text(props, 'subtitle')}</p>
      </div>
      <div className="core01-page-number">01</div>
    </section>
  )
}

export function Core01Agenda({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-content core01-agenda">
      <header className="core01-header">
        <span>01</span>
        <h2>{text(props, 'title')}</h2>
      </header>
      <div className="core01-agenda-grid">
        {items(props, 'items').map((item, index) => (
          <article className="core01-agenda-item" key={`${index}-${item}`}>
            <strong>{String(index + 1).padStart(2, '0')}</strong>
            <p>{item}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export function Core01Metrics({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-content core01-metrics">
      <header className="core01-header">
        <span>02</span>
        <h2>{text(props, 'title')}</h2>
      </header>
      <div className="core01-metric-grid">
        {items(props, 'metrics').map((metric, index) => (
          <article className="core01-metric" key={`${index}-${metric}`}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <p>{metric}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export function Core01Comparison({ props }: NativeLayoutComponentProps) {
  const columns = [
    { title: text(props, 'leftTitle'), points: items(props, 'leftPoints') },
    { title: text(props, 'rightTitle'), points: items(props, 'rightPoints') },
  ]

  return (
    <section className="native-layout core01-content core01-comparison">
      <header className="core01-header">
        <span>03</span>
        <h2>{text(props, 'title')}</h2>
      </header>
      <div className="core01-comparison-grid">
        {columns.map((column, columnIndex) => (
          <article className="core01-comparison-column" key={columnIndex}>
            <div className="core01-comparison-label">{String(columnIndex + 1).padStart(2, '0')}</div>
            <h3>{column.title}</h3>
            <ul>
              {column.points.map((point, index) => <li key={`${index}-${point}`}>{point}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}

export function Core01Process({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-content core01-process">
      <header className="core01-header">
        <span>04</span>
        <h2>{text(props, 'title')}</h2>
      </header>
      <div className="core01-process-row">
        {items(props, 'steps').map((step, index) => (
          <article className="core01-process-step" key={`${index}-${step}`}>
            <strong>{String(index + 1).padStart(2, '0')}</strong>
            <p>{step}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export function Core01Case({ props }: NativeLayoutComponentProps) {
  const image = text(props, 'image')
  const title = text(props, 'title')

  return (
    <section className="native-layout core01-case">
      <div className="core01-case-copy">
        <p className="core01-kicker">{text(props, 'kicker')}</p>
        <h2>{title}</h2>
        <p className="core01-case-summary">{text(props, 'summary')}</p>
      </div>
      <div className="core01-case-media">
        {image ? <img src={image} alt={title} /> : <div className="core01-case-placeholder" />}
      </div>
    </section>
  )
}

export function Core01Statement({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-statement">
      <div className="core01-statement-index">POINT / 01</div>
      <div className="core01-statement-copy">
        <p className="core01-kicker">{text(props, 'kicker')}</p>
        <h2>{text(props, 'title')}</h2>
        <p className="core01-statement-summary">{text(props, 'summary')}</p>
      </div>
      <ol className="core01-statement-points">
        {items(props, 'points').map((point, index) => (
          <li key={`${index}-${point}`}>
            <strong>{String(index + 1).padStart(2, '0')}</strong>
            <span>{point}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function Core01Evidence({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-content core01-evidence">
      <header className="core01-header">
        <span>DATA</span>
        <h2>{text(props, 'title')}</h2>
      </header>
      <div className="core01-evidence-body">
        <p className="core01-evidence-summary">{text(props, 'summary')}</p>
        <div className="core01-evidence-grid">
          {items(props, 'metrics').map((metric, index) => (
            <article key={`${index}-${metric}`}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <p>{metric}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Core01Narrative({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-content core01-narrative">
      <div className="core01-narrative-heading">
        <p className="core01-kicker">{text(props, 'kicker')}</p>
        <h2>{text(props, 'title')}</h2>
        <p>{text(props, 'summary')}</p>
      </div>
      <ol className="core01-narrative-steps">
        {items(props, 'steps').map((step, index) => (
          <li key={`${index}-${step}`}>
            <strong>{String(index + 1).padStart(2, '0')}</strong>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function Core01Risk({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-content core01-risk">
      <header className="core01-header">
        <span>RISK</span>
        <h2>{text(props, 'title')}</h2>
      </header>
      <div className="core01-risk-body">
        <p>{text(props, 'summary')}</p>
        <ol>
          {items(props, 'risks').map((risk, index) => (
            <li key={`${index}-${risk}`}><strong>{String(index + 1).padStart(2, '0')}</strong><span>{risk}</span></li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export function Core01Decision({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-decision">
      <div className="core01-decision-copy">
        <p className="core01-kicker">{text(props, 'kicker')}</p>
        <h2>{text(props, 'title')}</h2>
        <p>{text(props, 'recommendation')}</p>
      </div>
      <div className="core01-decision-options">
        <span>DECISION FRAME</span>
        <ol>
          {items(props, 'options').map((option, index) => (
            <li key={`${index}-${option}`}><strong>{String(index + 1).padStart(2, '0')}</strong><p>{option}</p></li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export function Core01ImageStory({ props }: NativeLayoutComponentProps) {
  const image = text(props, 'image')
  const title = text(props, 'title')
  return (
    <section className="native-layout core01-image-story">
      <div className="core01-image-story-media">
        {image ? <img src={image} alt={title} /> : <div className="core01-case-placeholder" />}
        <span>{text(props, 'caption')}</span>
      </div>
      <div className="core01-image-story-copy">
        <p className="core01-kicker">{text(props, 'kicker')}</p>
        <h2>{title}</h2>
        <p>{text(props, 'summary')}</p>
      </div>
    </section>
  )
}

export function Core01Quote({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-quote">
      <p className="core01-kicker">{text(props, 'kicker')}</p>
      <blockquote>{text(props, 'quote')}</blockquote>
      <div className="core01-quote-meta">
        <strong>{text(props, 'attribution')}</strong>
        <span>{text(props, 'summary')}</span>
      </div>
    </section>
  )
}

export function Core01Actions({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-content core01-actions">
      <div className="core01-actions-heading">
        <span>NEXT</span>
        <h2>{text(props, 'title')}</h2>
        <p>{text(props, 'summary')}</p>
      </div>
      <ol className="core01-actions-list">
        {items(props, 'actions').map((action, index) => (
          <li key={`${index}-${action}`}><strong>{String(index + 1).padStart(2, '0')}</strong><span>{action}</span></li>
        ))}
      </ol>
    </section>
  )
}

export function Core01Matrix({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-content core01-matrix">
      <header className="core01-header"><span>MAP</span><h2>{text(props, 'title')}</h2></header>
      <div className="core01-matrix-chart">
        <span className="core01-matrix-y">{text(props, 'yLabel')}</span>
        <div className="core01-matrix-grid">
          {items(props, 'items').map((item, index) => <div key={`${index}-${item}`}><strong>{String(index + 1).padStart(2, '0')}</strong><span>{item}</span></div>)}
        </div>
        <span className="core01-matrix-x">{text(props, 'xLabel')}</span>
      </div>
    </section>
  )
}

export function Core01Overview({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-content core01-overview">
      <div className="core01-overview-heading"><p className="core01-kicker">{text(props, 'kicker')}</p><h2>{text(props, 'title')}</h2><p>{text(props, 'summary')}</p></div>
      <ol className="core01-overview-sections">
        {items(props, 'sections').map((section, index) => <li key={`${index}-${section}`}><strong>{String(index + 1).padStart(2, '0')}</strong><span>{section}</span></li>)}
      </ol>
    </section>
  )
}

export function Core01Section({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-section">
      <span>{text(props, 'kicker')}</span>
      <h1>{text(props, 'title')}</h1>
      <p>{text(props, 'subtitle')}</p>
      <div>{text(props, 'sectionNumber')}</div>
    </section>
  )
}

export function Core01Timeline({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-content core01-timeline">
      <header className="core01-header"><span>TIME</span><h2>{text(props, 'title')}</h2></header>
      <ol>
        {items(props, 'milestones').map((item, index) => (
          <li key={`${index}-${item}`}><strong>{String(index + 1).padStart(2, '0')}</strong><i /><span>{item}</span></li>
        ))}
      </ol>
    </section>
  )
}

export function Core01Bars({ props }: NativeLayoutComponentProps) {
  const metrics = items(props, 'metrics')
  return (
    <section className="native-layout core01-content core01-bars">
      <header className="core01-header"><span>DATA</span><h2>{text(props, 'title')}</h2></header>
      <div className="core01-bars-body">
        <p>{text(props, 'summary')}</p>
        <ol>{metrics.map((metric, index) => <li key={`${index}-${metric}`}><span>{metric}</span><i style={{ width: `${Math.max(32, 100 - index * (56 / Math.max(1, metrics.length - 1)))}%` }} /></li>)}</ol>
      </div>
    </section>
  )
}

export function Core01Chart({ props }: NativeLayoutComponentProps) {
  const title = text(props, 'title')
  return (
    <section className="native-layout core01-content core01-chart">
      <header className="core01-header"><span>DATA</span><h2>{title}</h2></header>
      <div className="core01-chart-body">
        <p>{text(props, 'summary')}</p>
        <FlintChart spec={props.spec} label={title || '数据图表'} />
      </div>
    </section>
  )
}

export function Core01Table({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-content core01-table">
      <header className="core01-header"><span>REPORT</span><h2>{text(props, 'title')}</h2></header>
      <div className="core01-table-head"><span>{text(props, 'leftLabel')}</span><span>{text(props, 'rightLabel')}</span></div>
      <ol>{items(props, 'rows').map((row, index) => <li key={`${index}-${row}`}><strong>{String(index + 1).padStart(2, '0')}</strong><span>{row}</span></li>)}</ol>
    </section>
  )
}

export function Core01Architecture({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-content core01-architecture">
      <div className="core01-architecture-title"><p className="core01-kicker">{text(props, 'kicker')}</p><h2>{text(props, 'title')}</h2><p>{text(props, 'summary')}</p></div>
      <div className="core01-architecture-stack">{items(props, 'layers').map((layer, index) => <div key={`${index}-${layer}`}><strong>L{index + 1}</strong><span>{layer}</span></div>)}</div>
    </section>
  )
}

export function Core01Profile({ props }: NativeLayoutComponentProps) {
  const image = text(props, 'image')
  const name = text(props, 'name')
  return (
    <section className="native-layout core01-profile">
      <div className="core01-profile-media">{image ? <img src={image} alt={name} /> : <div className="core01-case-placeholder" />}</div>
      <div className="core01-profile-copy"><p className="core01-kicker">{text(props, 'kicker')}</p><h2>{name}</h2><strong>{text(props, 'role')}</strong><p>{text(props, 'summary')}</p><div>{items(props, 'highlights').map((item) => <span key={item}>{item}</span>)}</div></div>
    </section>
  )
}

export function Core01Funnel({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-content core01-funnel">
      <div className="core01-funnel-heading"><p className="core01-kicker">{text(props, 'kicker')}</p><h2>{text(props, 'title')}</h2><p>{text(props, 'summary')}</p></div>
      <ol>{items(props, 'stages').map((stage, index) => <li key={`${index}-${stage}`} style={{ width: `${100 - index * 11}%` }}><strong>{String(index + 1).padStart(2, '0')}</strong><span>{stage}</span></li>)}</ol>
    </section>
  )
}

export function Core01Conclusion({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-content core01-conclusion">
      <div className="core01-conclusion-title">
        <span>05</span>
        <h2>{text(props, 'title')}</h2>
      </div>
      <ol className="core01-conclusion-list">
        {items(props, 'points').map((point, index) => (
          <li key={`${index}-${point}`}>
            <strong>{String(index + 1).padStart(2, '0')}</strong>
            <p>{point}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function Core01End({ props }: NativeLayoutComponentProps) {
  return (
    <section className="native-layout core01-end">
      <div className="core01-end-rule" />
      <h1>{text(props, 'title')}</h1>
      <p>{text(props, 'subtitle')}</p>
    </section>
  )
}
