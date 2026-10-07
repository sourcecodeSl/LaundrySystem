<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Order;
use App\Services\Settings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Small reference lists any signed-in user needs (no sensitive data). */
class LookupController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();
        $branches = Branch::where('is_active', true)
            ->when(! $user->canAccessAllBranches(), fn ($q) => $q->whereKey($user->branch_id))
            ->orderBy('name')->get(['id', 'code', 'name', 'address', 'phone']);

        return response()->json([
            'branches' => $branches,
            'order_statuses' => Order::STATUSES,
            'payment_methods' => Order::PAYMENT_METHODS,
            'permission_modules' => config('permissions.modules'),
            'settings' => array_intersect_key(Settings::all(), array_flip(['general', 'receipt'])),
        ]);
    }
}
