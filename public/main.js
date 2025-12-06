const API_BASE = 'api.php';
const USER_ID = 1;
const ZONE_ID = 1;
const TOOL_ID = 1000;

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
let currentTask = null;
let consumed = {};
let progressRaf = null;
let hoveredNodeId = null;

init();

async function init() {
  setStatus('Loading zone...');
  await Promise.all([loadZone(), refreshInventory()]);
  setStatus('Idle');
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
  nodes.forEach((node) => {
    const el = document.createElement('div');
    el.className = `node state-${node.state}`;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.title = `${node.material_name} (${node.state})`;
    if (node.state !== 'available') {
      el.classList.add('disabled');
    }
    el.addEventListener('mouseenter', () => {
      hoveredNodeId = node.node_id;
      startMining(node, el);
    });
    el.addEventListener('mouseleave', () => {
      hoveredNodeId = null;
      cancelActiveTask('Těžba přerušena (kurzor mimo rudu).', node.node_id);
    });
    minimap.appendChild(el);
  });
}

async function startMining(node, el) {
  if (currentTask) {
    setStatus('Already working on a task.');
    return;
  }

  if (node.state !== 'available') {
    setStatus('Node is not available yet.');
    return;
  }

  setStatus('Starting mining...');
  try {
    const data = await callApi({
      action: 'startMining',
      userId: USER_ID,
      zoneId: ZONE_ID,
      nodeId: node.node_id,
      toolId: TOOL_ID,
    });
    if (hoveredNodeId !== node.node_id) {
      await callApi({ action: 'cancelTask', taskId: data.task_id });
      resetProgress();
      return;
    }
    currentTask = {
      id: data.task_id,
      nodeId: node.node_id,
      cancelled: false,
    };
    el.dataset.activeNode = '1';
    runProgress(data.eta_ms, () => finishMining(currentTask.id), currentTask);
  } catch (err) {
    setStatus(err.message);
    await loadZone();
  }
}

async function finishMining(taskId) {
  const taskSnapshot = currentTask;
  currentTask = null;
  resetProgress();

  try {
    const data = await callApi({ action: 'finishMining', taskId });
    const gained = Array.isArray(data.items_gained) && data.items_gained.length ? data.items_gained[0] : null;
    const materialId = gained ? gained.material_id : null;
    const matchedNode = nodes.find((n) => n.material_id === materialId);
    const name = matchedNode ? matchedNode.material_name : 'material';
    const qty = gained ? gained.qty : 0;
    setStatus(
      `Gained ${qty} ${name} (tool durability ${data.tool_durability}/${toolStatus.dataset.maxDurability || '?'})`
    );
    await Promise.all([refreshInventory(), loadZone()]);
  } catch (err) {
    setStatus(err.message);
    if (taskSnapshot && taskSnapshot.nodeId) {
      await loadZone();
    }
  }
}

function runProgress(duration, callback, taskRef) {
  const start = Date.now();
  const tick = () => {
    if (taskRef && taskRef.cancelled) {
      resetProgress();
      return;
    }
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

async function cancelActiveTask(reason, nodeId) {
  if (!currentTask) {
    return;
  }

  const taskId = currentTask.id;
  currentTask.cancelled = true;
  currentTask = null;
  resetProgress();
  setStatus(reason);

  if (taskId) {
    try {
      await callApi({ action: 'cancelTask', taskId });
    } catch (err) {
      console.warn('Failed to cancel task', err);
    }
  }

  if (nodeId) {
    await loadZone();
  }
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
    const label = slot.name ? `${slot.name}` : `Material ${slot.material_id}`;
    item.textContent = `${label}: ${slot.qty}`;
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
      const label = slot.name ? slot.name : `Material ${slot.material_id}`;
      row.innerHTML = `<span>${label}</span><strong>${slot.qty}</strong>`;
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
    currentTask = data.task_id;
    runProgress(data.eta_ms, () => finishCraft(currentTask));
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
    currentTask = null;
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

async function callApi(params) {
  const query = new URLSearchParams(params);
  const res = await fetch(`${API_BASE}?${query.toString()}`);
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}
