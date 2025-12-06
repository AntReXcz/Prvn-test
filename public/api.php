<?php

error_reporting(E_ALL);

require_once __DIR__ . '/../app/Model/DataStore.php';
require_once __DIR__ . '/../app/Model/ProfessionHelper.php';
require_once __DIR__ . '/../app/Model/MiningService.php';
require_once __DIR__ . '/../app/Model/CraftingService.php';
require_once __DIR__ . '/../app/Presenters/ApiPresenter.php';

set_error_handler(function ($severity, $message, $file, $line) {
    throw new \ErrorException($message, 0, $severity, $file, $line);
});

set_exception_handler(function ($exception) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => $exception->getMessage()], JSON_PRETTY_PRINT);
});

session_start();

use App\Model\DataStore;
use App\Presenters\ApiPresenter;

$dataStore = $_SESSION['datastore'] ?? new DataStore();

$presenter = new ApiPresenter($dataStore);
header('Content-Type: application/json');

$response = $presenter->handle($_REQUEST);
$_SESSION['datastore'] = $dataStore;

echo $response;
