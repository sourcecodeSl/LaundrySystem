<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('activity_logs.view');
        $user = $request->user();
        $q = ActivityLog::with('user:id,name,username');
        if (! $user->canAccessAllBranches()) {
            $q->where('branch_id', $user->branch_id);
        } elseif ($request->filled('branch_id')) {
            $q->where('branch_id', $request->integer('branch_id'));
        }
        foreach (['action', 'subject_type', 'user_id'] as $f) {
            if ($request->filled($f) && is_scalar($request->query($f))) {
                $q->where($f, $request->query($f));
            }
        }
        if ($s = mb_substr(trim((string) $request->query('q')), 0, 100)) {
            $q->where(fn ($w) => $w->where('description', 'like', "%$s%")->orWhere('ip_address', 'like', "%$s%"));
        }
        if ($from = $request->date('from')) {
            $q->whereDate('created_at', '>=', $from);
        }
        if ($to = $request->date('to')) {
            $q->whereDate('created_at', '<=', $to);
        }

        return response()->json($q->latest('id')->paginate(min(max($request->integer('per_page', 25), 1), 100)));
    }
}
