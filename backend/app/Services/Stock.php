<?php

namespace App\Services;

use App\Models\ItemStock;
use App\Models\StockMovement;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\ValidationException;

class Stock
{
    /** Apply a signed quantity change to a branch stock and record the movement. */
    public static function move(int $itemId, int $branchId, float $qty, string $type, ?Model $source = null,
        ?string $reference = null, float $unitCost = 0, bool $allowNegative = false, ?string $notes = null): StockMovement
    {
        ItemStock::firstOrCreate(['item_id' => $itemId, 'branch_id' => $branchId], ['quantity' => 0]);
        $stock = ItemStock::where(['item_id' => $itemId, 'branch_id' => $branchId])->lockForUpdate()->first();

        $new = round($stock->quantity + $qty, 3);
        if ($new < 0 && ! $allowNegative) {
            $name = $stock->item?->name ?? "#$itemId";
            throw ValidationException::withMessages(['items' => "Insufficient stock for $name (available {$stock->quantity})."]);
        }
        $stock->update(['quantity' => $new]);

        return StockMovement::create([
            'item_id' => $itemId,
            'branch_id' => $branchId,
            'type' => $type,
            'source_type' => $source ? $source::class : null,
            'source_id' => $source?->getKey(),
            'reference' => $reference,
            'quantity' => $qty,
            'unit_cost' => $unitCost,
            'balance' => $new,
            'user_id' => auth()->id(),
            'notes' => $notes,
        ]);
    }

    public static function quantity(int $itemId, int $branchId): float
    {
        return (float) (ItemStock::where(['item_id' => $itemId, 'branch_id' => $branchId])->value('quantity') ?? 0);
    }
}
