<?php

namespace App\Models;

use App\Models\Concerns\LogsActivity;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, LogsActivity, Notifiable, SoftDeletes;

    protected $fillable = [
        'name', 'username', 'email', 'mobile', 'role_id', 'branch_id', 'is_active', 'password', 'must_change_password',
    ];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'is_active' => 'boolean',
            'must_change_password' => 'boolean',
            'locked_until' => 'datetime',
            'last_login_at' => 'datetime',
            'password_changed_at' => 'datetime',
        ];
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function isSuper(): bool
    {
        return (bool) $this->role?->is_super;
    }

    public function permissions(): array
    {
        if ($this->isSuper()) {
            return config('permissions.all');
        }

        return array_values(array_intersect($this->role?->permissions ?? [], config('permissions.all')));
    }

    public function hasPermission(string $permission): bool
    {
        return $this->isSuper() || in_array($permission, $this->role?->permissions ?? [], true);
    }

    /** Users without a branch, or with branches.all, may work across every branch. */
    public function canAccessAllBranches(): bool
    {
        return $this->branch_id === null || $this->hasPermission('branches.all');
    }

    public function isLocked(): bool
    {
        return $this->locked_until !== null && $this->locked_until->isFuture();
    }
}
