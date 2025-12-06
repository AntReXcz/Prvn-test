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

        $tool = $this->dataStore->getItem($toolId);
        if (!$tool || $tool['type'] !== 'tool') {
            throw new RuntimeException('Invalid tool');
        }

        $professionLevels = $this->dataStore->getProfessionLevels(1); // Mining
        $profession = $user['professions'][1] ?? ['xp' => 0, 'level' => 1];
        $currentLevel = ProfessionHelper::getLevelForXp($professionLevels, $profession['xp']);
        $speedMultiplier = $currentLevel['modifiers']['speed_multiplier'] ?? 1.0;

        $toolSpeed = $tool['stats']['speed'] ?? 1.0;
        $baseDuration = $node['cooldown_ms'];
        $adjustedDuration = (int)($baseDuration * $speedMultiplier / $toolSpeed);

        $now = new DateTimeImmutable();
        $finishAt = $now->add(new DateInterval('PT' . max(1, (int)ceil($adjustedDuration / 1000)) . 'S'));

        $taskId = $this->dataStore->createTask([
            'type' => 'mining',
            'user_id' => $userId,
            'zone_id' => $zoneId,
            'node_id' => $nodeId,
            'tool_id' => $toolId,
            'material_id' => $node['material_id'],
            'qty' => $node['qty'],
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

        $rewardXp = 25 * $task['qty'];
        $this->addXp($task['user_id'], 1, $rewardXp); // Mining profession id 1

        return [
            'status' => 'completed',
            'items_gained' => [
                ['material_id' => $task['material_id'], 'qty' => $task['qty']],
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
