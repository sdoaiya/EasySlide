import type { NativeLayoutContract } from '@/components/native-deck/NativeDeckPropertyPanel'
import type { NativeSlideSpec } from '@/native-deck/types'
import type { Page, Project } from '@/types'

type NativeProject = Pick<Project, 'native_theme' | 'pages'>

export function buildNativeProjectSlides(
  project: NativeProject,
  contracts: readonly NativeLayoutContract[],
): NativeSlideSpec[] {
  const theme = resolveProjectTheme(project, contracts)
  const total = project.pages.length
  return project.pages.map((page, index): NativeSlideSpec => {
    const nativePage = page as Page & { native_layout?: string; native_props?: Record<string, unknown> }
    const title = pageTitle(page)
    const layout = nativePage.native_layout || fallbackLayoutForPage(contracts, theme, index, total)
    return {
      pageId: nativePage.id || nativePage.page_id,
      layout,
      props: nativePage.native_props || { title },
      pending: !nativePage.native_layout,
    }
  })
}

function resolveProjectTheme(project: NativeProject, contracts: readonly NativeLayoutContract[]) {
  const themes = new Set(contracts.map((contract) => contract.theme))
  if (project.native_theme && themes.has(project.native_theme)) return project.native_theme
  for (const page of project.pages) {
    const layout = page.native_layout
    const contract = layout ? contracts.find((item) => item.layout === layout) : undefined
    if (contract?.theme) return contract.theme
  }
  return themes.has('theme01') ? 'theme01' : contracts[0]?.theme || 'theme01'
}

function fallbackLayoutForPage(contracts: readonly NativeLayoutContract[], theme: string, index: number, total: number) {
  const role = index === 0 ? 'cover' : index === total - 1 ? 'end' : 'content'
  const themed = contracts.filter((contract) => contract.theme === theme)
  const roleMatch = themed.find((contract) => matchesRole(contract, role))
  return roleMatch?.layout || themed[0]?.layout || contracts[0]?.layout || 'pending'
}

function matchesRole(contract: NativeLayoutContract, role: 'cover' | 'content' | 'end') {
  const roles = contract.roles || []
  if (role === 'content') return !roles.includes('cover') && !roles.includes('end') && !roles.includes('closing')
  if (role === 'end') return roles.includes('end') || roles.includes('closing')
  return roles.includes(role)
}

function pageTitle(page: Page) {
  const outline = (page.outline_content || {}) as Record<string, unknown>
  return typeof outline.title === 'string' && outline.title.trim()
    ? outline.title
    : `第 ${page.order_index + 1} 页`
}
