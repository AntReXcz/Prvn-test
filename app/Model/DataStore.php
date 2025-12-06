<?php

namespace App\Model;

/**
 * Simple in-memory data store to emulate persistence for demo purposes.
 */
class DataStore
{
    private array $materials = [];
    private array $recipes = [];
    private array $recipeInputs = [];
    private array $items = [];
    private array $zones = [];
    private array $professions = [];
    private array $professionLevels = [];
    private array $inventories = [];
    private array $tasks = [];
    private array $users = [];
    private array $nodeStates = [];

    public function __construct()
    {
        $this->seed();
    }

    private function seed(): void
    {
        $this->materials = [
            1 => ['id' => 1, 'name' => 'Copper Ore', 'group' => 'ore', 'tier' => 1],
            2 => ['id' => 2, 'name' => 'Tin Ore', 'group' => 'ore', 'tier' => 1],
            3 => ['id' => 3, 'name' => 'Bronze Bar', 'group' => 'bar', 'tier' => 2],
        ];

        $this->items = [
            1 => ['id' => 1, 'name' => 'Copper Pickaxe', 'type' => 'tool', 'stats' => ['speed' => 1.1]],
            2 => ['id' => 2, 'name' => 'Bronze Pickaxe', 'type' => 'tool', 'stats' => ['speed' => 1.3]],
            3 => ['id' => 3, 'name' => 'Bronze Ingot', 'type' => 'material', 'stats' => []],
            1000 => ['id' => 1000, 'name' => 'Starter Pickaxe', 'type' => 'tool', 'stats' => ['speed' => 1.0]],
        ];

        $this->recipes = [
            1 => ['id' => 1, 'output_item_id' => 3, 'time_ms' => 5000],
        ];

        $this->recipeInputs = [
            1 => [
                ['recipe_id' => 1, 'material_id' => 1, 'qty' => 2],
                ['recipe_id' => 1, 'material_id' => 2, 'qty' => 1],
            ],
        ];

        $this->zones = [
            1 => ['id' => 1, 'name' => 'Copper Hills', 'biome' => 'mountain', 'spawn_table' => [
                ['node_id' => 101, 'material_id' => 1, 'qty' => 3, 'cooldown_ms' => 3000, 'respawn_ms' => 4000],
                ['node_id' => 102, 'material_id' => 2, 'qty' => 2, 'cooldown_ms' => 5000, 'respawn_ms' => 6000],
            ]],
        ];

        $this->professions = [
            1 => ['id' => 1, 'name' => 'Mining'],
            2 => ['id' => 2, 'name' => 'Smithing'],
        ];

        $this->professionLevels = [
            1 => [ // Mining levels
                ['profession_id' => 1, 'level' => 1, 'xp_required' => 0, 'modifiers' => ['speed_multiplier' => 1.0]],
                ['profession_id' => 1, 'level' => 2, 'xp_required' => 100, 'modifiers' => ['speed_multiplier' => 0.9]],
                ['profession_id' => 1, 'level' => 3, 'xp_required' => 250, 'modifiers' => ['speed_multiplier' => 0.8]],
            ],
            2 => [ // Smithing levels
                ['profession_id' => 2, 'level' => 1, 'xp_required' => 0, 'modifiers' => ['speed_multiplier' => 1.0]],
                ['profession_id' => 2, 'level' => 2, 'xp_required' => 150, 'modifiers' => ['speed_multiplier' => 0.9]],
            ],
        ];

        // default user 1
        $this->users = [
            1 => ['id' => 1, 'name' => 'TestUser', 'professions' => [
                1 => ['xp' => 0, 'level' => 1],
                2 => ['xp' => 0, 'level' => 1],
            ]],
        ];

        $this->inventories = [
            1 => [
                1 => 10, // copper ore
                2 => 5,  // tin ore
                3 => 0,
                1_000 => 1, // copper pickaxe item id 1
            ],
        ];
    }

    public function getMaterial(int $id): ?array
    {
        return $this->materials[$id] ?? null;
    }

    public function getMaterials(): array
    {
        return $this->materials;
    }

    public function getItem(int $id): ?array
    {
        return $this->items[$id] ?? null;
    }

    public function getRecipe(int $id): ?array
    {
        return $this->recipes[$id] ?? null;
    }

    public function getRecipeInputs(int $recipeId): array
    {
        return $this->recipeInputs[$recipeId] ?? [];
    }

    public function getZone(int $id): ?array
    {
        return $this->zones[$id] ?? null;
    }

    public function getProfessionLevels(int $professionId): array
    {
        return $this->professionLevels[$professionId] ?? [];
    }

    public function getUser(int $userId): ?array
    {
        return $this->users[$userId] ?? null;
    }

    public function updateUser(int $userId, array $user): void
    {
        $this->users[$userId] = $user;
    }

    public function getInventoryQty(int $userId, int $materialId): int
    {
        return $this->inventories[$userId][$materialId] ?? 0;
    }

    public function getNodeState(int $zoneId, int $nodeId, ?\DateTimeImmutable $now = null): array
    {
        $now ??= new \DateTimeImmutable();
        $this->refreshNodeState($zoneId, $nodeId, $now);

        if (!isset($this->nodeStates[$zoneId][$nodeId])) {
            $this->nodeStates[$zoneId][$nodeId] = [
                'state' => 'available',
                'reserved_until' => null,
                'respawn_at' => null,
            ];
        }

        return $this->nodeStates[$zoneId][$nodeId];
    }

    public function reserveNode(int $zoneId, int $nodeId, \DateTimeImmutable $until): bool
    {
        $this->refreshNodeState($zoneId, $nodeId, new \DateTimeImmutable());
        $state = $this->nodeStates[$zoneId][$nodeId] ?? ['state' => 'available'];

        if ($state['state'] !== 'available') {
            return false;
        }

        $this->nodeStates[$zoneId][$nodeId] = [
            'state' => 'reserved',
            'reserved_until' => $until,
            'respawn_at' => null,
        ];

        return true;
    }

    public function markNodeDepleted(int $zoneId, int $nodeId, \DateTimeImmutable $respawnAt): void
    {
        $this->nodeStates[$zoneId][$nodeId] = [
            'state' => 'depleted',
            'reserved_until' => null,
            'respawn_at' => $respawnAt,
        ];
    }

    public function releaseNode(int $zoneId, int $nodeId): void
    {
        $this->nodeStates[$zoneId][$nodeId] = [
            'state' => 'available',
            'reserved_until' => null,
            'respawn_at' => null,
        ];
    }

    public function getZoneNodesWithState(int $zoneId): array
    {
        $zone = $this->getZone($zoneId);
        if (!$zone) {
            return [];
        }

        $result = [];
        foreach ($zone['spawn_table'] as $entry) {
            $state = $this->getNodeState($zoneId, $entry['node_id']);

            $result[] = [
                'node_id' => $entry['node_id'],
                'material_id' => $entry['material_id'],
                'qty' => $entry['qty'],
                'cooldown_ms' => $entry['cooldown_ms'],
                'respawn_ms' => $entry['respawn_ms'] ?? $entry['cooldown_ms'],
                'state' => $state['state'],
                'reserved_until' => $this->formatDate($state['reserved_until']),
                'respawn_at' => $this->formatDate($state['respawn_at']),
            ];
        }

        return $result;
    }

    public function addInventoryQty(int $userId, int $materialId, int $qty): void
    {
        $current = $this->inventories[$userId][$materialId] ?? 0;
        $this->inventories[$userId][$materialId] = $current + $qty;
    }

    public function subtractInventoryQty(int $userId, int $materialId, int $qty): bool
    {
        $current = $this->inventories[$userId][$materialId] ?? 0;
        if ($current < $qty) {
            return false;
        }
        $this->inventories[$userId][$materialId] = $current - $qty;
        return true;
    }

    public function createTask(array $task): int
    {
        $taskId = count($this->tasks) + 1;
        $task['id'] = $taskId;
        $this->tasks[$taskId] = $task;
        return $taskId;
    }

    public function getTask(int $taskId): ?array
    {
        return $this->tasks[$taskId] ?? null;
    }

    public function updateTask(int $taskId, array $task): void
    {
        $this->tasks[$taskId] = $task;
    }

    public function getTasks(): array
    {
        return $this->tasks;
    }

    private function refreshNodeState(int $zoneId, int $nodeId, \DateTimeImmutable $now): void
    {
        if (!isset($this->nodeStates[$zoneId][$nodeId])) {
            return;
        }

        $state = $this->nodeStates[$zoneId][$nodeId];

        if ($state['state'] === 'reserved' && $state['reserved_until'] instanceof \DateTimeImmutable && $state['reserved_until'] <= $now) {
            $this->releaseNode($zoneId, $nodeId);
            return;
        }

        if ($state['state'] === 'depleted' && $state['respawn_at'] instanceof \DateTimeImmutable && $state['respawn_at'] <= $now) {
            $this->releaseNode($zoneId, $nodeId);
        }
    }

    private function formatDate(?\DateTimeImmutable $date): ?string
    {
        return $date?->format(\DateTimeImmutable::ATOM);
    }
}
