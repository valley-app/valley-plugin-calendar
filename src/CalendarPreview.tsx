import { parseLinkUrl } from '@valley/plugin-sdk/linkTargets'
import { assetUrlForRelPath } from '@valley/plugin-sdk/fileTypes'
import { React, api } from './runtime'
import type { ReactElement } from 'react'
import { parseAppOpenUrl } from '@valley/plugin-sdk/paths'
import { CalendarDays } from './icons'

export function PluginGlyph({ owner }: { owner: string }): ReactElement {
  const [svg, setSvg] = React.useState('')
  React.useEffect(() => {
    let active = true
    const cache = api.runtime.getOrCreate('calendar.pluginIcons', () => new Map<string, Promise<string | null>>())
    if (!cache.has(owner)) cache.set(owner, api.ui.pluginIcon(owner))
    void cache.get(owner)!.then(value => { if (active) setSvg(value ?? '') }, () => {})
    return () => { active = false }
  }, [owner])
  return svg
    ? <span className="calendar-chip-glyph" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
    : <span className="calendar-chip-glyph" aria-hidden="true"><CalendarDays /></span>
}

export function CalendarPreview({ value, sourcePath, plain = false }: { value: string; sourcePath?: string; plain?: boolean }): ReactElement {
  const cache = api.runtime.getOrCreate('calendar.markdownCache', () => new Map<string, Promise<string>>())
  const [html, setHtml] = React.useState('')
  React.useEffect(() => {
    let active = true
    let rendered = cache.get(value)
    if (!rendered) {
      rendered = api.markdown.render(value)
      cache.set(value, rendered)
      if (cache.size > 256) cache.delete(cache.keys().next().value!)
    }
    void rendered.then(async text => {
      const container = document.createElement('div')
      container.innerHTML = text
      for (const embed of plain ? [] : container.querySelectorAll<HTMLImageElement>('img[data-embed], img[data-src]')) {
        const reference = (embed.dataset.embed ?? embed.dataset.src ?? '').split('|')[0].split('#')[0]
        const path = await api.workspace.resolveWikilink(reference)
        if (path) {
          if (/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(path)) { embed.src = assetUrlForRelPath(path); embed.loading = 'lazy' }
          else { const link = document.createElement('a'); link.dataset.wikilink = path; link.href = '#'; link.textContent = embed.alt || path.split('/').pop() || path; embed.replaceWith(link) }
        }
      }
      if (active) setHtml(container.innerHTML)
    }, () => { cache.delete(value) })
    return () => { active = false }
  }, [cache, value, plain])
  const text = React.useMemo(() => {
    if (!plain) return ''
    const container = document.createElement('div')
    container.innerHTML = html.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '$&\n').replace(/<\/(td|th)>/gi, '$& ')
    container.querySelectorAll('img, video, audio, iframe').forEach(node => node.remove())
    return container.textContent?.replace(/\n\s*\n/g, '\n').trim() ?? ''
  }, [html, plain])
  const open = async (event: React.MouseEvent<HTMLDivElement>): Promise<void> => {
    const target = (event.target as Element).closest<HTMLElement>('a, [data-embed], [data-src]')
    if (!target) return
    event.preventDefault()
    event.stopPropagation()
    const ref = target.dataset.wikilink ?? target.dataset.embed ?? target.dataset.src
    const href = target.getAttribute('href') ?? ''
    if (ref) {
      const path = await api.workspace.resolveWikilink(ref.split('|')[0].split('#')[0])
      if (path) api.workspace.openFile(path)
    } else if (parseAppOpenUrl(href)) api.workspace.openFile(parseAppOpenUrl(href)!)
    else if (parseLinkUrl(href)) await api.links.open(href)
    else if (href && !href.startsWith('#')) {
      const path = await api.workspace.resolveWikilink(href)
      if (path) api.workspace.openFile(path)
      else if (sourcePath && !href.includes(':') && !href.includes('..')) api.workspace.openFile(`${sourcePath.slice(0, sourcePath.lastIndexOf('/') + 1)}${href}`)
    }
  }
  return plain ? <div className="agenda-card-note">{text}</div>
    : <div className="agenda-card-note markdown-body" onClick={event => { void open(event) }} dangerouslySetInnerHTML={{ __html: html }} />
}
