import { React, api } from './runtime'
import type { CSSProperties, ReactElement } from 'react'
import { uiText } from './localization'
import { MapPin, Minus, Plus } from './icons'

/**
 * The place of the selected entry on an OpenStreetMap map, as in To-Do's Task
 * tab (18 Nov): tiles come through the backend (the UI has no network of its
 * own), dragging moves the map, + and − and a trackpad pinch zoom, the plain
 * wheel is left to the sidebar, and Dark dims the same tiles.
 */
interface Point { lat: number; lng: number }
interface MapView { zoom: number; x: number; y: number }

const TILE = 256
const ZOOM = 15
const MIN_ZOOM = 2
const MAX_ZOOM = 19
const MAP_HEIGHT = 180
/** Half the widest sidebar the map has to cover, in px. */
const MAP_REACH = 330

interface MapCache { tiles: Map<string, Promise<string>>; places: Map<string, Promise<Point | null>> }

function mapCache(): MapCache {
  return api.runtime.getOrCreate('calendar.itemMap', () => ({ tiles: new Map(), places: new Map() }))
}

function loadTile(z: number, x: number, y: number): Promise<string> {
  const { tiles } = mapCache()
  const key = `${z}/${x}/${y}`
  let tile = tiles.get(key)
  if (!tile) {
    tile = api.backend.call<string>('map.tile', { z, x, y }).then((base64) => `data:image/png;base64,${base64}`)
    tile.catch(() => { if (tiles.get(key) === tile) tiles.delete(key) })
    tiles.set(key, tile)
    if (tiles.size > 160) tiles.delete(tiles.keys().next().value as string)
  }
  return tile
}

/** Where a place without saved coordinates is: the place search's first hit for its name. */
export function findPlace(name: string): Promise<Point | null> {
  const { places } = mapCache()
  let place = places.get(name)
  if (!place) {
    place = api.resources.search({ query: name, kinds: ['place'], limit: 1 }).then((hits) => {
      const lng = Number(hits[0]?.metadata?.longitude)
      const lat = Number(hits[0]?.metadata?.latitude)
      return Number.isFinite(lng) && Number.isFinite(lat) ? { lat, lng } : null
    }, () => null)
    places.set(name, place)
  }
  return place
}

/** Web Mercator: a position as pixels on the world map at one zoom. */
export function projectPoint({ lat, lng }: Point, zoom: number): { x: number; y: number } {
  const size = TILE * 2 ** zoom
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180
  return {
    x: (lng + 180) / 360 * size,
    y: (1 - Math.log(Math.tan(clamped) + 1 / Math.cos(clamped)) / Math.PI) / 2 * size
  }
}

function isDark(doc: Document): boolean {
  const root = doc.documentElement
  const scheme = root.style.colorScheme.trim() || root.getAttribute('data-theme') || ''
  if (scheme === 'dark' || scheme === 'light') return scheme === 'dark'
  return doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches === true
}

function Tile({ z, x, y, style }: { z: number; x: number; y: number; style: CSSProperties }): ReactElement | null {
  const [src, setSrc] = React.useState('')
  React.useEffect(() => {
    let active = true
    setSrc('')
    void loadTile(z, x, y).then((url) => { if (active) setSrc(url) }, () => {})
    return () => { active = false }
  }, [z, x, y])
  return src ? <img className="calendar-item-map-tile" src={src} alt="" draggable={false} style={style} /> : null
}

function zoomView(view: MapView, step: 1 | -1): MapView {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom + step))
  const scale = 2 ** (zoom - view.zoom)
  return { zoom, x: view.x * scale, y: view.y * scale }
}

export function LocationMap({ name, point }: { name: string; point: Point }): ReactElement {
  const ref = React.useRef<HTMLDivElement>(null)
  const [dark, setDark] = React.useState(() => isDark(document))
  const [view, setView] = React.useState<MapView>(() => ({ zoom: ZOOM, ...projectPoint(point, ZOOM) }))
  React.useEffect(() => setView({ zoom: ZOOM, ...projectPoint(point, ZOOM) }), [point.lat, point.lng]) // eslint-disable-line react-hooks/exhaustive-deps
  React.useLayoutEffect(() => {
    const doc = ref.current?.ownerDocument
    if (!doc) return
    setDark(isDark(doc))
    const Observer = doc.defaultView?.MutationObserver ?? MutationObserver
    const observer = new Observer(() => setDark(isDark(doc)))
    observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] })
    return () => observer.disconnect()
  }, [])
  // A pinch arrives as a wheel with Ctrl held; it needs a listener that may cancel the page zoom.
  React.useEffect(() => {
    const map = ref.current
    if (!map) return
    let pinched = 0
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return
      event.preventDefault()
      pinched += event.deltaY
      if (Math.abs(pinched) < 12) return
      const step = pinched < 0 ? 1 : -1
      pinched = 0
      setView((current) => zoomView(current, step))
    }
    map.addEventListener('wheel', onWheel, { passive: false })
    return () => map.removeEventListener('wheel', onWheel)
  }, [])
  const drag = React.useRef<{ pointer: number; x: number; y: number } | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const size = TILE * 2 ** view.zoom
  const count = 2 ** view.zoom
  const pin = projectPoint(point, view.zoom)
  const tiles: ReactElement[] = []
  for (let ty = Math.floor((view.y - MAP_HEIGHT / 2) / TILE); ty <= Math.floor((view.y + MAP_HEIGHT / 2) / TILE); ty++) {
    if (ty < 0 || ty >= count) continue
    for (let tx = Math.floor((view.x - MAP_REACH) / TILE); tx <= Math.floor((view.x + MAP_REACH) / TILE); tx++) {
      const x = ((tx % count) + count) % count
      tiles.push(<Tile key={`${view.zoom}/${tx}/${ty}`} z={view.zoom} x={x} y={ty} style={{ left: `calc(50% + ${Math.round(tx * TILE - view.x)}px)`, top: `calc(50% + ${Math.round(ty * TILE - view.y)}px)` }} />)
    }
  }
  return (
    <div
      ref={ref}
      className={`calendar-item-map${dark ? ' is-dark' : ''}${dragging ? ' is-dragging' : ''}`}
      role="group"
      aria-label={uiText('calendar.card.mapOf', { name })}
      onPointerDown={(event) => {
        if (event.button !== 0 || (event.target as Element).closest('button')) return
        drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY }
        event.currentTarget.setPointerCapture?.(event.pointerId)
        setDragging(true)
      }}
      onPointerMove={(event) => {
        const from = drag.current
        if (!from || from.pointer !== event.pointerId) return
        const dx = event.clientX - from.x
        const dy = event.clientY - from.y
        drag.current = { ...from, x: event.clientX, y: event.clientY }
        setView((current) => ({ ...current, x: current.x - dx, y: Math.max(0, Math.min(size, current.y - dy)) }))
      }}
      onPointerUp={() => { drag.current = null; setDragging(false) }}
      onPointerCancel={() => { drag.current = null; setDragging(false) }}
    >
      {tiles}
      <span className="calendar-item-map-pin" aria-hidden="true" style={{ left: `calc(50% + ${Math.round(pin.x - view.x)}px)`, top: `calc(50% + ${Math.round(pin.y - view.y)}px)` }}><MapPin /></span>
      <div className="calendar-item-map-zoom">
        <button type="button" className="calendar-item-map-zoom-btn" disabled={view.zoom >= MAX_ZOOM} title={uiText('calendar.card.zoomIn')} aria-label={uiText('calendar.card.zoomIn')} onClick={() => setView((current) => zoomView(current, 1))}><Plus /></button>
        <button type="button" className="calendar-item-map-zoom-btn" disabled={view.zoom <= MIN_ZOOM} title={uiText('calendar.card.zoomOut')} aria-label={uiText('calendar.card.zoomOut')} onClick={() => setView((current) => zoomView(current, -1))}><Minus /></button>
      </div>
      <span className="calendar-item-map-credit">{uiText('calendar.card.mapCredit')}</span>
    </div>
  )
}

/** The place: its name as a link that opens it, and the map under it once its position is known. */
export function ItemLocation({ location, onOpen }: { location: { name: string; lat?: number; lng?: number }; onOpen(location: { name: string; lat?: number; lng?: number }): void }): ReactElement {
  const saved = location.lat !== undefined && location.lng !== undefined ? { lat: location.lat, lng: location.lng } : null
  const [found, setFound] = React.useState<Point | null>(null)
  React.useEffect(() => {
    setFound(null)
    if (saved) return
    let active = true
    void findPlace(location.name).then((point) => { if (active) setFound(point) })
    return () => { active = false }
  }, [location.name, saved?.lat, saved?.lng]) // eslint-disable-line react-hooks/exhaustive-deps
  const point = saved ?? found
  return (
    <>
      <button type="button" className="calendar-item-line calendar-item-link" title={uiText('calendar.card.openLocation')} onClick={() => onOpen({ ...location, ...(point ?? {}) })}>
        <MapPin /><span>{location.name}</span>
      </button>
      {point && <LocationMap name={location.name} point={point} />}
    </>
  )
}
