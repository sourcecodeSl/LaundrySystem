<?php

namespace App\Http\Controllers\Sales;

use App\Http\Controllers\Controller;
use App\Models\FinancialRate;
use App\Models\HeldBill;
use App\Models\Service;
use App\Models\ServiceCategory;
use App\Models\ServiceVariant;
use App\Models\VariantPrice;
use App\Services\OrderService;
use App\Services\Pricing;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PosController extends Controller
{
    /** Everything the POS / calculator needs in one request. */
    public function catalog(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission('pos.access') || $request->user()->hasPermission('services.view')
            || $request->user()->hasPermission('quotations.create'), 403);

        return response()->json([
            'services' => Service::where('is_active', true)->orderBy('id')->get(['id', 'code', 'name', 'processing_hours']),
            'categories' => ServiceCategory::where('is_active', true)->orderBy('id')->get(['id', 'name']),
            'variants' => ServiceVariant::where('is_active', true)->orderBy('name')->get(['id', 'category_id', 'name', 'pricing_type', 'min_weight', 'max_weight', 'unit']),
            'prices' => VariantPrice::get(['variant_id', 'service_id', 'price']),
            'promotions' => Pricing::activePromotions()->values(),
            'rates' => FinancialRate::where('is_active', true)->get(['name', 'type', 'rate']),
        ]);
    }

    /** Server-side totals preview (same code path as order creation). */
    public function calculate(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission('pos.access') || $request->user()->hasPermission('quotations.create'), 403);
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:200'],
            'promotion_id' => ['nullable', 'integer'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'customer_id' => ['nullable', 'integer'],
        ]);

        return response()->json(Pricing::calculate($data['items'], $request->user(), $data['promotion_id'] ?? null,
            (float) ($data['discount'] ?? 0), $data['customer_id'] ?? null));
    }

    public function held(Request $request): JsonResponse
    {
        $this->authorize('pos.hold');

        return response()->json(HeldBill::visibleTo($request->user())->with(['customer:id,name,mobile', 'user:id,name'])->latest()->get());
    }

    public function hold(Request $request): JsonResponse
    {
        $this->authorize('pos.hold');
        $data = $request->validate([
            'label' => ['nullable', 'string', 'max:100'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'cart' => ['required', 'array'],
            'cart.items' => ['required', 'array', 'min:1', 'max:200'],
            'total' => ['nullable', 'numeric', 'min:0'],
            'branch_id' => ['nullable', 'integer'],
        ]);
        $branch = OrderService::resolveBranch($request->user(), $data['branch_id'] ?? null);
        $bill = HeldBill::create([
            'branch_id' => $branch->id, 'user_id' => $request->user()->id, 'customer_id' => $data['customer_id'] ?? null,
            'label' => $data['label'] ?? null, 'cart' => $data['cart'], 'total' => $data['total'] ?? 0,
        ]);

        return response()->json($bill, 201);
    }

    public function recall(Request $request, int $id): JsonResponse
    {
        $this->authorize('pos.hold');

        return response()->json(HeldBill::visibleTo($request->user())->with('customer')->findOrFail($id));
    }

    public function discard(Request $request, int $id): JsonResponse
    {
        $this->authorize('pos.hold');
        HeldBill::visibleTo($request->user())->findOrFail($id)->delete();

        return response()->json(['message' => 'Held bill removed']);
    }
}
