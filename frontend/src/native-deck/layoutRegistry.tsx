import type { NativeLayoutComponent } from './types'
import {
  Core01Agenda,
  Core01Case,
  Core01Comparison,
  Core01Conclusion,
  Core01Cover,
  Core01End,
  Core01Metrics,
  Core01Process,
} from './layouts/core01'

export const layoutRegistry = {
  core01_cover: Core01Cover,
  core01_agenda: Core01Agenda,
  core01_metrics: Core01Metrics,
  core01_comparison: Core01Comparison,
  core01_process: Core01Process,
  core01_case: Core01Case,
  core01_conclusion: Core01Conclusion,
  core01_end: Core01End,
} satisfies Record<string, NativeLayoutComponent>
