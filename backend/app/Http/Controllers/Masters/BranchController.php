<?php

namespace App\Http\Controllers\Masters;

use App\Http\Controllers\ResourceController;
use App\Models\Branch;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class BranchController extends ResourceController
{
    protected string $model = Branch::class;

    protected const PERMISSION = 'branches';

    protected array $searchable = ['name', 'code', 'phone'];

    protected array $filterable = ['is_active'];

    protected array $sortable = ['id', 'name', 'code'];

    protected function rules(Request $request, ?Model $model = null): array
    {
        return [
            'code' => ['required', 'string', 'max:20', 'alpha_dash', Rule::unique('branches')->ignore($model)],
            'name' => ['required', 'string', 'max:150'],
            'address' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:150'],
            'allow_password_change' => ['boolean'],
            'is_active' => ['boolean'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $model = null): array
    {
        $data['code'] = strtoupper($data['code']);

        return $data;
    }

    protected function beforeDelete(Model $model): void
    {
        if ($model->users()->exists()) {
            throw ValidationException::withMessages(['branch' => 'Branch has users. Deactivate it instead.']);
        }
    }
}
