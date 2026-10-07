<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Services\Settings;
use Illuminate\Http\JsonResponse;

/**
 * Unauthenticated e-bill view. Access requires the 48-char random token sent to
 * the customer; only bill-relevant fields are exposed (no internal IDs or staff data).
 */
class PublicEbillController extends Controller
{
    public function __invoke(string $token): JsonResponse
    {
        abort_unless(preg_match('/^[A-Za-z0-9]{48}$/', $token) === 1, 404);
        $order = Order::with(['items', 'branch', 'customer'])->where('ebill_token', $token)->firstOrFail();

        return response()->json([
            'business' => Settings::all()['general'],
            'receipt' => Settings::all()['receipt'],
            'branch' => $order->branch?->only(['name', 'address', 'phone']),
            'customer' => $order->customer ? ['name' => $order->customer->name, 'mobile' => substr_replace($order->customer->mobile, '****', -7, 4)] : null,
            'order' => $order->only(['order_no', 'receipt_no', 'queue_no', 'status', 'payment_status', 'subtotal', 'discount', 'tax',
                'service_charge', 'total', 'paid', 'balance', 'returned', 'delivery_type', 'delivery_at', 'created_at', 'total_weight', 'total_pieces']),
            'items' => $order->items->map->only(['description', 'pricing_type', 'weight', 'quantity', 'unit_price', 'discount', 'total', 'notes']),
        ]);
    }
}
