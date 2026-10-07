<?php

namespace App\Http\Controllers\Masters;

use App\Http\Controllers\ResourceController;
use App\Models\Item;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Consumable items (detergent, softener, hangers, poly bags ...). */
class ItemController extends ResourceController
{
    protected string $model = Item::class;

    protected const ABILITIES = [
        'view' => 'inventory.view', 'create' => 'inventory.manage_items',
        'update' => 'inventory.manage_items', 'delete' => 'inventory.manage_items',
    ];

    protected array $searchable = ['name', 'code'];

    protected array $filterable = ['is_active'];

    protected array $sortable = ['id', 'name', 'code'];

    protected function rules(Request $request, ?Model $model = null): array
    {
        return [
            'code' => ['required', 'string', 'max:30', 'alpha_dash', Rule::unique('items')->ignore($model)],
            'name' => ['required', 'string', 'max:150'],
            'unit' => ['required', 'string', 'max:20'],
            'cost_price' => ['required', 'numeric', 'min:0'],
            'reorder_level' => ['required', 'numeric', 'min:0'],
            'is_active' => ['boolean'],
        ];
    }
}
