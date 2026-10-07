<?php

namespace App\Models\Concerns;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Branch isolation: users that are not allowed to see all branches only ever
 * see rows of their own branch. Users with "branches.all" may filter by any branch.
 */
trait BelongsToBranch
{
    public function scopeVisibleTo(Builder $query, ?User $user, mixed $branchId = null): Builder
    {
        $column = $this->qualifyColumn('branch_id');

        if (! $user) {
            return $query->whereRaw('1 = 0');
        }

        if (! $user->canAccessAllBranches()) {
            return $query->where($column, $user->branch_id);
        }

        return $branchId ? $query->where($column, (int) $branchId) : $query;
    }
}
