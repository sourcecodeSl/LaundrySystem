<?php

namespace App\Models;

use App\Models\Concerns\LogsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Supplier extends Model
{
    use SoftDeletes, LogsActivity;

    protected $guarded = ['id', 'created_at', 'updated_at', 'deleted_at'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'opening_balance' => 'float',
            'balance' => 'float',
        ];
    }

    public function ledger(): HasMany
    {
        return $this->hasMany(SupplierLedger::class);
    }

    public function grns(): HasMany
    {
        return $this->hasMany(Grn::class);
    }
}
