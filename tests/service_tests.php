<?php

require_once __DIR__ . '/../app/Model/DataStore.php';
require_once __DIR__ . '/../app/Model/ProfessionHelper.php';
require_once __DIR__ . '/../app/Model/MiningService.php';
require_once __DIR__ . '/../app/Model/CraftingService.php';

use App\Model\CraftingService;
use App\Model\DataStore;
use App\Model\MiningService;

$store = new DataStore();
$mining = new MiningService($store);
$crafting = new CraftingService($store);

function assertTrue(bool $expr, string $message)
{
    if (!$expr) {
        throw new RuntimeException('Assertion failed: ' . $message);
    }
}

$start = $mining->startMining(1, 1, 101, 1000);
assertTrue(isset($start['task_id']), 'Task id returned for mining');

$taskId = $start['task_id'];

$cancelStart = $mining->startMining(1, 1, 102, 1000);
assertTrue(isset($cancelStart['task_id']), 'Task id returned for cancellable mining');
assertTrue($mining->cancelMining($cancelStart['task_id'])['status'] === 'cancelled', 'Mining task can be cancelled');
$stateAfterCancel = $store->getNodeState(1, 102);
assertTrue($stateAfterCancel['state'] === 'available', 'Node released after cancel');

try {
    $mining->startMining(1, 1, 101, 1000);
    assertTrue(false, 'Reservation should block concurrent mining');
} catch (RuntimeException $e) {
    assertTrue(str_contains($e->getMessage(), 'reserved'), 'Node is reserved');
}

// fast-forward by marking finish time in the past for tests
$task = (new ReflectionProperty($store, 'tasks'));
$task->setAccessible(true);
$tasks = $task->getValue($store);
$tasks[$taskId]['finish_at'] = (new DateTimeImmutable())->sub(new DateInterval('PT1S'));
$task->setValue($store, $tasks);

$result = $mining->finishMining($taskId);
assertTrue($result['status'] === 'completed', 'Mining completion');
assertTrue($result['tool_durability'] === $store->getToolDurability(1, 1000), 'Durability returned matches store');

$durabilityBefore = $store->getToolDurability(1, 1000);
$store->damageTool(1, 1000, $durabilityBefore);
$store->releaseNode(1, 101);

try {
    $mining->startMining(1, 1, 101, 1000);
    assertTrue(false, 'Broken tool should prevent mining');
} catch (RuntimeException $e) {
    assertTrue(str_contains($e->getMessage(), 'broken'), 'Broken tool blocked');
}

$repair = $mining->repairTool(1, 1000, 1, 2);
assertTrue($repair['status'] === 'repaired', 'Repair response');
assertTrue($repair['durability'] > 0, 'Durability restored');

$store->markNodeDepleted(1, 101, (new DateTimeImmutable())->add(new DateInterval('PT5S')));

try {
    $mining->startMining(1, 1, 101, 1000);
    assertTrue(false, 'Depleted node should block until respawn');
} catch (RuntimeException $e) {
    assertTrue(str_contains($e->getMessage(), 'depleted'), 'Node depleted response');
}

$nodeStates = new ReflectionProperty($store, 'nodeStates');
$nodeStates->setAccessible(true);
$states = $nodeStates->getValue($store);
$states[1][101]['respawn_at'] = (new DateTimeImmutable())->sub(new DateInterval('PT1S'));
$nodeStates->setValue($store, $states);

$startAfterRespawn = $mining->startMining(1, 1, 101, 1000);
assertTrue(isset($startAfterRespawn['task_id']), 'Node available after respawn');

$craft = $crafting->craft(1, 1);
assertTrue(isset($craft['task_id']), 'Crafting task created');
$taskId = $craft['task_id'];
$tasks = $task->getValue($store);
$tasks[$taskId]['finish_at'] = (new DateTimeImmutable())->sub(new DateInterval('PT1S'));
$task->setValue($store, $tasks);
$crafted = $crafting->finishCrafting($taskId);
assertTrue($crafted['status'] === 'completed', 'Crafting completion');

echo "All tests passed\n";
