<?php

namespace App\Http\Controllers\Masters;

use App\Http\Controllers\ResourceController;
use App\Models\ServiceCategory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ServiceCategoryController extends ResourceController
{
    protected string $model = ServiceCategory::class;

    protected const PERMISSION = 'services';

    protected array $searchable = ['name'];

    protected array $filterable = ['is_active'];

    protected array $sortable = ['id', 'name'];

    protected function rules(Request $request, ?Model $model = null): array
    {
        return [
            'name' => ['required', 'string', 'max:100', Rule::unique('service_categories')->ignore($model)],
            'description' => ['nullable', 'string', 'max:255'],
            'is_active' => ['boolean'],
        ];
    }
}
