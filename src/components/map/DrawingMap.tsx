'use client'
import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, Polyline, CircleMarker, useMapEvents, useMap } from 'react-leaflet'
import { useState, useEffect } from 'react'
import L from 'leaflet'
import type { LatLng, Line } from '@/lib/types'
import RiverLayer from './RiverLayer'

const TILES = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
}
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

// Fix Leaflet default icon paths broken by webpack
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

type Props = {
  onChange: (lines: { startLine?: Line; finishLine?: Line }) => void
  defaultCenter?: LatLng
  courseType?: 'one_way' | 'loop'
}

function ClickHandler({ onMapClick }: { onMapClick: (pt: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onMapClick([e.latlng.lat, e.latlng.lng])
    },
  })
  return null
}

// Reading town centre — used when geolocation is unavailable
const READING: LatLng = [51.4543, -0.9781]

function GeolocateCenter() {
  const map = useMap()
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => map.setView([pos.coords.latitude, pos.coords.longitude], 14),
      () => {} // permission denied or error — stay on fallback
    )
  }, [map])
  return null
}

export default function DrawingMap({
  onChange,
  defaultCenter = READING,
  courseType = 'one_way',
}: Props) {
  const [mode, setMode] = useState<'start' | 'finish' | null>(null)
  const [startPts, setStartPts] = useState<LatLng[]>([])
  const [finishPts, setFinishPts] = useState<LatLng[]>([])
  const [mounted, setMounted] = useState(false)
  const [dark, setDark] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Reset state when course type changes
  useEffect(() => {
    setStartPts([])
    setFinishPts([])
    setMode(null)
    onChange({ startLine: undefined, finishLine: undefined })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseType])

  const emit = (sp: LatLng[], fp: LatLng[]) => {
    if (courseType === 'loop') {
      onChange({
        startLine: sp.length === 2 ? (sp as Line) : undefined,
        finishLine: undefined,
      })
    } else {
      onChange({
        startLine: sp.length === 2 ? (sp as Line) : undefined,
        finishLine: fp.length === 2 ? (fp as Line) : undefined,
      })
    }
  }

  const handleClick = (pt: LatLng) => {
    if (mode === 'start') {
      const next = startPts.length < 2 ? [...startPts, pt] : [pt]
      setStartPts(next)
      emit(next, finishPts)
      if (next.length === 2) setMode(null)
    } else if (mode === 'finish') {
      const next = finishPts.length < 2 ? [...finishPts, pt] : [pt]
      setFinishPts(next)
      emit(startPts, next)
      if (next.length === 2) setMode(null)
    }
  }

  const resetStart = () => {
    setStartPts([])
    setMode('start')
    emit([], finishPts)
  }

  const resetFinish = () => {
    setFinishPts([])
    setMode('finish')
    emit(startPts, [])
  }

  if (!mounted) return <div style={{ height: 400 }} className="bg-[#f8fafc] border border-[#e2e8f0]" />

  const startDone = startPts.length === 2
  const finishDone = finishPts.length === 2

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 flex-wrap">
        {courseType === 'loop' ? (
          <button
            type="button"
            onClick={() => (startDone ? resetStart() : setMode(mode === 'start' ? null : 'start'))}
            className={`px-3 py-1.5 text-xs border transition-colors ${
              mode === 'start'
                ? 'border-[#7c3aed] text-[#7c3aed]'
                : startDone
                ? 'border-[#7c3aed] text-[#7c3aed] opacity-70'
                : 'border-[#e2e8f0] text-[#64748b] hover:border-[#7c3aed] hover:text-[#7c3aed]'
            }`}
          >
            {startDone
              ? '✓ CROSSING LINE (click to reset)'
              : mode === 'start'
              ? `PLACE POINT ${startPts.length + 1}/2`
              : 'SET CROSSING LINE'}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => (startDone ? resetStart() : setMode(mode === 'start' ? null : 'start'))}
              className={`px-3 py-1.5 text-xs border transition-colors ${
                mode === 'start'
                  ? 'border-[#15803d] text-[#15803d]'
                  : startDone
                  ? 'border-[#15803d] text-[#15803d] opacity-70'
                  : 'border-[#e2e8f0] text-[#64748b] hover:border-[#15803d] hover:text-[#15803d]'
              }`}
            >
              {startDone
                ? '✓ START LINE (click to reset)'
                : mode === 'start'
                ? `PLACE POINT ${startPts.length + 1}/2`
                : 'SET START LINE'}
            </button>
            <button
              type="button"
              onClick={() => (finishDone ? resetFinish() : setMode(mode === 'finish' ? null : 'finish'))}
              className={`px-3 py-1.5 text-xs border transition-colors ${
                mode === 'finish'
                  ? 'border-[#b91c1c] text-[#b91c1c]'
                  : finishDone
                  ? 'border-[#b91c1c] text-[#b91c1c] opacity-70'
                  : 'border-[#e2e8f0] text-[#64748b] hover:border-[#b91c1c] hover:text-[#b91c1c]'
              }`}
            >
              {finishDone
                ? '✓ FINISH LINE (click to reset)'
                : mode === 'finish'
                ? `PLACE POINT ${finishPts.length + 1}/2`
                : 'SET FINISH LINE'}
            </button>
          </>
        )}
      </div>

      <div className="relative" style={{ cursor: mode ? 'crosshair' : 'grab' }}>
        <button
          onClick={() => setDark(d => !d)}
          className="absolute top-2 right-2 z-[1001] px-2 py-1 text-[10px] border bg-white border-[#e2e8f0] text-[#64748b] hover:border-[#0369a1] hover:text-[#0369a1] transition-colors"
          title="Toggle map style"
        >
          {dark ? 'LIGHT MAP' : 'DARK MAP'}
        </button>
        <MapContainer
          center={defaultCenter}
          zoom={14}
          style={{ height: 400, width: '100%' }}
        >
          <TileLayer url={TILES[dark ? 'dark' : 'light']} attribution={ATTRIBUTION} maxZoom={19} />
          <RiverLayer dark={dark} />
          <GeolocateCenter />
          <ClickHandler onMapClick={handleClick} />
          {startPts.map((pt, i) => (
            <CircleMarker
              key={`s${i}`}
              center={pt}
              radius={6}
              pathOptions={{
                color: courseType === 'loop' ? '#7c3aed' : '#15803d',
                fillColor: courseType === 'loop' ? '#7c3aed' : '#15803d',
                fillOpacity: 1,
              }}
            />
          ))}
          {startDone && (
            <Polyline
              positions={startPts}
              pathOptions={{
                color: courseType === 'loop' ? '#7c3aed' : '#15803d',
                weight: 3,
                dashArray: courseType === 'loop' ? '8 4' : undefined,
              }}
            />
          )}
          {courseType === 'one_way' && finishPts.map((pt, i) => (
            <CircleMarker
              key={`f${i}`}
              center={pt}
              radius={6}
              pathOptions={{ color: '#b91c1c', fillColor: '#b91c1c', fillOpacity: 1 }}
            />
          ))}
          {courseType === 'one_way' && finishDone && (
            <Polyline positions={finishPts} pathOptions={{ color: '#b91c1c', weight: 3 }} />
          )}
        </MapContainer>
      </div> {/* relative wrapper */}

      {mode && (
        <p className="text-xs text-[#64748b]">
          Click 2 points on the map to set the{' '}
          <span className={
            mode === 'start'
              ? courseType === 'loop' ? 'text-[#7c3aed]' : 'text-[#15803d]'
              : 'text-[#b91c1c]'
          }>
            {courseType === 'loop' ? 'crossing line' : `${mode} line`}
          </span>
          . Pan/zoom with scroll and drag.
        </p>
      )}
    </div>
  )
}
