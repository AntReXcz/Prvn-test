<?php

namespace App\Presenters;

use App\Model\CraftingService;
use App\Model\DataStore;
use App\Model\MiningService;
use RuntimeException;

class ApiPresenter
{
    private MiningService $miningService;
    private CraftingService $craftingService;

    public function __construct(private DataStore $dataStore)
    {
        $this->miningService = new MiningService($dataStore);
        $this->craftingService = new CraftingService($dataStore);
    }

    public function handle(array $request): string
    {
        $action = $request['action'] ?? null;
        try {
            return match ($action) {
                'startMining' => $this->json($this->miningService->startMining((int)$request['userId'], (int)$request['zoneId'], (int)$request['nodeId'], (int)$request['toolId'])),
                'finishMining' => $this->json($this->miningService->finishMining((int)$request['taskId'])),
                'craft' => $this->json($this->craftingService->craft((int)$request['userId'], (int)$request['recipeId'])),
                'finishCraft' => $this->json($this->craftingService->finishCrafting((int)$request['taskId'])),
                'status' => $this->json(['tasks' => $this->dataStore->getTasks(), 'inventory' => $this->getInventory((int)$request['userId'])]),
                default => $this->json(['error' => 'Unknown action'], 400),
            };
        } catch (RuntimeException $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
    }

    private function json(array $payload, int $code = 200): string
    {
        http_response_code($code);
        return json_encode($payload, JSON_PRETTY_PRINT);
    }

    private function getInventory(int $userId): array
    {
        $materials = [];
        foreach ($this->dataStore->getMaterials() as $material) {
            $materials[] = [
                'material_id' => $material['id'],
                'qty' => $this->dataStore->getInventoryQty($userId, $material['id']),
            ];
        }
        return $materials;
    }
}

if (php_sapi_name() !== 'cli') {
    require_once __DIR__ . '/../Model/DataStore.php';
    require_once __DIR__ . '/../Model/ProfessionHelper.php';
    require_once __DIR__ . '/../Model/MiningService.php';
    require_once __DIR__ . '/../Model/CraftingService.php';

    $presenter = new ApiPresenter(new DataStore());
    header('Content-Type: application/json');
    echo $presenter->handle($_REQUEST);
}
