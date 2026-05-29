'use client'
import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet'
import { useEffect, useState } from 'react'
import L from 'leaflet'
import type { CourseMetadata } from '@/lib/types'
import RiverLayer from './RiverLayer'

const TILES = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
}
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function FitBounds({ course }: { course: CourseMetadata }) {
  const map = useMap()
  useEffect(() => {
    const lines = course.finishLine
      ? [...course.startLine, ...course.finishLine]
      : [...course.startLine]
    const lats = lines.map(p => p[0])
    const lngs = lines.map(p => p[1])
    map.fitBounds(
      [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
      { padding: [60, 60] }
    )
  }, [map, course])
  return null
}

export default function CourseMap({ course }: { course: CourseMetadata }) {
  const [mounted, setMounted] = useState(false)
  const [dark, setDark] = useState(true)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted)
    return <div style={{ height: 300 }} className="bg-[#f8fafc] border border-[#e2e8f0]" />

  const center = course.startLine[0]
  const isLoop = course.type === 'loop' || !course.finishLine

  return (
    <div className="relative">
      <button
        onClick={() => setDark(d => !d)}
        className="absolute top-2 right-2 z-[1001] px-2 py-1 text-[10px] border bg-white border-[#e2e8f0] text-[#64748b] hover:border-[#0369a1] hover:text-[#0369a1] transition-colors"
        title="Toggle map style"
      >
        {dark ? 'LIGHT MAP' : 'DARK MAP'}
      </button>
      <MapContainer
        center={center}
        zoom={14}
        style={{ height: 300, width: '100%' }}
        zoomControl={true}
      >
        <TileLayer url={TILES[dark ? 'dark' : 'light']} attribution={ATTRIBUTION} maxZoom={19} />
        <RiverLayer dark={dark} />
      <FitBounds course={course} />

      {isLoop ? (
        // Loop: one dashed violet line for crossing
        <>
          <Polyline
            positions={course.startLine}
            pathOptions={{ color: '#7c3aed', weight: 4, dashArray: '8 4' }}
          />
          <CircleMarker
            center={course.startLine[0]}
            radius={5}
            pathOptions={{ color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 1 }}
          />
          <CircleMarker
            center={course.startLine[1]}
            radius={5}
            pathOptions={{ color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 1 }}
          />
        </>
      ) : (
        // One-way: green start line, red finish line
        <>
          <Polyline
            positions={course.startLine}
            pathOptions={{ color: '#15803d', weight: 4 }}
          />
          <CircleMarker
            center={course.startLine[0]}
            radius={5}
            pathOptions={{ color: '#15803d', fillColor: '#15803d', fillOpacity: 1 }}
          />
          <CircleMarker
            center={course.startLine[1]}
            radius={5}
            pathOptions={{ color: '#15803d', fillColor: '#15803d', fillOpacity: 1 }}
          />
          <Polyline
            positions={course.finishLine!}
            pathOptions={{ color: '#b91c1c', weight: 4 }}
          />
          <CircleMarker
            center={course.finishLine![0]}
            radius={5}
            pathOptions={{ color: '#b91c1c', fillColor: '#b91c1c', fillOpacity: 1 }}
          />
          <CircleMarker
            center={course.finishLine![1]}
            radius={5}
            pathOptions={{ color: '#b91c1c', fillColor: '#b91c1c', fillOpacity: 1 }}
          />
        </>
      )}
      </MapContainer>
    </div>
  )
}
