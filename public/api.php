<?php

require_once __DIR__ . '/../app/Model/DataStore.php';
require_once __DIR__ . '/../app/Model/ProfessionHelper.php';
require_once __DIR__ . '/../app/Model/MiningService.php';
require_once __DIR__ . '/../app/Model/CraftingService.php';
require_once __DIR__ . '/../app/Presenters/ApiPresenter.php';

use App\Presenters\ApiPresenter;
use App\Model\DataStore;

$presenter = new ApiPresenter(new DataStore());
header('Content-Type: application/json');
echo $presenter->handle($_REQUEST);
