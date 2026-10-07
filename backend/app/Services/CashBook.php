<?php

namespace App\Services;

use App\Models\CashBookEntry;
use App\Models\Shift;
use Illuminate\Database\Eloquent\Model;

class CashBook
{
    public static function record(string $direction, string $source, string $method, float $amount, int $branchId,
        ?Model $sourceable = null, ?string $reference = null, ?string $description = null, ?string $date = null): ?CashBookEntry
    {
        if ($amount <= 0) {
            return null;
        }

        return CashBookEntry::create([
            'branch_id' => $branchId,
            'shift_id' => static::currentShiftId($branchId),
            'user_id' => auth()->id(),
            'date' => $date ?? now()->toDateString(),
            'direction' => $direction,
            'source' => $source,
            'sourceable_type' => $sourceable ? $sourceable::class : null,
            'sourceable_id' => $sourceable?->getKey(),
            'method' => $method,
            'amount' => round($amount, 2),
            'reference' => $reference,
            'description' => $description,
        ]);
    }

    public static function currentShiftId(?int $branchId = null): ?int
    {
        $user = auth()->user();
        if (! $user) {
            return null;
        }

        return Shift::where('user_id', $user->id)
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->where('status', 'open')->latest('id')->value('id');
    }
}
