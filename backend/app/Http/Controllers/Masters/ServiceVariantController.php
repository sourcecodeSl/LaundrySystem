<?php

namespace App\Http\Controllers\Masters;

use App\Http\Controllers\ResourceController;
use App\Models\ServiceVariant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ServiceVariantController extends ResourceController
{
    protected string $model = ServiceVariant::class;

    protected const PERMISSION = 'services';

    protected array $searchable = ['name'];

    protected array $filterable = ['is_active', 'category_id', 'pricing_type'];

    protected array $sortable = ['id', 'name', 'pricing_type'];

    protected array $with = ['category:id,name', 'prices'];

    protected function rules(Request $request, ?Model $model = null): array
    {
        return [
            'category_id' => ['nullable', 'integer', Rule::exists('service_categories', 'id')->whereNull('deleted_at')],
            'name' => ['required', 'string', 'max:150'],
            'pricing_type' => ['required', Rule::in(['weight_range', 'per_piece', 'per_item'])],
            'min_weight' => ['nullable', 'required_if:pricing_type,weight_range', 'numeric', 'min:0', 'max:9999'],
            'max_weight' => ['nullable', 'numeric', 'gt:min_weight', 'max:9999'],
            'unit' => ['required', 'string', 'max:20'],
            'is_active' => ['boolean'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $model = null): array
    {
        if ($data['pricing_type'] !== 'weight_range') {
            $data['min_weight'] = $data['max_weight'] = null;
        }

        return $data;
    }
}
