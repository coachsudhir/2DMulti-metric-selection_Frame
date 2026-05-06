# Web Deployment Guide (Static Hosting)

This project is now web-upload ready.

## Entry points

- `dashboard.html` : upload files + choose scenario + launch engine
- `frames_2d_advanced.html` : 2D analytics engine

## How it works on the web

- You upload `match.json`, `tracking.jsonl`, and optional pitch image in `dashboard.html`.
- The dashboard stores temporary blob URLs + scenario config in browser `sessionStorage`.
- It opens `frames_2d_advanced.html?autoload=session`.
- The engine reads uploaded files through those blob URLs and executes the selected scenario.
- Tracking JSONL is parsed with chunked streaming in the browser.

No backend is required for this workflow.

## Option A: GitHub Pages

1. Create a GitHub repo and push all files.
2. In repository settings, enable Pages from branch `main` and folder `/root`.
3. Open the generated URL and navigate to `dashboard.html`.

## Option B: Netlify

1. Drag-and-drop this folder into Netlify Deploys.
2. Open the deployed URL and go to `dashboard.html`.

## Option C: Vercel (static)

1. Import the repository in Vercel.
2. Use default static settings.
3. Open deployed URL and go to `dashboard.html`.

## Notes

- `tracking.jsonl` can be large, so first load may take time in the browser.
- Keep both pages on the same origin for `sessionStorage` transfer.
- Keep the dashboard tab open while the engine tab is loading uploaded files.
- Current version includes chunked JSONL parsing; next optimization is incremental worker computation per chunk.
