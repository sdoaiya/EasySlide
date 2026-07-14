import type { NativeLayoutComponentProps } from '../types'

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
