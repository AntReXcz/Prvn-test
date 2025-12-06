<?php

namespace App\Model;

use DateTimeImmutable;
use RuntimeException;

class CraftingService
{
    public function __construct(private DataStore $dataStore)
    {
    }

    public function craft(int $userId, int $recipeId): array
    {
        $user = $this->dataStore->getUser($userId);
        if (!$user) {
            throw new RuntimeException('User not found');
        }

        $recipe = $this->dataStore->getRecipe($recipeId);
        if (!$recipe) {
            throw new RuntimeException('Recipe not found');
        }

        $inputs = $this->dataStore->getRecipeInputs($recipeId);
        foreach ($inputs as $input) {
            $available = $this->dataStore->getInventoryQty($userId, $input['material_id']);
            if ($available < $input['qty']) {
                throw new RuntimeException('Missing materials');
            }
        }

        foreach ($inputs as $input) {
            if (!$this->dataStore->subtractInventoryQty($userId, $input['material_id'], $input['qty'])) {
                throw new RuntimeException('Failed to consume materials');
            }
        }

        $professionId = 2; // Smithing
        $levels = $this->dataStore->getProfessionLevels($professionId);
        $profession = $user['professions'][$professionId] ?? ['xp' => 0, 'level' => 1];
        $currentLevel = ProfessionHelper::getLevelForXp($levels, $profession['xp']);
        $speedMultiplier = $currentLevel['modifiers']['speed_multiplier'] ?? 1.0;

        $duration = (int)($recipe['time_ms'] * $speedMultiplier);
        $now = new DateTimeImmutable();
        $finishAt = $now->modify('+' . $duration . ' milliseconds');

        $taskId = $this->dataStore->createTask([
            'type' => 'crafting',
            'user_id' => $userId,
            'recipe_id' => $recipeId,
            'output_item_id' => $recipe['output_item_id'],
            'started_at' => $now,
            'finish_at' => $finishAt,
            'completed' => false,
        ]);

        return [
            'task_id' => $taskId,
            'finish_at' => $finishAt->format(DateTimeImmutable::ATOM),
            'eta_ms' => $duration,
            'requirements' => $inputs,
        ];
    }

    public function finishCrafting(int $taskId): array
    {
        $task = $this->dataStore->getTask($taskId);
        if (!$task || $task['type'] !== 'crafting') {
            throw new RuntimeException('Task not found');
        }

        if ($task['completed']) {
            return ['status' => 'already_completed'];
        }

        $now = new DateTimeImmutable();
        if ($task['finish_at'] > $now) {
            $remaining = $task['finish_at']->getTimestamp() - $now->getTimestamp();
            throw new RuntimeException('Task still in progress (' . $remaining . 's remaining)');
        }

        $this->dataStore->addInventoryQty($task['user_id'], $task['output_item_id'], 1);
        $task['completed'] = true;
        $this->dataStore->updateTask($taskId, $task);

        $rewardXp = 50;
        $this->addXp($task['user_id'], 2, $rewardXp); // Smithing

        return [
            'status' => 'completed',
            'items_gained' => [
                ['item_id' => $task['output_item_id'], 'qty' => 1],
            ],
            'xp_gained' => $rewardXp,
        ];
    }

    private function addXp(int $userId, int $professionId, int $xp): void
    {
        $user = $this->dataStore->getUser($userId);
        if (!$user) {
            return;
        }

        $levels = $this->dataStore->getProfessionLevels($professionId);
        $userProf = $user['professions'][$professionId] ?? ['xp' => 0, 'level' => 1];
        $userProf['xp'] += $xp;
        $levelInfo = ProfessionHelper::getLevelForXp($levels, $userProf['xp']);
        $userProf['level'] = $levelInfo['level'];
        $user['professions'][$professionId] = $userProf;
        $this->dataStore->updateUser($userId, $user);
    }
}
