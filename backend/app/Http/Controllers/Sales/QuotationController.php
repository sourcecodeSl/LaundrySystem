<?php

namespace App\Http\Controllers\Sales;

use App\Http\Controllers\Controller;
use App\Models\Quotation;
use App\Services\Numbering;
use App\Services\OrderService;
use App\Services\Pricing;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class QuotationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('quotations.view');
        $q = Quotation::visibleTo($request->user(), $request->integer('branch_id') ?: null)->with(['customer:id,name,mobile', 'user:id,name']);
        if ($s = mb_substr(trim((string) $request->query('q')), 0, 100)) {
            $q->where(fn ($w) => $w->where('quotation_no', 'like', "%$s%")->orWhere('customer_name', 'like', "%$s%")
                ->orWhere('customer_mobile', 'like', "%$s%"));
        }
        if ($request->filled('status')) {
            $q->where('status', (string) $request->query('status'));
        }
        if ($from = $request->date('from')) {
            $q->whereDate('created_at', '>=', $from);
        }
        if ($to = $request->date('to')) {
            $q->whereDate('created_at', '<=', $to);
        }

        return response()->json($request->boolean('all') ? ['data' => $q->latest('id')->limit(10000)->get()]
            : $q->latest('id')->paginate(min(max($request->integer('per_page', 20), 1), 100)));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->authorize('quotations.view');

        return response()->json(Quotation::visibleTo($request->user())->with(['items', 'customer', 'branch', 'user:id,name', 'order:id,order_no'])->findOrFail($id));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('quotations.create');

        return response()->json($this->save($request), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->authorize('quotations.update');
        $quotation = Quotation::visibleTo($request->user())->findOrFail($id);
        if ($quotation->status === 'converted') {
            throw ValidationException::withMessages(['status' => 'Converted quotations cannot be edited.']);
        }

        return response()->json($this->save($request, $quotation));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->authorize('quotations.delete');
        Quotation::visibleTo($request->user())->findOrFail($id)->delete();

        return response()->json(['message' => 'Deleted']);
    }

    /** Convert to an order via the normal order pipeline (re-priced, shift & payment rules apply). */
    public function convert(Request $request, int $id): JsonResponse
    {
        $this->authorize('quotations.convert');
        $this->authorize('pos.access');
        $quotation = Quotation::visibleTo($request->user())->with('items')->findOrFail($id);
        if ($quotation->status === 'converted') {
            throw ValidationException::withMessages(['status' => 'Already converted.']);
        }
        $data = $request->validate([
            'customer_id' => ['nullable', 'integer'],
            'payments' => ['array'],
            'payments.*.method' => ['required', 'string'],
            'payments.*.amount' => ['required', 'numeric', 'min:0'],
            'delivery_type' => ['nullable', Rule::in(['pickup', 'home_delivery'])],
            'delivery_address' => ['nullable', 'string', 'max:255'],
        ]);

        $items = $quotation->items->map(fn ($i) => [
            'service_id' => $i->service_id, 'variant_id' => $i->variant_id, 'weight' => $i->weight, 'quantity' => $i->quantity,
            'unit_price' => $i->unit_price, 'is_temporary' => ! $i->variant_id, 'description' => $i->description, 'notes' => $i->notes,
        ])->all();

        $order = OrderService::create([
            'branch_id' => $quotation->branch_id,
            'customer_id' => $data['customer_id'] ?? $quotation->customer_id,
            'quotation_id' => $quotation->id,
            'discount' => $quotation->discount,
            'items' => $items,
            'payments' => $data['payments'] ?? [],
            'delivery_type' => $data['delivery_type'] ?? 'pickup',
            'delivery_address' => $data['delivery_address'] ?? null,
            'notes' => $quotation->notes,
        ], $request->user());

        return response()->json($order, 201);
    }

    private function save(Request $request, ?Quotation $quotation = null): Quotation
    {
        $data = $request->validate([
            'branch_id' => ['nullable', 'integer'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'customer_name' => ['nullable', 'string', 'max:150'],
            'customer_mobile' => ['nullable', 'string', 'max:30'],
            'valid_until' => ['nullable', 'date'],
            'status' => ['nullable', Rule::in(['draft', 'sent', 'accepted', 'expired'])],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'items' => ['required', 'array', 'min:1', 'max:200'],
            'items.*.quantity' => ['required', 'numeric', 'min:0.01'],
            'items.*.service_id' => ['nullable', 'integer'],
            'items.*.variant_id' => ['nullable', 'integer'],
            'items.*.weight' => ['nullable', 'numeric', 'min:0'],
            'items.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'items.*.is_temporary' => ['boolean'],
            'items.*.description' => ['nullable', 'string', 'max:200'],
            'items.*.notes' => ['nullable', 'string', 'max:250'],
        ]);
        $user = $request->user();
        $branch = $quotation?->branch ?? OrderService::resolveBranch($user, $data['branch_id'] ?? null);
        $calc = Pricing::calculate($data['items'], $user, null, (float) ($data['discount'] ?? 0), $data['customer_id'] ?? null);

        return DB::transaction(function () use ($quotation, $data, $calc, $branch, $user) {
            $attrs = [
                'customer_id' => $data['customer_id'] ?? null,
                'customer_name' => $data['customer_name'] ?? null,
                'customer_mobile' => $data['customer_mobile'] ?? null,
                'valid_until' => $data['valid_until'] ?? now()->addDays(14)->toDateString(),
                'status' => $data['status'] ?? ($quotation?->status ?? 'draft'),
                'subtotal' => $calc['subtotal'], 'discount' => $calc['discount'], 'tax' => $calc['tax'],
                'service_charge' => $calc['service_charge'], 'total' => $calc['total'],
                'notes' => $data['notes'] ?? null,
            ];
            if ($quotation) {
                $quotation->update($attrs);
                $quotation->items()->delete();
            } else {
                $quotation = Quotation::create($attrs + [
                    'quotation_no' => Numbering::next('QT', $branch->code, 4), 'branch_id' => $branch->id, 'user_id' => $user->id,
                ]);
            }
            foreach ($calc['items'] as $item) {
                $quotation->items()->create(collect($item)->only(['service_id', 'variant_id', 'description', 'pricing_type', 'weight', 'quantity', 'unit_price', 'total', 'notes'])->all());
            }

            return $quotation->load('items');
        });
    }
}
