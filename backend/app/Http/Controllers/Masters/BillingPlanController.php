<?php

namespace App\Http\Controllers\Masters;

use App\Http\Controllers\ResourceController;
use App\Models\BillingPlan;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class BillingPlanController extends ResourceController
{
    protected string $model = BillingPlan::class;

    protected const ABILITIES = [
        'view' => 'billing.plans', 'create' => 'billing.plans', 'update' => 'billing.plans', 'delete' => 'billing.plans',
    ];

    protected array $searchable = ['name'];

    protected array $filterable = ['is_active'];

    protected array $sortable = ['id', 'name', 'price'];

    protected function rules(Request $request, ?Model $model = null): array
    {
        return [
            'name' => ['required', 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:255'],
            'price' => ['required', 'numeric', 'min:0'],
            'duration_days' => ['required', 'integer', 'min:1', 'max:3650'],
            'weight_limit' => ['nullable', 'numeric', 'min:0'],
            'piece_limit' => ['nullable', 'integer', 'min:0'],
            'discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'is_active' => ['boolean'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $model = null): array
    {
        $data['discount_percent'] ??= 0;

        return $data;
    }
}
