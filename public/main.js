const nodes = [
  { id: 101, x: 30, y: 40, label: 'Copper Ore' },
  { id: 102, x: 120, y: 80, label: 'Tin Ore' },
];

const minimap = document.getElementById('minimap');
const bar = document.getElementById('progress-bar');
const label = document.getElementById('progress-label');
const inventoryEl = document.getElementById('inventory');
const requirementsEl = document.getElementById('requirements');
const dropTarget = document.getElementById('drop-target');
const craftBtn = document.getElementById('craft-btn');

let currentTask = null;
let consumed = {};

nodes.forEach((node) => {
  const el = document.createElement('div');
  el.className = 'node';
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  el.title = node.label;
  el.addEventListener('click', () => startMining(node));
  minimap.appendChild(el);
});

function startMining(node) {
  label.textContent = 'Starting mining...';
  fetch(`../app/Presenters/ApiPresenter.php?action=startMining&userId=1&zoneId=1&nodeId=${node.id}&toolId=1000`)
    .then((r) => r.json())
    .then((data) => {
      if (data.error) throw new Error(data.error);
      currentTask = data.task_id;
      runProgress(data.eta_ms, () => finishMining(currentTask));
    })
    .catch((err) => (label.textContent = err.message));
}

function finishMining(taskId) {
  fetch(`../app/Presenters/ApiPresenter.php?action=finishMining&taskId=${taskId}`)
    .then((r) => r.json())
    .then((data) => {
      if (data.error) throw new Error(data.error);
      label.textContent = `Gained ${data.items_gained[0].qty} ore`;
      refreshInventory();
    })
    .catch((err) => (label.textContent = err.message));
}

function runProgress(duration, callback) {
  const start = Date.now();
  const tick = () => {
    const elapsed = Date.now() - start;
    const pct = Math.min(1, elapsed / duration);
    bar.style.width = `${pct * 100}%`;
    label.textContent = `Progress ${(pct * 100).toFixed(0)}%`;
    if (pct < 1) {
      requestAnimationFrame(tick);
    } else {
      callback();
    }
  };
  tick();
}

function refreshInventory() {
  fetch('../app/Presenters/ApiPresenter.php?action=status&userId=1')
    .then((r) => r.json())
    .then((data) => {
      inventoryEl.innerHTML = '';
      data.inventory.forEach((slot) => {
        const item = document.createElement('div');
        item.className = 'inventory-item';
        item.textContent = `${slot.material_id}: ${slot.qty}`;
        item.draggable = true;
        item.dataset.materialId = slot.material_id;
        item.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', slot.material_id));
        inventoryEl.appendChild(item);
      });
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
    });
}

refreshInventory();

dropTarget.addEventListener('dragover', (e) => {
  e.preventDefault();
});

dropTarget.addEventListener('drop', (e) => {
  e.preventDefault();
  const materialId = parseInt(e.dataTransfer.getData('text/plain'), 10);
  consumed[materialId] = (consumed[materialId] || 0) + 1;
  refreshInventory();
});

craftBtn.addEventListener('click', () => {
  const recipeId = parseInt(document.getElementById('recipe').dataset.recipeId, 10);
  fetch(`../app/Presenters/ApiPresenter.php?action=craft&userId=1&recipeId=${recipeId}`)
    .then((r) => r.json())
    .then((data) => {
      if (data.error) throw new Error(data.error);
      currentTask = data.task_id;
      runProgress(data.eta_ms, () => finishCraft(currentTask));
    })
    .catch((err) => (label.textContent = err.message));
});

function finishCraft(taskId) {
  fetch(`../app/Presenters/ApiPresenter.php?action=finishCraft&taskId=${taskId}`)
    .then((r) => r.json())
    .then((data) => {
      if (data.error) throw new Error(data.error);
      label.textContent = `Crafted item ${data.items_gained[0].item_id}`;
      refreshInventory();
    })
    .catch((err) => (label.textContent = err.message));
}
