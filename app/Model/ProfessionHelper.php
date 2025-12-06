<?php

namespace App\Model;

class ProfessionHelper
{
    public static function getLevelForXp(array $levels, int $xp): array
    {
        $current = $levels[0] ?? ['level' => 1, 'xp_required' => 0, 'modifiers' => ['speed_multiplier' => 1.0]];
        foreach ($levels as $level) {
            if ($xp >= $level['xp_required']) {
                $current = $level;
            }
        }
        return $current;
    }
}
