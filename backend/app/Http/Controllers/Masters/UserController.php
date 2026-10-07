<?php

namespace App\Http\Controllers\Masters;

use App\Http\Controllers\ResourceController;
use App\Models\ActivityLog;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class UserController extends ResourceController
{
    protected string $model = User::class;

    protected const PERMISSION = 'users';

    protected array $searchable = ['name', 'username', 'email', 'mobile'];

    protected array $filterable = ['is_active', 'role_id', 'branch_id'];

    protected array $sortable = ['id', 'name', 'username', 'last_login_at'];

    protected array $with = ['role:id,name,is_super', 'branch:id,name'];

    /** Branch managers only manage users of their own branch. */
    protected function query(Request $request): Builder
    {
        $q = parent::query($request);
        if (! $request->user()->canAccessAllBranches()) {
            $q->where('branch_id', $request->user()->branch_id);
        }

        return $q;
    }

    protected function rules(Request $request, ?Model $model = null): array
    {
        return [
            'name' => ['required', 'string', 'max:150'],
            'username' => ['required', 'string', 'min:3', 'max:50', 'alpha_dash', Rule::unique('users')->ignore($model)],
            'email' => ['nullable', 'email', 'max:150', Rule::unique('users')->ignore($model)],
            'mobile' => ['nullable', 'string', 'max:30'],
            'role_id' => ['required', 'integer', 'exists:roles,id'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'is_active' => ['boolean'],
            'password' => [$model ? 'prohibited' : 'required', 'confirmed', Password::defaults()],
            'must_change_password' => ['boolean'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $model = null): array
    {
        $actor = $request->user();
        $role = Role::find($data['role_id']);

        // Privilege-escalation guards
        if ($role->is_super && ! $actor->isSuper()) {
            throw ValidationException::withMessages(['role_id' => 'Only a super administrator can assign this role.']);
        }
        if (! $actor->isSuper() && array_diff($role->permissions ?? [], $actor->permissions())) {
            throw ValidationException::withMessages(['role_id' => 'You cannot assign a role with more permissions than your own.']);
        }
        if (! $actor->canAccessAllBranches()) {
            $data['branch_id'] = $actor->branch_id;
        }
        if ($model && $model->id === $actor->id) {
            unset($data['role_id'], $data['is_active'], $data['branch_id']); // no self-demotion / lockout
        }
        if (! $model) {
            $data['must_change_password'] = $data['must_change_password'] ?? true;
        }

        return $data;
    }

    protected function afterSave(Model $model, Request $request, bool $created): Model
    {
        if (! $model->is_active) {
            DB::table('sessions')->where('user_id', $model->id)->delete();
        }

        return $model;
    }

    protected function beforeDelete(Model $model): void
    {
        if ($model->id === auth()->id()) {
            throw ValidationException::withMessages(['user' => 'You cannot delete your own account.']);
        }
        if ($model->isSuper() && User::whereHas('role', fn ($q) => $q->where('is_super', true))->count() <= 1) {
            throw ValidationException::withMessages(['user' => 'Cannot delete the last super administrator.']);
        }
        DB::table('sessions')->where('user_id', $model->id)->delete();
    }

    /** Admin password reset (branch-wise: managers can only reset users of their branch). */
    public function resetPassword(Request $request, int $id): JsonResponse
    {
        abort_unless($request->user()->hasPermission('users.reset_password'), 403);
        $user = $this->find($request, $id);
        if ($user->isSuper() && ! $request->user()->isSuper()) {
            abort(403);
        }
        $data = $request->validate(['password' => ['required', 'confirmed', Password::defaults()]]);

        $user->forceFill([
            'password' => $data['password'],
            'must_change_password' => true,
            'failed_logins' => 0,
            'locked_until' => null,
            'remember_token' => null,
        ])->save();
        DB::table('sessions')->where('user_id', $user->id)->delete();
        ActivityLog::record('password_reset', $user, null, 'Password reset by '.$request->user()->username);

        return response()->json(['message' => 'Password reset. The user must change it at next login.']);
    }

    public function unlock(Request $request, int $id): JsonResponse
    {
        abort_unless($request->user()->hasPermission('users.update'), 403);
        $this->find($request, $id)->forceFill(['failed_logins' => 0, 'locked_until' => null])->save();

        return response()->json(['message' => 'Account unlocked']);
    }
}
