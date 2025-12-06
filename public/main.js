const API_BASE = 'api.php';
const USER_ID = 1;
const ZONE_ID = 1;
const TOOL_ID = 1000;
const MINING_RADIUS = 60;
const MAX_SIMULTANEOUS_NODES = 10;
const NODE_SIZE = 18;

const minimap = document.getElementById('minimap');
const bar = document.getElementById('progress-bar');
const label = document.getElementById('progress-label');
const inventoryEl = document.getElementById('inventory');
const totalsEl = document.getElementById('resource-totals');
const requirementsEl = document.getElementById('requirements');
const dropTarget = document.getElementById('drop-target');
const craftBtn = document.getElementById('craft-btn');
const toolStatus = document.getElementById('tool-status');
const repairBtn = document.getElementById('repair-btn');

let nodes = [];
let nodeElements = new Map();
let consumed = {};
let progressRaf = null;
let lastHoverPosition = null;
let activeTasks = new Map();
let pendingStarts = new Set();
let aoeIndicator = null;
let craftTaskId = null;

init();

async function init() {
  setupAoeIndicator();
  minimap.addEventListener('mousemove', handleMinimapMove);
  minimap.addEventListener('mouseleave', handleMinimapLeave);

  setStatus('Loading zone...');
  await Promise.all([loadZone(), refreshInventory()]);
  setStatus('Idle');
}

function setupAoeIndicator() {
  if (!aoeIndicator) {
    aoeIndicator = document.createElement('div');
    aoeIndicator.className = 'aoe-indicator';
    aoeIndicator.style.display = 'none';
  }
  if (!aoeIndicator.parentNode) {
    minimap.appendChild(aoeIndicator);
  }
}

async function loadZone() {
  try {
    const data = await callApi({ action: 'zoneStatus', zoneId: ZONE_ID });
    nodes = data.nodes || [];
    renderNodes();
  } catch (err) {
    setStatus(err.message);
  }
}

function renderNodes() {
  minimap.innerHTML = '';
  nodeElements.clear();

  nodes.forEach((node) => {
    const el = document.createElement('div');
    el.className = `node state-${node.state}`;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.title = `${node.material_name} (${node.state})`;
    if (node.state !== 'available') {
      el.classList.add('disabled');
    }
    nodeElements.set(node.node_id, el);
    minimap.appendChild(el);
  });

  setupAoeIndicator();
}

function handleMinimapMove(event) {
  const rect = minimap.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  lastHoverPosition = { x, y };

  aoeIndicator.style.display = 'block';
  aoeIndicator.style.left = `${x}px`;
  aoeIndicator.style.top = `${y}px`;

  const inRangeNodes = [];
  nodes.forEach((node) => {
    const centerX = node.x + NODE_SIZE / 2;
    const centerY = node.y + NODE_SIZE / 2;
    const distance = Math.hypot(centerX - x, centerY - y);
    const inside = distance <= MINING_RADIUS;
    const el = nodeElements.get(node.node_id);
    if (el) {
      el.classList.toggle('in-range', inside);
    }
    if (inside) {
      inRangeNodes.push(node);
    }
  });

  manageAreaMining(inRangeNodes);
}

function handleMinimapLeave() {
  lastHoverPosition = null;
  aoeIndicator.style.display = 'none';
  nodeElements.forEach((el) => el.classList.remove('in-range'));
  cancelAllActiveTasks('Těžba přerušena (mimo mapu).');
}

function manageAreaMining(inRangeNodes) {
  const inRangeIds = new Set(inRangeNodes.map((n) => n.node_id));

  Array.from(activeTasks.keys()).forEach((nodeId) => {
    if (!inRangeIds.has(nodeId)) {
      cancelTaskForNode(nodeId, 'Těžba přerušena (mimo dosah).');
    }
  });

  const availableNodes = inRangeNodes
    .filter((n) => n.state === 'available')
    .slice(0, MAX_SIMULTANEOUS_NODES);

  availableNodes.forEach((node) => {
    if (!activeTasks.has(node.node_id) && !pendingStarts.has(node.node_id)) {
      startAreaMining(node);
    }
  });

  if (!availableNodes.length && !activeTasks.size) {
    setStatus('Žádné uzly v dosahu.');
    resetProgress();
  }
}

async function startAreaMining(node) {
  pendingStarts.add(node.node_id);
  setStatus('Spouštím těžbu...');
  try {
    const data = await callApi({
      action: 'startMining',
      userId: USER_ID,
      zoneId: ZONE_ID,
      nodeId: node.node_id,
      toolId: TOOL_ID,
    });

    if (!isNodeStillInRange(node)) {
      await callApi({ action: 'cancelTask', taskId: data.task_id });
      return;
    }

    const startedAt = Date.now();
    const taskInfo = {
      taskId: data.task_id,
      nodeId: node.node_id,
      startedAt,
      etaMs: data.eta_ms,
      timer: null,
    };

    taskInfo.timer = setTimeout(() => finishAreaMining(taskInfo), data.eta_ms);
    activeTasks.set(node.node_id, taskInfo);
    updateProgressLoop();
  } catch (err) {
    setStatus(err.message);
    await loadZone();
  } finally {
    pendingStarts.delete(node.node_id);
  }
}

function isNodeStillInRange(node) {
  if (!lastHoverPosition) {
    return false;
  }
  const centerX = node.x + NODE_SIZE / 2;
  const centerY = node.y + NODE_SIZE / 2;
  const distance = Math.hypot(centerX - lastHoverPosition.x, centerY - lastHoverPosition.y);
  return distance <= MINING_RADIUS;
}

async function cancelTaskForNode(nodeId, reason) {
  const task = activeTasks.get(nodeId);
  if (!task) {
    return;
  }
  activeTasks.delete(nodeId);
  if (task.timer) {
    clearTimeout(task.timer);
  }
  setStatus(reason);
  try {
    await callApi({ action: 'cancelTask', taskId: task.taskId });
  } catch (err) {
    console.warn('Failed to cancel task', err);
  }
  updateProgressLoop();
}

function cancelAllActiveTasks(reason) {
  Array.from(activeTasks.keys()).forEach((nodeId) => cancelTaskForNode(nodeId, reason));
}

async function finishAreaMining(taskInfo) {
  const existing = activeTasks.get(taskInfo.nodeId);
  if (!existing || existing.taskId !== taskInfo.taskId) {
    return;
  }
  activeTasks.delete(taskInfo.nodeId);
  if (existing.timer) {
    clearTimeout(existing.timer);
  }
  try {
    const data = await callApi({ action: 'finishMining', taskId: taskInfo.taskId });
    const gained = Array.isArray(data.items_gained) && data.items_gained.length ? data.items_gained[0] : null;
    const materialId = gained ? gained.material_id : null;
    const matchedNode = nodes.find((n) => n.material_id === materialId);
    const name = matchedNode ? matchedNode.material_name : 'materiál';
    const qty = gained ? gained.qty : 0;
    setStatus(
      `Získáno ${qty} ${name} (odolnost nástroje ${data.tool_durability}/${toolStatus.dataset.maxDurability || '?'})`
    );
    await Promise.all([refreshInventory(), loadZone()]);
  } catch (err) {
    setStatus(err.message);
    await loadZone();
  } finally {
    updateProgressLoop();
  }
}

function updateProgressLoop() {
  if (progressRaf) {
    cancelAnimationFrame(progressRaf);
    progressRaf = null;
  }

  const tick = () => {
    if (!activeTasks.size) {
      resetProgress();
      setStatus('Idle');
      progressRaf = null;
      return;
    }

    const now = Date.now();
    const starts = Array.from(activeTasks.values()).map((t) => t.startedAt);
    const ends = Array.from(activeTasks.values()).map((t) => t.startedAt + t.etaMs);
    const areaStart = Math.min(...starts);
    const areaEnd = Math.max(...ends);
    const pct = Math.min(1, (now - areaStart) / (areaEnd - areaStart));
    bar.style.width = `${pct * 100}%`;
    setStatus(`Těžím ${activeTasks.size} uzlů (${(pct * 100).toFixed(0)}%)`);
    progressRaf = requestAnimationFrame(tick);
  };

  progressRaf = requestAnimationFrame(tick);
}

async function refreshInventory() {
  const data = await callApi({ action: 'status', userId: USER_ID });
  renderInventory(data.inventory || []);
  renderRequirements();
  renderTools(data.tools || []);
}

function renderInventory(slots) {
  inventoryEl.innerHTML = '';
  slots.forEach((slot) => {
    const item = document.createElement('div');
    item.className = 'inventory-item';
    const labelText = slot.name ? `${slot.name}` : `Material ${slot.material_id}`;
    item.textContent = `${labelText}: ${slot.qty}`;
    item.draggable = true;
    item.dataset.materialId = slot.material_id;
    item.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', slot.material_id));
    inventoryEl.appendChild(item);
  });
  renderTotals(slots);
}

function renderTotals(slots) {
  totalsEl.innerHTML = '';
  if (!slots.length) {
    totalsEl.textContent = 'Zatím nic netěžíte';
    return;
  }

  slots
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .forEach((slot) => {
      const row = document.createElement('div');
      row.className = 'resource-row';
      const labelText = slot.name ? slot.name : `Material ${slot.material_id}`;
      row.innerHTML = `<span>${labelText}</span><strong>${slot.qty}</strong>`;
      totalsEl.appendChild(row);
    });
}

function renderRequirements() {
  requirementsEl.innerHTML = '';
  const recipeReqs = [
    { material_id: 1, qty: 2 },
    { material_id: 2, qty: 1 },
  ];
  recipeReqs.forEach((req) => {
    const reqEl = document.createElement('div');
    reqEl.className = 'requirement';
    const dropped = consumed[req.material_id] || 0;
    reqEl.textContent = `Material ${req.material_id}: ${dropped}/${req.qty}`;
    requirementsEl.appendChild(reqEl);
  });
}

function renderTools(tools) {
  toolStatus.innerHTML = '';
  tools.forEach((tool) => {
    toolStatus.dataset.maxDurability = tool.max_durability;
    const card = document.createElement('div');
    card.className = 'tool-card';
    const percent = Math.round((tool.durability / tool.max_durability) * 100);
    card.innerHTML = `
      <strong>${tool.name} (x${tool.qty})</strong>
      <div>Durability: ${tool.durability}/${tool.max_durability} (${percent}%)</div>
    `;
    toolStatus.appendChild(card);
  });
}

dropTarget.addEventListener('dragover', (e) => {
  e.preventDefault();
});

dropTarget.addEventListener('drop', (e) => {
  e.preventDefault();
  const materialId = parseInt(e.dataTransfer.getData('text/plain'), 10);
  consumed[materialId] = (consumed[materialId] || 0) + 1;
  refreshInventory();
});

craftBtn.addEventListener('click', async () => {
  const recipeId = parseInt(document.getElementById('recipe').dataset.recipeId, 10);
  setStatus('Crafting...');
  try {
    const data = await callApi({ action: 'craft', userId: USER_ID, recipeId });
    craftTaskId = data.task_id;
    runProgress(data.eta_ms, () => finishCraft(craftTaskId));
  } catch (err) {
    setStatus(err.message);
  }
});

async function finishCraft(taskId) {
  try {
    const data = await callApi({ action: 'finishCraft', taskId });
    const crafted = Array.isArray(data.items_gained) && data.items_gained.length ? data.items_gained[0] : null;
    const craftedId = crafted ? crafted.item_id : 'unknown';
    setStatus(`Crafted item ${craftedId}`);
    await refreshInventory();
  } catch (err) {
    setStatus(err.message);
  } finally {
    craftTaskId = null;
  }
}

repairBtn.addEventListener('click', async () => {
  setStatus('Repairing tool...');
  try {
    const data = await callApi({
      action: 'repairTool',
      userId: USER_ID,
      toolId: TOOL_ID,
      materialId: 1,
      materialQty: 2,
    });
    setStatus(`Tool repaired to ${data.durability} durability (used ${data.materials_used} ores)`);
    await refreshInventory();
  } catch (err) {
    setStatus(err.message);
  }
});

function setStatus(text) {
  label.textContent = text;
}

function resetProgress() {
  if (progressRaf) {
    cancelAnimationFrame(progressRaf);
    progressRaf = null;
  }
  bar.style.width = '0%';
}

function runProgress(duration, callback) {
  const start = Date.now();
  const tick = () => {
    const elapsed = Date.now() - start;
    const pct = Math.min(1, elapsed / duration);
    bar.style.width = `${pct * 100}%`;
    setStatus(`Progress ${(pct * 100).toFixed(0)}%`);
    if (pct < 1) {
      progressRaf = requestAnimationFrame(tick);
    } else {
      callback();
    }
  };
  tick();
}

async function callApi(params) {
  const query = new URLSearchParams(params);
  const res = await fetch(`${API_BASE}?${query.toString()}`);
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}
