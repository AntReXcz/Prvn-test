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
                'cancelTask' => $this->json($this->miningService->cancelMining((int)$request['taskId'])),
                'repairTool' => $this->json($this->miningService->repairTool((int)$request['userId'], (int)$request['toolId'], (int)$request['materialId'], (int)$request['materialQty'])),
                'craft' => $this->json($this->craftingService->craft((int)$request['userId'], (int)$request['recipeId'])),
                'finishCraft' => $this->json($this->craftingService->finishCrafting((int)$request['taskId'])),
                'unlockSkill' => $this->json($this->unlockSkill((int)$request['userId'], (int)$request['skillId'])),
                'listRecipes' => $this->json(['recipes' => $this->getRecipes((int)$request['userId'])]),
                'zoneStatus' => $this->json(['nodes' => $this->dataStore->getZoneNodesWithState((int)$request['zoneId'])]),
                'listZones' => $this->json(['zones' => $this->dataStore->getZones()]),
                'resetSession' => $this->json($this->resetSession()),
                'status' => $this->json([
                    'tasks' => $this->dataStore->getTasks(),
                    'inventory' => $this->getInventory((int)$request['userId']),
                    'tools' => $this->getTools((int)$request['userId']),
                    'professions' => $this->dataStore->getProfessionProgress((int)$request['userId']),
                    'recipes' => $this->getRecipes((int)$request['userId']),
                    'skills' => $this->dataStore->getSkillState((int)$request['userId']),
                ]),
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
                'name' => $material['name'],
                'qty' => $this->dataStore->getInventoryQty($userId, $material['id']),
            ];
        }
        return $materials;
    }

    private function getTools(int $userId): array
    {
        $tools = [];
        foreach ($this->dataStore->getInventory($userId) as $itemId => $qty) {
            $item = $this->dataStore->getItem($itemId);
            if (!$item || $item['type'] !== 'tool') {
                continue;
            }

            $tools[] = [
                'item_id' => $itemId,
                'name' => $item['name'],
                'qty' => $qty,
                'durability' => $this->dataStore->getToolDurability($userId, $itemId),
                'max_durability' => $this->dataStore->getToolMaxDurability($itemId),
            ];
        }

        return $tools;
    }

    private function resetSession(): array
    {
        $this->dataStore->reset();
        return [
            'status' => 'reset',
            'version' => $this->dataStore->getVersion(),
            'zones' => $this->dataStore->getZones(),
        ];
    }

    private function unlockSkill(int $userId, int $skillId): array
    {
        $result = $this->dataStore->unlockSkill($userId, $skillId);
        return $result + ['skills' => $this->dataStore->getSkillState($userId)];
    }

    private function getRecipes(int $userId): array
    {
        $recipes = [];
        foreach ($this->dataStore->getRecipes() as $recipe) {
            $outputItem = $this->dataStore->getItem($recipe['output_item_id']);
            $recipes[] = [
                'id' => $recipe['id'],
                'output_item_id' => $recipe['output_item_id'],
                'name' => $outputItem['name'] ?? ('Recipe ' . $recipe['id']),
                'time_ms' => $recipe['time_ms'],
                'xp_reward' => $recipe['xp_reward'] ?? null,
                'requirements' => $this->dataStore->getRecipeRequirementsForUser($userId, $recipe['id']),
            ];
        }

        return $recipes;
    }
}
