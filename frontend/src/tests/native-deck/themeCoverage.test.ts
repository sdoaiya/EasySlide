import { describe, expect, it } from 'vitest'
import manifest from '../../../../shared/native-deck/layout-manifest.json'
import { layoutRegistry } from '@/native-deck/layoutRegistry'
import { isDashiLayout } from '@/native-deck/dashiThemeRuntime'

const requiredRoles = ['cover', 'content', 'metrics', 'comparison', 'process', 'case', 'conclusion', 'end']

describe('native deck release theme coverage', () => {
  it('ships every enabled theme with unique, registered core layouts', () => {
    const ids = manifest.layouts.map((layout) => layout.layout)
    expect(new Set(ids).size).toBe(ids.length)

    const coreLayouts = manifest.layouts.filter((layout) => layout.theme === 'core01')
    const coreRoles = new Set(coreLayouts.flatMap((layout) => layout.roles))
    for (const role of requiredRoles) expect(coreRoles.has(role)).toBe(true)
    for (const layout of coreLayouts) expect(layout.layout in layoutRegistry).toBe(true)

    const dashiai = manifest.layouts.filter((layout) => layout.theme !== 'core01')
    expect(dashiai).toHaveLength(1020)
    expect(new Set(dashiai.map((layout) => layout.theme)).size).toBe(12)
    for (const theme of new Set(dashiai.map((layout) => layout.theme))) {
      const layouts = dashiai.filter((layout) => layout.theme === theme)
      expect(layouts.some((layout) => layout.roles.includes('cover'))).toBe(true)
      expect(layouts.some((layout) => !layout.roles.includes('cover'))).toBe(true)
      for (const layout of layouts) {
        expect(isDashiLayout(layout.layout)).toBe(true)
        for (const slot of layout.mediaSlots) expect(slot.key).not.toMatch(/^[A-Za-z]:|^\//)
      }
    }
  })
})
