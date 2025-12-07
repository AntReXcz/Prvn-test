const API_BASE = 'api.php';
const USER_ID = 1;
const TOOL_ID = 1000;
const MINING_RADIUS = 70;
const MAX_SIMULTANEOUS_NODES = 10;
const NODE_SIZE = 26;
const DEFAULT_BOUNDS = { minX: 0, minY: 0, width: 640, height: 420 };

const minimap = document.getElementById('minimap');
const zoneSelect = document.getElementById('zone-select');
const resetBtn = document.getElementById('reset-session');
const bar = document.getElementById('progress-bar');
const label = document.getElementById('progress-label');
const inventoryEl = document.getElementById('inventory');
const totalsEl = document.getElementById('resource-totals');
const requirementsEl = document.getElementById('requirements');
const recipeSelect = document.getElementById('recipe-select');
const recipeNameEl = document.getElementById('recipe-name');
const professionsEl = document.getElementById('professions');
const skillTreesEl = document.getElementById('skill-trees');
const dropTarget = document.getElementById('drop-target');
const craftBtn = document.getElementById('craft-btn');
const toolStatus = document.getElementById('tool-status');
const repairBtn = document.getElementById('repair-btn');
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');

let nodes = [];
let zones = [];
let nodeElements = new Map();
let consumed = {};
let recipes = [];
let selectedRecipeId = null;
let inventoryCache = [];
let progressRaf = null;
let lastHoverPosition = null;
let activeTasks = new Map();
let pendingStarts = new Set();
let aoeIndicator = null;
let craftTaskId = null;
let currentZoneId = null;
let zoneBounds = { ...DEFAULT_BOUNDS };
let activeTab = 'map';
let skillState = { trees: [], unlocked: [], points: {} };

init();

async function init() {
  setupAoeIndicator();
  minimap.addEventListener('mousemove', handleMinimapMove);
  minimap.addEventListener('mouseleave', handleMinimapLeave);
  zoneSelect.addEventListener('change', handleZoneChange);
  resetBtn.addEventListener('click', resetSession);
  recipeSelect.addEventListener('change', handleRecipeChange);
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tabTarget));
  });
  if (skillTreesEl) {
    skillTreesEl.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.dataset && target.dataset.skillId) {
        const skillId = Number(target.dataset.skillId);
        if (!Number.isNaN(skillId)) {
          unlockSkill(skillId);
        }
      }
    });
  }
  window.addEventListener('resize', () => {
    positionNodes();
    syncAoeIndicator();
  });

  switchTab(activeTab);
  setStatus('Načítám mapy...');
  await Promise.all([loadZones(), refreshInventory()]);
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

async function loadZones() {
  try {
    const data = await callApi({ action: 'listZones' });
    zones = data.zones || [];
    zoneSelect.innerHTML = '';
    zones.forEach((zone) => {
      const opt = document.createElement('option');
      opt.value = zone.id;
      opt.textContent = `${zone.name} (${zone.biome})`;
      zoneSelect.appendChild(opt);
    });

    const firstZone = zones[0];
    if (currentZoneId === null || !zones.some((z) => z.id === currentZoneId)) {
      currentZoneId = firstZone ? firstZone.id : null;
    }

    if (currentZoneId !== null) {
      zoneSelect.value = currentZoneId;
      await loadZone();
    }
  } catch (err) {
    setStatus(err.message);
  }
}

async function resetSession() {
  setStatus('Resetuji demo...');
  cancelAllActiveTasks('Resetuji demo');
  resetProgress();
  try {
    const data = await callApi({ action: 'resetSession' });
    zones = data.zones || [];
    zoneSelect.innerHTML = '';
    zones.forEach((zone) => {
      const opt = document.createElement('option');
      opt.value = zone.id;
      opt.textContent = `${zone.name} (${zone.biome})`;
      zoneSelect.appendChild(opt);
    });
    currentZoneId = zones[0] ? zones[0].id : null;
    if (currentZoneId !== null) {
      zoneSelect.value = currentZoneId;
      await Promise.all([loadZone(), refreshInventory()]);
    }
    setStatus('Hotovo. Session resetována.');
  } catch (err) {
    setStatus(err.message);
  }
}

async function loadZone() {
  if (currentZoneId === null) {
    return;
  }
  setStatus('Načítám mapu...');
  try {
    const data = await callApi({ action: 'zoneStatus', zoneId: currentZoneId });
    nodes = data.nodes || [];
    zoneBounds = computeZoneBounds(nodes);
    applyMinimapAspect();
    renderNodes();
    positionNodes();
    syncAoeIndicator();
    const zoneMeta = zones.find((z) => z.id === currentZoneId);
    if (zoneMeta && zoneMeta.biome) {
      minimap.dataset.biome = zoneMeta.biome;
    } else {
      delete minimap.dataset.biome;
    }
    const zoneName = zoneMeta ? zoneMeta.name : 'Mapa';
    setStatus(`${zoneName} načtena.`);
  } catch (err) {
    setStatus(err.message);
  }
}

async function handleZoneChange(event) {
  const nextZoneId = Number(event.target.value);
  if (Number.isNaN(nextZoneId) || nextZoneId === currentZoneId) {
    return;
  }

  cancelAllActiveTasks('Přesun na jinou mapu.');
  resetProgress();
  nodes = [];
  zoneBounds = { ...DEFAULT_BOUNDS };
  applyMinimapAspect();
  renderNodes();
  positionNodes();
  currentZoneId = nextZoneId;
  await loadZone();
}

function handleRecipeChange(event) {
  const nextId = Number(event.target.value);
  if (Number.isNaN(nextId)) {
    return;
  }
  selectedRecipeId = nextId;
  renderRecipes();
}

function switchTab(target) {
  const next = target || 'map';
  activeTab = next;

  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tabTarget === next;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.tab === next;
    panel.classList.toggle('is-active', isActive);
  });

  if (next === 'map') {
    positionNodes();
    syncAoeIndicator();
  }
}

function renderNodes() {
  minimap.innerHTML = '';
  nodeElements.clear();

  nodes.forEach((node) => {
    const el = document.createElement('div');
    const materialSlug = (node.material_name || `${node.material_id}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    el.className = `node state-${node.state} material-${materialSlug}`;
    el.title = `${node.material_name} (${node.state})`;
    if (node.state !== 'available') {
      el.classList.add('disabled');
    }
    nodeElements.set(node.node_id, el);
    minimap.appendChild(el);
  });

  setupAoeIndicator();
  positionNodes();
}

function computeZoneBounds(nodeList) {
  if (!nodeList.length) {
    return { ...DEFAULT_BOUNDS };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  nodeList.forEach((node) => {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x + NODE_SIZE);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y + NODE_SIZE);
  });

  const padding = 30;
  return {
    minX: minX - padding,
    minY: minY - padding,
    width: Math.max(1, maxX - minX) + padding * 2,
    height: Math.max(1, maxY - minY) + padding * 2,
  };
}

function applyMinimapAspect() {
  minimap.style.aspectRatio = `${Math.max(1, zoneBounds.width)} / ${Math.max(1, zoneBounds.height)}`;
}

function getRenderMetrics() {
  const rect = minimap.getBoundingClientRect();
  const width = Math.max(1, zoneBounds.width);
  const height = Math.max(1, zoneBounds.height);
  const scale = Math.min(rect.width / width, rect.height / height);
  const offsetX = (rect.width - width * scale) / 2 - zoneBounds.minX * scale;
  const offsetY = (rect.height - height * scale) / 2 - zoneBounds.minY * scale;
  return { scale, offsetX, offsetY };
}

function worldToScreen(x, y, metrics) {
  return {
    x: x * metrics.scale + metrics.offsetX,
    y: y * metrics.scale + metrics.offsetY,
  };
}

function screenToWorld(x, y, metrics) {
  return {
    x: (x - metrics.offsetX) / metrics.scale,
    y: (y - metrics.offsetY) / metrics.scale,
  };
}

function positionNodes() {
  if (!nodeElements.size) {
    return;
  }
  const metrics = getRenderMetrics();
  const scaledSize = Math.max(18, NODE_SIZE * metrics.scale);
  nodeElements.forEach((el, nodeId) => {
    const node = nodes.find((n) => n.node_id === nodeId);
    if (!node) {
      return;
    }
    const screen = worldToScreen(node.x, node.y, metrics);
    el.style.left = `${screen.x}px`;
    el.style.top = `${screen.y}px`;
    el.style.width = `${scaledSize}px`;
    el.style.height = `${scaledSize}px`;
  });
  syncAoeIndicator(metrics);
}

function updateAoeIndicator(metrics, screenX, screenY) {
  if (!aoeIndicator) {
    return;
  }
  const diameter = MINING_RADIUS * 2 * metrics.scale;
  aoeIndicator.style.display = 'block';
  aoeIndicator.style.width = `${diameter}px`;
  aoeIndicator.style.height = `${diameter}px`;
  aoeIndicator.style.left = `${screenX}px`;
  aoeIndicator.style.top = `${screenY}px`;
}

function syncAoeIndicator(metrics = null) {
  if (!lastHoverPosition || !aoeIndicator) {
    return;
  }
  const renderMetrics = metrics || getRenderMetrics();
  const screen = worldToScreen(lastHoverPosition.x, lastHoverPosition.y, renderMetrics);
  updateAoeIndicator(renderMetrics, screen.x, screen.y);
}

function getNodeCenter(node) {
  return {
    x: node.x + NODE_SIZE / 2,
    y: node.y + NODE_SIZE / 2,
  };
}

function handleMinimapMove(event) {
  const rect = minimap.getBoundingClientRect();
  const screenX = event.clientX - rect.left;
  const screenY = event.clientY - rect.top;
  const metrics = getRenderMetrics();
  const worldPos = screenToWorld(screenX, screenY, metrics);
  lastHoverPosition = { x: worldPos.x, y: worldPos.y };

  updateAoeIndicator(metrics, screenX, screenY);

  const inRangeNodes = [];
  nodes.forEach((node) => {
    const center = getNodeCenter(node);
    const distance = Math.hypot(center.x - worldPos.x, center.y - worldPos.y);
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
      zoneId: currentZoneId,
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
      materialName: node.material_name || 'uzel',
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
  const center = getNodeCenter(node);
  const distance = Math.hypot(center.x - lastHoverPosition.x, center.y - lastHoverPosition.y);
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
    const xp = data.xp_gained ? `, +${data.xp_gained} XP` : '';
    setStatus(
      `Získáno ${qty} ${name}${xp} (odolnost nástroje ${data.tool_durability}/${toolStatus.dataset.maxDurability || '?'})`
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
    const tasks = Array.from(activeTasks.values());
    let next = null;
    tasks.forEach((t) => {
      const end = t.startedAt + t.etaMs;
      if (!next || end < next.endTime) {
        next = { task: t, endTime: end };
      }
    });

    if (!next) {
      resetProgress();
      setStatus('Idle');
      progressRaf = null;
      return;
    }

    const duration = Math.max(1, next.task.etaMs);
    const elapsed = Math.max(0, now - next.task.startedAt);
    const pct = Math.min(1, elapsed / duration);

    bar.style.width = `${pct * 100}%`;
    setStatus(`Těžím ${activeTasks.size} uzlů – ${next.task.materialName} ${(pct * 100).toFixed(0)}%`);
    progressRaf = requestAnimationFrame(tick);
  };

  progressRaf = requestAnimationFrame(tick);
}

async function refreshInventory() {
  const data = await callApi({ action: 'status', userId: USER_ID });
  inventoryCache = data.inventory || [];
  recipes = data.recipes || recipes;
  skillState = data.skills || skillState;
  if (!selectedRecipeId && recipes.length) {
    selectedRecipeId = recipes[0].id;
  }

  renderInventory(inventoryCache);
  renderRecipes();
  renderTools(data.tools || []);
  renderProfessions(data.professions || []);
  renderSkillTrees(skillState);
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

function renderRecipes() {
  requirementsEl.innerHTML = '';
  recipeSelect.innerHTML = '';

  if (!recipes.length) {
    const empty = document.createElement('div');
    empty.textContent = 'Žádné recepty';
    requirementsEl.appendChild(empty);
    recipeSelect.disabled = true;
    return;
  }

  recipeSelect.disabled = false;
  recipes.forEach((recipe) => {
    const opt = document.createElement('option');
    opt.value = recipe.id;
    opt.textContent = recipe.name;
    if (recipe.id === selectedRecipeId) {
      opt.selected = true;
    }
    recipeSelect.appendChild(opt);
  });

  const active = recipes.find((r) => r.id === selectedRecipeId) || recipes[0];
  selectedRecipeId = active.id;
  document.getElementById('recipe').dataset.recipeId = active.id;
  recipeNameEl.textContent = active.name;

  renderRequirements(active);
}

function renderRequirements(recipe) {
  requirementsEl.innerHTML = '';
  const inventoryById = inventoryCache.reduce((acc, slot) => {
    acc[slot.material_id] = slot.qty;
    return acc;
  }, {});

  recipe.requirements.forEach((req) => {
    const reqEl = document.createElement('div');
    reqEl.className = 'requirement';
    const available = inventoryById[req.material_id] || 0;
    const labelText = req.name || `Material ${req.material_id}`;
    reqEl.textContent = `${labelText}: ${available}/${req.qty}`;
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
  const recipeId = selectedRecipeId || parseInt(document.getElementById('recipe').dataset.recipeId, 10);
  const recipe = recipes.find((r) => r.id === recipeId);
  const recipeName = recipe ? recipe.name : 'Craft';
  setStatus(`Crafting ${recipeName}...`);
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
    const xp = data.xp_gained ? `, +${data.xp_gained} XP` : '';
    setStatus(`Crafted item ${craftedId}${xp}`);
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

function renderProfessions(professions) {
  professionsEl.innerHTML = '';
  if (!professions.length) {
    professionsEl.textContent = 'Žádná profese';
    return;
  }

  professions.forEach((prof) => {
    const card = document.createElement('div');
    card.className = 'profession-card';
    const nextXp = prof.next_level_xp;
    const currentXp = prof.xp || 0;
    const pct = nextXp ? Math.min(1, currentXp / nextXp) : 1;
    const percentText = Math.round(pct * 100);
    const nextText = nextXp ? `${currentXp}/${nextXp} XP` : `${currentXp} XP (max)`;

    const speedMod = prof.modifiers && prof.modifiers.speed_multiplier ? prof.modifiers.speed_multiplier : 1;
    const speedText = speedMod !== 1 ? `Rychlost ×${(1 / speedMod).toFixed(2)}` : 'Základní rychlost';

    card.innerHTML = `
      <div class="profession-header">
        <span class="profession-name">${prof.name}</span>
        <span class="profession-level">Lv ${prof.level || 1}</span>
      </div>
      <div class="xp-track">
        <div class="xp-bar" style="width:${percentText}%"></div>
      </div>
      <div class="xp-meta">${nextText} • ${speedText} • SP: ${prof.skill_points ?? 0}</div>
    `;

    professionsEl.appendChild(card);
  });
}

function renderSkillTrees(data) {
  if (!skillTreesEl) {
    return;
  }

  skillTreesEl.innerHTML = '';
  const trees = Array.isArray(data.trees) ? data.trees : [];
  const unlocked = new Set(Array.isArray(data.unlocked) ? data.unlocked : []);

  if (!trees.length) {
    skillTreesEl.textContent = 'Žádné dovednosti';
    return;
  }

  trees.forEach((tree) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'skill-tree';
    const points = tree.points || 0;
    const title = document.createElement('div');
    title.className = 'skill-tree__header';
    title.innerHTML = `
      <div>
        <p class="eyebrow">${tree.profession_name || 'Profese'}</p>
        <h3>${tree.profession_name || 'Profese'}</h3>
      </div>
      <div class="skill-tree__points">SP: <strong>${points}</strong></div>
    `;
    wrapper.appendChild(title);

    const list = document.createElement('div');
    list.className = 'skill-tree__list';
    (tree.skills || []).forEach((skill) => {
      const isUnlocked = unlocked.has(skill.id);
      const requiresMet = (skill.requires || []).every((req) => unlocked.has(req));
      const available = !isUnlocked && requiresMet && points >= (skill.cost || 1);

      const node = document.createElement('div');
      node.className = 'skill-node';
      node.classList.toggle('skill-node--unlocked', isUnlocked);
      node.classList.toggle('skill-node--available', available);

      const modifiersText = formatModifiers(skill.modifiers || {});
      const requiresText = (skill.requires || []).length
        ? `Vyžaduje: ${skill.requires.join(', ')}`
        : 'Začátek linie';

      node.innerHTML = `
        <div class="skill-node__title">${skill.name || 'Skill'} <span class="skill-node__cost">${skill.cost || 1} SP</span></div>
        <p class="skill-node__desc">${skill.description || ''}</p>
        <p class="skill-node__mods">${modifiersText}</p>
        <p class="skill-node__req">${requiresText}</p>
      `;

      if (available) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'skill-node__unlock';
        btn.textContent = 'Odemknout';
        btn.dataset.skillId = String(skill.id);
        node.appendChild(btn);
      } else if (isUnlocked) {
        const badge = document.createElement('div');
        badge.className = 'skill-node__status';
        badge.textContent = 'Odemčeno';
        node.appendChild(badge);
      }

      list.appendChild(node);
    });

    wrapper.appendChild(list);
    skillTreesEl.appendChild(wrapper);
  });
}

function formatModifiers(mods) {
  const parts = [];
  if (mods.speed_multiplier && mods.speed_multiplier !== 1) {
    const faster = mods.speed_multiplier < 1;
    const pct = Math.round(Math.abs((1 - mods.speed_multiplier) * 100));
    parts.push(`${faster ? '-' : '+'}${pct}% čas těžby/craftu`);
  }
  if (mods.cost_multiplier && mods.cost_multiplier !== 1) {
    const pct = Math.round(Math.abs((1 - mods.cost_multiplier) * 100));
    parts.push(`-${pct}% náklady`);
  }
  if (mods.yield_bonus) {
    parts.push(`+${mods.yield_bonus} loot`);
  }
  if (mods.xp_bonus) {
    const pct = Math.round((mods.xp_bonus || 0) * 100);
    parts.push(`+${pct}% XP`);
  }
  return parts.length ? parts.join(' • ') : 'Bez bonusu';
}

async function unlockSkill(skillId) {
  setStatus('Odemikám dovednost...');
  try {
    const data = await callApi({ action: 'unlockSkill', userId: USER_ID, skillId });
    if (data.skills) {
      skillState = data.skills;
    }
    await refreshInventory();
    setStatus('Skill odemčen');
  } catch (err) {
    setStatus(err.message);
  }
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
