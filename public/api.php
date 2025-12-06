<?php

session_start();

require_once __DIR__ . '/../app/Model/DataStore.php';
require_once __DIR__ . '/../app/Model/ProfessionHelper.php';
require_once __DIR__ . '/../app/Model/MiningService.php';
require_once __DIR__ . '/../app/Model/CraftingService.php';
require_once __DIR__ . '/../app/Presenters/ApiPresenter.php';

use App\Model\DataStore;
use App\Presenters\ApiPresenter;

$dataStore = $_SESSION['datastore'] ?? new DataStore();
$presenter = new ApiPresenter($dataStore);
header('Content-Type: application/json');
echo $presenter->handle($_REQUEST);
$_SESSION['datastore'] = $dataStore;
