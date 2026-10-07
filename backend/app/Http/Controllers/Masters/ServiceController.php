<?php

namespace App\Http\Controllers\Masters;

use App\Http\Controllers\ResourceController;
use App\Models\Service;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ServiceController extends ResourceController
{
    protected string $model = Service::class;

    protected const PERMISSION = 'services';

    protected array $searchable = ['name', 'code'];

    protected array $filterable = ['is_active'];

    protected array $sortable = ['id', 'name', 'code'];

    protected function rules(Request $request, ?Model $model = null): array
    {
        return [
            'code' => ['required', 'string', 'max:20', 'alpha_dash', Rule::unique('services')->ignore($model)],
            'name' => ['required', 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:255'],
            'processing_hours' => ['required', 'integer', 'min:1', 'max:720'],
            'is_active' => ['boolean'],
        ];
    }
}
