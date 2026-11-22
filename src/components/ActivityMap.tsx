import { useEffect, useRef, useState } from 'react'
import { circle, circleMarker, layerGroup, map, polyline, tileLayer, type LatLngTuple, type LayerGroup, type Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Point } from '../domain/activity'

export default function ActivityMap({ points, live = false }: { points: Point[]; live?: boolean }) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const layer = useRef<LayerGroup | null>(null)
  const [follow, setFollow] = useState(true)
  const [large, setLarge] = useState(false)
  const [streets, setStreets] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [tilesReady, setTilesReady] = useState(false)
  const [tileError, setTileError] = useState(false)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  useEffect(() => {
    if (!container.current) return
    const instance = map(container.current, { scrollWheelZoom: false, maxZoom: 19 }).setView([0, 0], 2)
    instance.attributionControl.setPrefix(false)
    mapRef.current = instance
    layer.current = layerGroup().addTo(instance)
    const resize = new ResizeObserver(() => instance.invalidateSize({ pan: false }))
    resize.observe(container.current)
    return () => { resize.disconnect(); instance.remove(); mapRef.current = null; layer.current = null }
  }, [])
  useEffect(() => {
    const instance = mapRef.current
    if (!instance || !streets || !online) return
    const tiles = tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 19, updateWhenIdle: true,
    })
    tiles.on('tileload', () => { setTilesReady(true); setTileError(false) })
    tiles.on('tileerror', () => setTileError(true))
    tiles.addTo(instance)
    return () => { tiles.off(); tiles.remove() }
  }, [streets, online])
  useEffect(() => {
    const instance = mapRef.current
    const group = layer.current
    if (!instance || !group) return
    group.clearLayers()
    const first = points[0]
    const last = points.at(-1)
    if (!first || !last) return
    const sections = new Map<number, LatLngTuple[]>()
    for (const point of points) {
      const section = sections.get(point.segment) ?? []
      section.push([point.lat, point.lng])
      sections.set(point.segment, section)
    }
    const paths = [...sections.values()]
    polyline(paths, { color: '#9270bb', weight: 5 }).addTo(group)
    circleMarker([first.lat, first.lng], { radius: 5, color: '#4e4664', fillOpacity: 1 }).addTo(group)
    circle([last.lat, last.lng], { radius: last.accuracy, color: '#9270bb', weight: 1 }).addTo(group)
    circleMarker([last.lat, last.lng], { radius: 6, color: '#694b91', fillOpacity: 1 }).addTo(group)
    if (!follow) return
    if (live) instance.setView([last.lat, last.lng], instance.getZoom() < 12 ? 17 : instance.getZoom(), { animate: false })
    else instance.fitBounds(paths.flat(), { padding: [22, 22], maxZoom: 17, animate: false })
  }, [points, follow, live])
  return <div className={large ? 'activity-map activity-map-large' : 'activity-map'}>
    <div ref={container} role="region" aria-label="Recorded GPS route" className="activity-map-canvas" />
    <div className="activity-actions">
      <button type="button" className="quiet-button" aria-pressed={streets} disabled={!online} onClick={() => {
        setTilesReady(false)
        setTileError(false)
        setStreets(value => !value)
      }}>{streets ? 'Hide street map' : 'Show street map'}</button>
      <button type="button" className="quiet-button" aria-pressed={follow} onClick={() => setFollow(value => !value)}>Follow route</button>
      <button type="button" className="quiet-button" disabled={!points.length} onClick={() => {
        const last = points.at(-1)
        if (last) mapRef.current?.panTo([last.lat, last.lng])
      }}>Recenter</button>
      <button type="button" className="quiet-button" aria-expanded={large} onClick={() => setLarge(value => !value)}>{large ? 'Compact map' : 'Expand map'}</button>
    </div>
    <small role="status">{!online ? 'Offline · recorded points remain available without street tiles.' :
      !streets ? 'Show street map loads the viewed area from OpenStreetMap.' :
      tileError ? 'Some street tiles are unavailable. Recorded points are still shown.' :
      !tilesReady ? 'Loading street map…' : !points.length ? 'Waiting for a GPS fix to center the map.' : 'Street map ready.'}</small>
  </div>
}
