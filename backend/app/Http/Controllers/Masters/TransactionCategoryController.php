<?php

namespace App\Http\Controllers\Masters;

use App\Http\Controllers\ResourceController;
use App\Models\TransactionCategory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TransactionCategoryController extends ResourceController
{
    protected string $model = TransactionCategory::class;

    protected const ABILITIES = [
        'view' => 'finance.transactions', 'create' => 'finance.categories', 'update' => 'finance.categories', 'delete' => 'finance.categories',
    ];

    protected array $searchable = ['name'];

    protected array $filterable = ['type', 'is_active'];

    protected array $sortable = ['id', 'name'];

    protected function rules(Request $request, ?Model $model = null): array
    {
        return [
            'name' => ['required', 'string', 'max:100', Rule::unique('transaction_categories')->where('type', $request->input('type'))->ignore($model)],
            'type' => ['required', Rule::in(['income', 'expense'])],
            'is_active' => ['boolean'],
        ];
    }
}
