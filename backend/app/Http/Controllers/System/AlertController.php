<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Models\Complaint;
use App\Models\DamageLostItem;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\Order;
use App\Models\Shift;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Operational alerts for the notification bell. Each alert is only included
 * when the user holds the permission for the page it links to.
 */
class AlertController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();
        $branchId = $request->integer('branch_id') ?: null;
        $alerts = [];
        $add = function (string $key, string $level, int $count, string $title, string $text, string $link) use (&$alerts) {
            if ($count > 0) {
                $alerts[] = compact('key', 'level', 'count', 'title', 'text', 'link');
            }
        };

        if ($user->hasPermission('orders.view')) {
            $active = fn () => Order::visibleTo($user, $branchId)->whereNotIn('status', ['delivered', 'cancelled']);

            $overdue = $active()->where('delivery_at', '<', now())->whereNot('status', 'ready')->count();
            $add('overdue', 'danger', $overdue, 'Overdue orders', "$overdue order(s) are past the promised time and not ready yet.", '/production');

            $dueToday = $active()->whereBetween('delivery_at', [now(), now()->endOfDay()])->count();
            $add('due_today', 'warning', $dueToday, 'Due today', "$dueToday order(s) must be ready by the end of today.", '/orders?due_today=1');

            $waiting = $active()->where('status', 'ready')->where('updated_at', '<', now()->subDays(3))->count();
            $add('uncollected', 'info', $waiting, 'Ready, not collected', "$waiting order(s) have been ready for more than 3 days.", '/production');
        }

        if ($user->hasPermission('inventory.view')) {
            $stocks = ItemStock::query()
                ->when(! $user->canAccessAllBranches(), fn ($q) => $q->where('branch_id', $user->branch_id))
                ->when($user->canAccessAllBranches() && $branchId, fn ($q) => $q->where('branch_id', $branchId))
                ->selectRaw('item_id, SUM(quantity) as qty')->groupBy('item_id')->pluck('qty', 'item_id');
            $low = Item::where('is_active', true)->get()->filter(fn ($i) => (float) ($stocks[$i->id] ?? 0) <= $i->reorder_level)->count();
            $add('low_stock', 'warning', $low, 'Low stock', "$low consumable item(s) are at or below the reorder level.", '/stock/levels');
        }

        if ($user->hasPermission('complaints.view')) {
            $open = Complaint::visibleTo($user, $branchId)->whereIn('status', ['open', 'in_progress'])->count();
            $add('complaints', 'info', $open, 'Open complaints', "$open re-wash / complaint request(s) need attention.", '/complaints');
        }

        if ($user->hasPermission('damage_lost.view')) {
            $dl = DamageLostItem::visibleTo($user, $branchId)->whereIn('status', ['reported', 'investigating'])->count();
            $add('damage_lost', 'danger', $dl, 'Damage / lost items', "$dl damage or lost item case(s) are unresolved.", '/damage-lost');
        }

        if ($user->hasPermission('shifts.manage')) {
            $stale = Shift::where(['user_id' => $user->id, 'status' => 'open'])->where('opened_at', '<', now()->subHours(16))->exists();
            $add('stale_shift', 'warning', (int) $stale, 'Shift still open', 'Your cashier shift has been open for more than 16 hours. Close it with a cash count.', '/shifts');
        }

        $order = ['danger' => 0, 'warning' => 1, 'info' => 2];
        usort($alerts, fn ($a, $b) => $order[$a['level']] <=> $order[$b['level']]);

        return response()->json(['alerts' => $alerts, 'total' => array_sum(array_column($alerts, 'count'))]);
    }
}
