<?php

require_once __DIR__ . '/../app/Model/DataStore.php';
require_once __DIR__ . '/../app/Model/ProfessionHelper.php';
require_once __DIR__ . '/../app/Model/MiningService.php';
require_once __DIR__ . '/../app/Model/CraftingService.php';
require_once __DIR__ . '/../app/Presenters/ApiPresenter.php';

use App\Presenters\ApiPresenter;
use App\Model\DataStore;

$presenter = new ApiPresenter(new DataStore());

$startResponse = json_decode($presenter->handle(['action' => 'startMining', 'userId' => 1, 'zoneId' => 1, 'nodeId' => 101, 'toolId' => 1000]), true);
$taskId = $startResponse['task_id'];

$cancelResponse = json_decode($presenter->handle(['action' => 'startMining', 'userId' => 1, 'zoneId' => 1, 'nodeId' => 102, 'toolId' => 1000]), true);
$cancelled = json_decode($presenter->handle(['action' => 'cancelTask', 'taskId' => $cancelResponse['task_id']]), true);
if (($cancelled['status'] ?? '') !== 'cancelled') {
    throw new RuntimeException('Cancel task should return cancelled status');
}
$nodeStatusAfterCancel = json_decode($presenter->handle(['action' => 'zoneStatus', 'zoneId' => 1]), true);
if (($nodeStatusAfterCancel['nodes'][1]['state'] ?? '') !== 'available') {
    throw new RuntimeException('Node should be available after cancel');
}

$zoneStatus = json_decode($presenter->handle(['action' => 'zoneStatus', 'zoneId' => 1]), true);
if (($zoneStatus['nodes'][0]['state'] ?? '') !== 'reserved') {
    throw new RuntimeException('Zone status should reflect reservation');
}

$reflection = new ReflectionClass($presenter);
$storeProp = $reflection->getProperty('dataStore');
$storeProp->setAccessible(true);
$store = $storeProp->getValue($presenter);

$tasksProp = new ReflectionProperty($store, 'tasks');
$tasksProp->setAccessible(true);
$tasks = $tasksProp->getValue($store);
$tasks[$taskId]['finish_at'] = (new DateTimeImmutable())->sub(new DateInterval('PT1S'));
$tasksProp->setValue($store, $tasks);

$finishResponse = json_decode($presenter->handle(['action' => 'finishMining', 'taskId' => $taskId]), true);

if (($finishResponse['status'] ?? '') !== 'completed') {
    throw new RuntimeException('API flow failed');
}

if (!isset($finishResponse['tool_durability'])) {
    throw new RuntimeException('Tool durability should be returned after mining');
}

echo "API flow ok\n";
