<?php

namespace App\Http\Controllers\Masters;

use App\Http\Controllers\ResourceController;
use App\Models\Promotion;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PromotionController extends ResourceController
{
    protected string $model = Promotion::class;

    protected const PERMISSION = 'promotions';

    protected array $searchable = ['name', 'code'];

    protected array $filterable = ['is_active', 'type'];

    protected array $sortable = ['id', 'name', 'starts_at', 'ends_at'];

    protected array $with = ['service:id,name', 'variant:id,name'];

    protected function rules(Request $request, ?Model $model = null): array
    {
        return [
            'name' => ['required', 'string', 'max:150'],
            'code' => ['nullable', 'string', 'max:30', 'alpha_dash', Rule::unique('promotions')->ignore($model)],
            'type' => ['required', Rule::in(['percentage', 'fixed', 'package'])],
            'value' => ['required_unless:type,package', 'nullable', 'numeric', 'min:0', 'max:99999999'],
            'service_id' => ['nullable', 'integer', 'exists:services,id'],
            'variant_id' => ['nullable', 'required_if:type,package', 'integer', 'exists:service_variants,id'],
            'package_qty' => ['nullable', 'required_if:type,package', 'integer', 'min:1', 'max:1000'],
            'package_price' => ['nullable', 'required_if:type,package', 'numeric', 'min:0'],
            'min_amount' => ['nullable', 'numeric', 'min:0'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'description' => ['nullable', 'string', 'max:255'],
            'is_active' => ['boolean'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $model = null): array
    {
        if ($data['type'] === 'percentage' && ($data['value'] ?? 0) > 100) {
            $data['value'] = 100;
        }
        $data['value'] ??= 0;
        $data['min_amount'] ??= 0;

        return $data;
    }
}
