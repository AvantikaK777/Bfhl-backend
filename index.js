const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ── Personal credentials ──────────────────────────────────────────────────────
const USER_ID = "yourname_ddmmyyyy";       // ← replace with your actual details
const EMAIL_ID = "you@college.edu";         // ← replace
const COLLEGE_ROLL = "21CSXXXX";            // ← replace
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when the string looks like "X->Y"
 * where X and Y are each exactly one uppercase A-Z letter,
 * and X ≠ Y (self-loops are invalid).
 */
function isValidEdge(s) {
  return /^[A-Z]->[A-Z]$/.test(s) && s[0] !== s[3];
}

/**
 * Separate the raw entries into three buckets:
 *   validEdges   – clean, first-seen edges ready for graph work
 *   invalidList  – entries that failed the format check
 *   duplicateList – edges seen more than once (each extra occurrence, once)
 */
function partitionEntries(rawData) {
  const seen = new Set();
  const validEdges = [];
  const invalidList = [];
  const duplicateSet = new Set();
  const duplicateList = [];

  for (const raw of rawData) {
    const entry = typeof raw === "string" ? raw.trim() : String(raw).trim();

    if (!isValidEdge(entry)) {
      invalidList.push(entry);
      continue;
    }

    if (seen.has(entry)) {
      if (!duplicateSet.has(entry)) {
        duplicateSet.add(entry);
        duplicateList.push(entry);
      }
    } else {
      seen.add(entry);
      validEdges.push(entry);
    }
  }

  return { validEdges, invalidList, duplicateList };
}

/**
 * Build an adjacency map and track parent counts so we can find roots.
 * Multi-parent rule: first edge that assigns a child wins; later attempts
 * to assign the same child to a different parent are silently dropped.
 */
function buildGraph(edges) {
  const children = new Map();   // node → [child, child, ...]
  const parentOf = new Map();   // child → its ONE accepted parent
  const allNodes = new Set();

  for (const edge of edges) {
    const [parent, child] = edge.split("->");
    allNodes.add(parent);
    allNodes.add(child);

    if (parentOf.has(child)) continue; // multi-parent: first wins

    parentOf.set(child, parent);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(child);
  }

  return { children, parentOf, allNodes };
}

/**
 * Group all nodes into connected components using union-find.
 */
function connectedComponents(nodes, children) {
  const parent = new Map([...nodes].map((n) => [n, n]));

  function find(x) {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
    return parent.get(x);
  }

  function unite(a, b) {
    parent.set(find(a), find(b));
  }

  for (const [p, kids] of children) {
    for (const k of kids) unite(p, k);
  }

  const groups = new Map();
  for (const node of nodes) {
    const rep = find(node);
    if (!groups.has(rep)) groups.set(rep, new Set());
    groups.get(rep).add(node);
  }

  return [...groups.values()];
}

/**
 * Detect a cycle inside a component using DFS (white-grey-black colouring).
 */
function hasCycle(nodes, children) {
  const WHITE = 0, GREY = 1, BLACK = 2;
  const colour = new Map([...nodes].map((n) => [n, WHITE]));

  function dfs(node) {
    colour.set(node, GREY);
    for (const kid of (children.get(node) || [])) {
      if (!colour.has(kid)) continue;          // not in this component
      if (colour.get(kid) === GREY) return true; // back-edge → cycle
      if (colour.get(kid) === WHITE && dfs(kid)) return true;
    }
    colour.set(node, BLACK);
    return false;
  }

  for (const node of nodes) {
    if (colour.get(node) === WHITE && dfs(node)) return true;
  }
  return false;
}

/**
 * Build a nested tree object recursively from a given root.
 */
function buildNestedTree(root, children) {
  const obj = {};
  const stack = [[root, obj]];
  const visited = new Set();

  while (stack.length) {
    const [node, container] = stack.pop();
    if (visited.has(node)) continue;
    visited.add(node);

    container[node] = {};
    for (const kid of (children.get(node) || [])) {
      stack.push([kid, container[node]]);
    }
  }

  return obj;
}

/**
 * Compute depth (longest root-to-leaf path in node count) via BFS.
 */
function computeDepth(root, children) {
  let maxDepth = 0;
  const queue = [[root, 1]];
  const seen = new Set();

  while (queue.length) {
    const [node, depth] = queue.shift();
    if (seen.has(node)) continue;
    seen.add(node);
    maxDepth = Math.max(maxDepth, depth);
    for (const kid of (children.get(node) || [])) {
      if (!seen.has(kid)) queue.push([kid, depth + 1]);
    }
  }

  return maxDepth;
}

/**
 * Main processing function – returns the full response object.
 */
function processData(rawData) {
  const { validEdges, invalidList, duplicateList } = partitionEntries(rawData);
  const { children, parentOf, allNodes } = buildGraph(validEdges);

  const components = connectedComponents(allNodes, children);
  const hierarchies = [];
  let totalTrees = 0;
  let totalCycles = 0;

  for (const group of components) {
    // Find natural roots: nodes in this group that have no accepted parent
    const roots = [...group].filter((n) => !parentOf.has(n)).sort();

    const cyclic = hasCycle(group, children);

    if (cyclic) {
      totalCycles++;
      // Pure cycle: pick lex-smallest node as representative root
      const representative = roots.length ? roots[0] : [...group].sort()[0];
      hierarchies.push({ root: representative, tree: {}, has_cycle: true });
    } else {
      // One component can have multiple disconnected roots after multi-parent pruning
      const effectiveRoots = roots.length ? roots : [[...group].sort()[0]];

      for (const root of effectiveRoots) {
        totalTrees++;
        const tree = buildNestedTree(root, children);
        const depth = computeDepth(root, children);
        hierarchies.push({ root, tree, depth });
      }
    }
  }

  // Sort hierarchies for deterministic output (non-cyclic by depth desc, then lex root)
  hierarchies.sort((a, b) => {
    if (a.has_cycle && !b.has_cycle) return 1;
    if (!a.has_cycle && b.has_cycle) return -1;
    if (!a.has_cycle && !b.has_cycle) {
      if (b.depth !== a.depth) return b.depth - a.depth;
    }
    return a.root < b.root ? -1 : 1;
  });

  // largest_tree_root: deepest non-cyclic tree; lex tiebreak
  let largestRoot = "";
  let largestDepth = -1;
  for (const h of hierarchies) {
    if (!h.has_cycle) {
      if (h.depth > largestDepth || (h.depth === largestDepth && h.root < largestRoot)) {
        largestDepth = h.depth;
        largestRoot = h.root;
      }
    }
  }

  return {
    user_id: USER_ID,
    email_id: EMAIL_ID,
    college_roll_number: COLLEGE_ROLL,
    hierarchies,
    invalid_entries: invalidList,
    duplicate_edges: duplicateList,
    summary: {
      total_trees: totalTrees,
      total_cycles: totalCycles,
      largest_tree_root: largestRoot,
    },
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.post("/bfhl", (req, res) => {
  const { data } = req.body || {};

  if (!Array.isArray(data)) {
    return res.status(400).json({ error: "Request body must contain a 'data' array." });
  }

  try {
    const result = processData(data);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal processing error." });
  }
});

app.get("/", (_req, res) => res.send("BFHL API is running. POST to /bfhl"));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
