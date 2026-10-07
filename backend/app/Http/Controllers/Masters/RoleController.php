<?php

namespace App\Http\Controllers\Masters;

use App\Http\Controllers\ResourceController;
use App\Models\Role;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** "User types" — each role carries a set of permissions. */
class RoleController extends ResourceController
{
    protected string $model = Role::class;

    protected const ABILITIES = [
        'view' => 'roles.view', 'create' => 'roles.manage', 'update' => 'roles.manage', 'delete' => 'roles.manage',
    ];

    protected array $searchable = ['name'];

    protected array $sortable = ['id', 'name'];

    protected function rules(Request $request, ?Model $model = null): array
    {
        return [
            'name' => ['required', 'string', 'max:100', Rule::unique('roles')->ignore($model)],
            'description' => ['nullable', 'string', 'max:255'],
            'permissions' => ['array'],
            'permissions.*' => ['string', Rule::in(config('permissions.all'))],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $model = null): array
    {
        if ($model?->is_super) {
            throw ValidationException::withMessages(['role' => 'The super administrator role cannot be modified.']);
        }
        $data['permissions'] = array_values(array_unique($data['permissions'] ?? []));

        return $data;
    }

    protected function beforeDelete(Model $model): void
    {
        if ($model->is_super || $model->users()->exists()) {
            throw ValidationException::withMessages(['role' => 'This role is in use or protected.']);
        }
    }
}
