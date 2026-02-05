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

$version = $store->getVersion();
assertTrue($version === DataStore::DATA_VERSION, 'Datastore exposes current version');

$zones = $store->getZones();
assertTrue(count($zones) >= 3, 'Multiple zones are seeded');

function assertTrue(bool $expr, string $message)
{
    if (!$expr) {
        throw new RuntimeException('Assertion failed: ' . $message);
    }
}

$start = $mining->startMining(1, 1, 101, 1000);
assertTrue(isset($start['task_id']), 'Task id returned for mining');

$taskId = $start['task_id'];
$userBeforeMining = $store->getUser(1);
$xpBeforeMining = $userBeforeMining['professions'][1]['xp'];

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
$userAfterMining = $store->getUser(1);
assertTrue($userAfterMining['professions'][1]['xp'] > $xpBeforeMining, 'Mining awards XP');

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
$user = $store->getUser(1);
assertTrue($user['professions'][2]['xp'] >= 50, 'Crafting awards XP');

$user['professions'][2]['xp'] = 140;
$user['professions'][2]['level'] = 1;
$store->updateUser(1, $user);
$craftLevelUp = $crafting->craft(1, 1);
$taskId = $craftLevelUp['task_id'];
$tasks = $task->getValue($store);
$tasks[$taskId]['finish_at'] = (new DateTimeImmutable())->sub(new DateInterval('PT1S'));
$task->setValue($store, $tasks);
$crafting->finishCrafting($taskId);
$userAfterCraft = $store->getUser(1);
assertTrue($userAfterCraft['professions'][2]['level'] > 1, 'Crafting XP can level up Smithing');

$copperCraft = $crafting->craft(1, 2);
assertTrue(isset($copperCraft['task_id']), 'Copper ingot craft task created');
$tasks = $task->getValue($store);
$tasks[$copperCraft['task_id']]['finish_at'] = (new DateTimeImmutable())->sub(new DateInterval('PT1S'));
$task->setValue($store, $tasks);
$crafting->finishCrafting($copperCraft['task_id']);
assertTrue($store->getInventoryQty(1, 6) === 1, 'Copper ingot added to inventory');

$userBoosted = $store->getUser(1);
$userBoosted['professions'][2]['xp'] = 200; // ensure level 2 smithing cost reduction
$store->updateUser(1, $userBoosted);
$tinCraft = $crafting->craft(1, 3);
$tasks = $task->getValue($store);
$tasks[$tinCraft['task_id']]['finish_at'] = (new DateTimeImmutable())->sub(new DateInterval('PT1S'));
$task->setValue($store, $tasks);
$crafting->finishCrafting($tinCraft['task_id']);
assertTrue($store->getInventoryQty(1, 7) === 1, 'Tin ingot added to inventory');

$skillStore = new DataStore();
$skillMining = new MiningService($skillStore);
$skillCrafting = new CraftingService($skillStore);

$userSkill = $skillStore->getUser(1);
$userSkill['professions'][1]['xp'] = 90; // close to level 2
$skillStore->updateUser(1, $userSkill);
$startSkill = $skillMining->startMining(1, 1, 101, 1000);
$skillTasks = new ReflectionProperty($skillStore, 'tasks');
$skillTasks->setAccessible(true);
$skillTaskList = $skillTasks->getValue($skillStore);
$skillTaskList[$startSkill['task_id']]['finish_at'] = (new DateTimeImmutable())->sub(new DateInterval('PT1S'));
$skillTasks->setValue($skillStore, $skillTaskList);
$skillMining->finishMining($startSkill['task_id']);
$pointsAfterLevel = $skillStore->getSkillPoints(1, 1);
assertTrue($pointsAfterLevel > 1, 'Mining level-up grants skill points');

$unlockResult = $skillStore->unlockSkill(1, 101);
assertTrue($unlockResult['status'] === 'unlocked' || $unlockResult['status'] === 'already_unlocked', 'Skill unlock works');
$mods = $skillStore->getSkillModifiers(1, 1);
assertTrue($mods['speed_multiplier'] < 1, 'Unlocked mining skill speeds up actions');

$skillStore->unlockSkill(1, 201);
$smithReqs = $skillStore->getRecipeRequirementsForUser(1, 2);
$copperCost = $smithReqs[0]['qty'] ?? 0;
assertTrue($copperCost < 10, 'Smithing skill reduces copper cost');

echo "All tests passed\n";
