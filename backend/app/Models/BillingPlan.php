<?php

namespace App\Models;

use App\Models\Concerns\LogsActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class BillingPlan extends Model
{
    use SoftDeletes, LogsActivity;

    protected $guarded = ['id', 'created_at', 'updated_at', 'deleted_at'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'price' => 'float',
            'weight_limit' => 'float',
            'discount_percent' => 'float',
            'duration_days' => 'integer',
            'piece_limit' => 'integer',
        ];
    }
}
