# Anselmo Multi-Metric Tracking Engine

This workspace now includes a browser-based analytics engine that upgrades your tracking viewer into a multi-metric, layered performance analysis tool.

## Included files

- `index.html` - full UI shell (metrics panel, modes, presets, exports, playback)
- `app.js` - playback, data pipeline, rendering, metric layer logic, exports
- `metricsWorker.js` - WebWorker metric computation and derived analytics
- `styles.css` - responsive UI style system

## Features implemented

- Multi-metric selection (1-N metrics), searchable and grouped by:
  - physical
  - tactical
  - spatial
  - temporal
- Modes:
  - overlay mode (multi-layer)
  - composite index mode (weighted)
  - comparative mode (Player A vs Player B)
  - temporal evolution mode (trend chart)
- Derived metrics (computed per player per frame):
  - velocity, acceleration, deceleration, delta angle
  - distance covered, sprint intensity
  - time on pitch, active time, idle time ratio
  - zone time distribution + possession zone time
  - fatigue index, work rate, high-intensity intervals
  - pitch coverage area, heatmap density, positional stability, drift
  - pressing intensity, nearest opponent distance, compactness, transition speed
- Synchronized frame playback (10 Hz, deterministic frame index)
- Export upgrades:
  - CSV (multi-metric rows)
  - XLSX
  - JSON analytics bundle
  - PDF tactical summary
  - heatmap image exports
- Presets:
  - Speed Analysis
  - Fatigue Monitoring
  - Tactical Positioning
  - Full Performance Scan
  - Custom preset save/export

## Run

Because this app uses `fetch`, run it from a local web server (not `file://`).

```bash
cd /Users/sudhirdahiya/Downloads/Anselmo
python3 -m http.server 8080
```

Then open:

- `http://localhost:8080/index.html`

## Notes

- Tracking JSONL is large. The app currently reads full JSONL into memory before worker computation. This is okay for analysis but can be optimized with chunked parsing and streaming workers.
- If the pitch image does not load, the app falls back to a generated pitch.
- If your browser blocks CDN scripts, XLSX/PDF export buttons may be unavailable.
