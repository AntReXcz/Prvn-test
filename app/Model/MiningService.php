<?php

namespace App\Model;

use DateInterval;
use DateTimeImmutable;
use RuntimeException;

class MiningService
{
    public function __construct(private DataStore $dataStore)
    {
    }

    public function startMining(int $userId, int $zoneId, int $nodeId, int $toolId): array
    {
        $user = $this->dataStore->getUser($userId);
        if (!$user) {
            throw new RuntimeException('User not found');
        }

        $zone = $this->dataStore->getZone($zoneId);
        if (!$zone) {
            throw new RuntimeException('Zone not found');
        }

        $node = null;
        foreach ($zone['spawn_table'] as $entry) {
            if ($entry['node_id'] === $nodeId) {
                $node = $entry;
                break;
            }
        }
        if (!$node) {
            throw new RuntimeException('Node not found');
        }

        $now = new DateTimeImmutable();
        $state = $this->dataStore->getNodeState($zoneId, $nodeId, $now);
        if ($state['state'] === 'reserved' && $state['reserved_until'] instanceof DateTimeImmutable && $state['reserved_until'] > $now) {
            throw new RuntimeException('Node is currently reserved');
        }
        if ($state['state'] === 'depleted' && $state['respawn_at'] instanceof DateTimeImmutable && $state['respawn_at'] > $now) {
            $seconds = $state['respawn_at']->getTimestamp() - $now->getTimestamp();
            throw new RuntimeException('Node is depleted, respawns in ' . $seconds . ' seconds');
        }

        $tool = $this->dataStore->getItem($toolId);
        if (!$tool || $tool['type'] !== 'tool') {
            throw new RuntimeException('Invalid tool');
        }

        if ($this->dataStore->getToolDurability($userId, $toolId) <= 0) {
            throw new RuntimeException('Tool is broken');
        }

        $professionLevels = $this->dataStore->getProfessionLevels(1); // Mining
        $profession = $user['professions'][1] ?? ['xp' => 0, 'level' => 1];
        $currentLevel = ProfessionHelper::getLevelForXp($professionLevels, $profession['xp']);
        $speedMultiplier = $currentLevel['modifiers']['speed_multiplier'] ?? 1.0;

        $toolSpeed = $tool['stats']['speed'] ?? 1.0;
        $baseDuration = $node['cooldown_ms'];
        $adjustedDuration = (int)($baseDuration * $speedMultiplier / $toolSpeed);

        $finishAt = $now->add(new DateInterval('PT' . max(1, (int)ceil($adjustedDuration / 1000)) . 'S'));

        if (!$this->dataStore->reserveNode($zoneId, $nodeId, $finishAt)) {
            throw new RuntimeException('Node could not be reserved');
        }

        $taskId = $this->dataStore->createTask([
            'type' => 'mining',
            'user_id' => $userId,
            'zone_id' => $zoneId,
            'node_id' => $nodeId,
            'tool_id' => $toolId,
            'material_id' => $node['material_id'],
            'qty' => $node['qty'],
            'cooldown_ms' => $node['cooldown_ms'],
            'respawn_ms' => $node['respawn_ms'] ?? $node['cooldown_ms'],
            'started_at' => $now,
            'finish_at' => $finishAt,
            'completed' => false,
        ]);

        return [
            'task_id' => $taskId,
            'finish_at' => $finishAt->format(DateTimeImmutable::ATOM),
            'eta_ms' => $adjustedDuration,
        ];
    }

    public function finishMining(int $taskId): array
    {
        $task = $this->dataStore->getTask($taskId);
        if (!$task || $task['type'] !== 'mining') {
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

        $this->dataStore->addInventoryQty($task['user_id'], $task['material_id'], $task['qty']);
        $task['completed'] = true;
        $this->dataStore->updateTask($taskId, $task);

        $respawnMs = $task['respawn_ms'] ?? $task['cooldown_ms'] ?? 3000;
        $respawnAt = $now->add(new DateInterval('PT' . max(1, (int)ceil($respawnMs / 1000)) . 'S'));
        $this->dataStore->markNodeDepleted($task['zone_id'], $task['node_id'], $respawnAt);

        $rewardXp = 25 * $task['qty'];
        $this->addXp($task['user_id'], 1, $rewardXp); // Mining profession id 1

        $this->dataStore->damageTool($task['user_id'], $task['tool_id'], 1);

        $durabilityLeft = $this->dataStore->getToolDurability($task['user_id'], $task['tool_id']);

        return [
            'status' => 'completed',
            'items_gained' => [
                ['material_id' => $task['material_id'], 'qty' => $task['qty']],
            ],
            'xp_gained' => $rewardXp,
            'respawn_at' => $respawnAt->format(DateTimeImmutable::ATOM),
            'tool_durability' => $durabilityLeft,
        ];
    }

    public function repairTool(int $userId, int $toolId, int $materialId, int $materialQty): array
    {
        $tool = $this->dataStore->getItem($toolId);
        if (!$tool || $tool['type'] !== 'tool') {
            throw new RuntimeException('Invalid tool');
        }

        $maxDurability = $this->dataStore->getToolMaxDurability($toolId);
        $currentDurability = $this->dataStore->getToolDurability($userId, $toolId);

        if ($currentDurability >= $maxDurability) {
            return ['status' => 'already_full', 'durability' => $currentDurability];
        }

        $available = $this->dataStore->getInventoryQty($userId, $materialId);
        if ($available < $materialQty) {
            throw new RuntimeException('Not enough materials to repair');
        }

        $restorePerUnit = 5;
        $neededUnits = (int)ceil(($maxDurability - $currentDurability) / $restorePerUnit);
        $unitsToUse = min($neededUnits, $materialQty);

        if (!$this->dataStore->subtractInventoryQty($userId, $materialId, $unitsToUse)) {
            throw new RuntimeException('Failed to consume repair materials');
        }

        $this->dataStore->repairTool($userId, $toolId, $unitsToUse * $restorePerUnit);
        $newDurability = $this->dataStore->getToolDurability($userId, $toolId);

        return [
            'status' => 'repaired',
            'durability' => $newDurability,
            'materials_used' => $unitsToUse,
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
