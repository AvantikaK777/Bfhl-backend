# BFHL — SRM Full Stack Engineering Challenge

A REST API and frontend that parses hierarchical node graphs, detects cycles, 
validates input, and surfaces structural summaries.

---

## Project Structure

```
bfhl-project/
├── backend/          Express REST API
│   ├── index.js      All logic: parsing, graph building, cycle detection
│   ├── package.json
│   └── render.yaml   Render.com deployment config
└── frontend/
    └── index.html    Single-file SPA (no build step needed)
```

---

## Running Locally

### Backend
```bash
cd backend
npm install
npm start          # listens on http://localhost:3001
# or for dev:
npm run dev        # uses nodemon (auto-restart)
```

### Frontend
Open `frontend/index.html` directly in a browser, or serve it:
```bash
npx serve frontend
```
Set the **API Base URL** field in the UI to `http://localhost:3001`.

---

## API

### `POST /bfhl`
**Content-Type:** `application/json`

```json
{
  "data": ["A->B", "A->C", "B->D", "hello", "1->2"]
}
```

Returns hierarchies, invalid entries, duplicate edges, and a summary.
See the challenge spec for the full response schema.

---

## Deploying

### Backend → Render.com
1. Push the `backend/` folder to a public GitHub repo.
2. Create a new **Web Service** on [render.com](https://render.com).
3. Select the repo, set **Build Command** `npm install` and **Start Command** `npm start`.
4. Note the generated URL — this is your API base URL.

### Frontend → Netlify / Vercel
- **Netlify:** drag-and-drop the `frontend/` folder at netlify.com/drop.
- **Vercel:** `vercel --cwd frontend`
- Set the API Base URL in the UI to your Render deployment URL.

---

## Processing Rules Summary

| Rule | Behaviour |
|------|-----------|
| Valid format | `[A-Z]->[A-Z]`, parent ≠ child |
| Self-loop | Invalid (`A->A`) |
| Multi-parent | First edge wins; subsequent edges discarded |
| Duplicate edge | First kept; extras in `duplicate_edges` (once each) |
| Cycle | `has_cycle: true`, `tree: {}`, no `depth` |
| Pure cycle root | Lexicographically smallest node in group |
| Depth | Node count on longest root-to-leaf path |
| `largest_tree_root` | Deepest non-cyclic tree; lex tiebreak |

---

## Quick Test

```bash
curl -X POST http://localhost:3001/bfhl \
  -H "Content-Type: application/json" \
  -d '{"data":["A->B","A->C","B->D","X->Y","Y->Z","Z->X","hello"]}'
```
