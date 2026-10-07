<?php

namespace App\Http\Controllers\Masters;

use App\Http\Controllers\ResourceController;
use App\Models\FinancialRate;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class FinancialRateController extends ResourceController
{
    protected string $model = FinancialRate::class;

    protected const ABILITIES = [
        'view' => 'settings.manage', 'create' => 'settings.manage', 'update' => 'settings.manage', 'delete' => 'settings.manage',
    ];

    protected array $filterable = ['type', 'is_active'];

    protected function rules(Request $request, ?Model $model = null): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'type' => ['required', Rule::in(['tax', 'service_charge'])],
            'rate' => ['required', 'numeric', 'min:0', 'max:100'],
            'is_active' => ['boolean'],
        ];
    }
}
