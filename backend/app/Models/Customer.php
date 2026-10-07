<?php

namespace App\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\LogsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Customer extends Model
{
    use SoftDeletes, LogsActivity, BelongsToBranch;

    protected $guarded = ['id', 'created_at', 'updated_at', 'deleted_at'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'sms_opt_in' => 'boolean',
            'credit_limit' => 'float',
            'opening_balance' => 'float',
            'balance' => 'float',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function ledger(): HasMany
    {
        return $this->hasMany(CustomerLedger::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }
}
