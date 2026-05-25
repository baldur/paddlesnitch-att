'use client'
import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

const PANE = 'riverPane'

// Style by OSM waterway type (w property set by download script)
function riverStyle(feature?: { properties?: { w?: string } }) {
  const type = feature?.properties?.w ?? 'river'
  return {
    color: '#06b6d4',
    weight: type === 'river' ? 3 : type === 'canal' ? 2 : 1.2,
    opacity: type === 'river' ? 1 : type === 'canal' ? 0.85 : 0.65,
    fillOpacity: 0,
  }
}

export default function RiverLayer() {
  const map = useMap()

  useEffect(() => {
    // Dedicated pane so the CSS glow filter only applies to river lines
    if (!map.getPane(PANE)) {
      const pane = map.createPane(PANE)
      pane.style.zIndex = '350'
      // Neon glow matching the app's design language
      pane.style.filter = 'drop-shadow(0 0 3px rgba(6,182,212,0.9)) drop-shadow(0 0 6px rgba(6,182,212,0.5))'
    }

    let layer: L.GeoJSON | null = null
    let cancelled = false

    fetch('/data/rivers.geojson')
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        layer = L.geoJSON(data as any, {
          style: riverStyle,
          pane: PANE,
          interactive: false,
        })
        layer.addTo(map)
        layer.bringToBack()
      })
      .catch(() => {
        // Rivers are cosmetic — fail silently if file hasn't been downloaded yet
      })

    return () => {
      cancelled = true
      if (layer) map.removeLayer(layer)
    }
  }, [map])

  return null
}
