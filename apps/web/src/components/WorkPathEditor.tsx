// Mini Leaflet map for drawing a contractor work path: click to add vertices,
// Undo removes the last one. Returns [[lat,lng],...] via onChange.

import { useState } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const VERTEX_ICON = L.divIcon({
  className: 'path-vertex',
  html: '<div class="path-vertex-dot"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
})

function ClickCatcher({ onAdd }: { onAdd: (p: [number, number]) => void }) {
  useMapEvents({ click: (e) => onAdd([e.latlng.lat, e.latlng.lng]) })
  return null
}

export function WorkPathEditor({
  value,
  onChange,
  center = [-33.889, 151.198],
}: {
  value: [number, number][]
  onChange: (path: [number, number][]) => void
  center?: [number, number]
}) {
  const [, setTick] = useState(0)

  function add(p: [number, number]) {
    onChange([...value, p])
    setTick((t) => t + 1)
  }
  function undo() {
    onChange(value.slice(0, -1))
  }
  function clear() {
    onChange([])
  }

  return (
    <div className="path-editor">
      <div className="path-editor-map">
        <MapContainer
          center={center}
          zoom={15}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <ClickCatcher onAdd={add} />
          {value.map((p, i) => (
            <Marker key={`${p[0]}-${p[1]}-${i}`} position={p} icon={VERTEX_ICON} />
          ))}
          {value.length > 1 && (
            <Polyline positions={value} pathOptions={{ color: '#f59e0b', weight: 4 }} />
          )}
        </MapContainer>
      </div>
      <div className="path-editor-bar">
        <span className="path-editor-hint">
          {value.length === 0
            ? 'Click the map to start drawing the work path'
            : `${value.length} point${value.length === 1 ? '' : 's'}${value.length < 2 ? ' — add at least 2' : ''}`}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="picker-clear" onClick={undo} disabled={value.length === 0} type="button">Undo</button>
          <button className="picker-clear" onClick={clear} disabled={value.length === 0} type="button">Clear</button>
        </div>
      </div>
    </div>
  )
}
