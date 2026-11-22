import { useEffect, useRef, useState } from 'react'
import { circle, circleMarker, layerGroup, map, polyline, type LatLngTuple, type LayerGroup, type Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Point } from '../domain/activity'

export default function ActivityMap({ points }: { points: Point[] }) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const layer = useRef<LayerGroup | null>(null)
  const [follow, setFollow] = useState(true)
  const [large, setLarge] = useState(false)
  useEffect(() => {
    if (!container.current) return
    const instance = map(container.current, { attributionControl: false, scrollWheelZoom: false }).setView([0, 0], 2)
    mapRef.current = instance
    layer.current = layerGroup().addTo(instance)
    const resize = new ResizeObserver(() => instance.invalidateSize({ pan: false }))
    resize.observe(container.current)
    return () => { resize.disconnect(); instance.remove(); mapRef.current = null; layer.current = null }
  }, [])
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
    if (follow) instance.fitBounds(paths.flat(), { padding: [22, 22], maxZoom: 17, animate: false })
  }, [points, follow])
  return <div className={large ? 'activity-map activity-map-large' : 'activity-map'}>
    <div ref={container} role="region" aria-label="Recorded GPS route" className="activity-map-canvas" />
    <div className="activity-actions">
      <button type="button" className="quiet-button" aria-pressed={follow} onClick={() => setFollow(value => !value)}>Follow route</button>
      <button type="button" className="quiet-button" disabled={!points.length} onClick={() => {
        const last = points.at(-1)
        if (last) mapRef.current?.panTo([last.lat, last.lng])
      }}>Recenter</button>
      <button type="button" className="quiet-button" aria-expanded={large} onClick={() => setLarge(value => !value)}>{large ? 'Compact map' : 'Expand map'}</button>
    </div>
    <small>{points.length ? 'GPS route · offline map without street tiles' : 'Recorded GPS points will appear here.'}</small>
  </div>
}
