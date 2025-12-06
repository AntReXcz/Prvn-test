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

echo "API flow ok\n";
