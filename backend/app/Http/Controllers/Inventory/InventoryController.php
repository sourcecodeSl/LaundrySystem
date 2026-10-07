<?php

namespace App\Http\Controllers\Inventory;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Grn;
use App\Models\Item;
use App\Models\ItemStock;
use App\Models\OpeningStock;
use App\Models\StockAdjustment;
use App\Models\StockCount;
use App\Models\StockMovement;
use App\Models\StockTransfer;
use App\Models\Supplier;
use App\Models\SupplierReturn;
use App\Services\Ledger;
use App\Services\Numbering;
use App\Services\OrderService;
use App\Services\Stock;
use App\Services\SupplierPayments;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Stock documents: GRN, supplier return, adjustment, transfer, count, opening stock;
 * plus stock levels, branch stock and the movement register.
 */
class InventoryController extends Controller
{
    /** document type => [model, permission, ref prefix] */
    private const DOCS = [
        'grns' => [Grn::class, 'inventory.grn', 'GRN'],
        'supplier-returns' => [SupplierReturn::class, 'inventory.supplier_return', 'SRN'],
        'adjustments' => [StockAdjustment::class, 'inventory.adjustment', 'ADJ'],
        'transfers' => [StockTransfer::class, 'inventory.transfer', 'TRF'],
        'counts' => [StockCount::class, 'inventory.count', 'CNT'],
        'opening' => [OpeningStock::class, 'inventory.opening', 'OPS'],
    ];

    private function doc(string $type): array
    {
        abort_unless(isset(self::DOCS[$type]), 404);

        return self::DOCS[$type];
    }

    public function index(Request $request, string $type): JsonResponse
    {
        [$model] = $this->doc($type);
        $this->authorize('inventory.view');
        $q = $model::query()->visibleTo($request->user(), $request->integer('branch_id') ?: null)
            ->with(array_filter(['branch:id,name', 'user:id,name', in_array($type, ['grns', 'supplier-returns']) ? 'supplier:id,name' : null,
                $type === 'transfers' ? 'toBranch:id,name' : null]))
            ->withCount('items');

        if ($s = mb_substr(trim((string) $request->query('q')), 0, 100)) {
            $q->where(fn ($w) => $w->where('ref_no', 'like', "%$s%")->when($type === 'grns', fn ($g) => $g->orWhere('invoice_no', 'like', "%$s%")));
        }
        if ($request->filled('supplier_id') && in_array($type, ['grns', 'supplier-returns'])) {
            $q->where('supplier_id', $request->integer('supplier_id'));
        }
        if ($from = $request->date('from')) {
            $q->whereDate('date', '>=', $from);
        }
        if ($to = $request->date('to')) {
            $q->whereDate('date', '<=', $to);
        }

        return response()->json($request->boolean('all') ? ['data' => $q->latest('id')->limit(10000)->get()]
            : $q->latest('id')->paginate(min(max($request->integer('per_page', 20), 1), 100)));
    }

    public function show(Request $request, string $type, int $id): JsonResponse
    {
        [$model] = $this->doc($type);
        $this->authorize('inventory.view');
        $doc = $model::query()->visibleTo($request->user())->with(['items.item:id,code,name,unit', 'branch:id,name', 'user:id,name'])->findOrFail($id);
        if (in_array($type, ['grns', 'supplier-returns'])) {
            $doc->load('supplier:id,name');
        }
        if ($type === 'transfers') {
            $doc->load('toBranch:id,name');
        }

        return response()->json($doc);
    }

    public function store(Request $request, string $type): JsonResponse
    {
        [$model, $permission, $prefix] = $this->doc($type);
        $this->authorize($permission);
        $user = $request->user();

        $rules = [
            'branch_id' => ['nullable', 'integer'],
            'date' => ['required', 'date', 'before_or_equal:today'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'items' => ['required', 'array', 'min:1', 'max:500'],
            'items.*.item_id' => ['required', 'integer', 'distinct', 'exists:items,id'],
            'items.*.quantity' => ['required', 'numeric', $type === 'adjustments' ? 'not_in:0' : ($type === 'counts' ? 'min:0' : 'gt:0'), 'max:9999999'],
            'items.*.unit_cost' => ['nullable', 'numeric', 'min:0', 'max:9999999'],
        ];
        $rules += match ($type) {
            'grns' => ['supplier_id' => ['required', 'integer', 'exists:suppliers,id'], 'invoice_no' => ['required', 'string', 'max:50'],
                'paid' => ['nullable', 'numeric', 'min:0'], 'payment_method' => ['nullable', Rule::in(['cash', 'card', 'bank_transfer', 'cheque'])]],
            'supplier-returns' => ['supplier_id' => ['required', 'integer', 'exists:suppliers,id'], 'grn_id' => ['nullable', 'integer', 'exists:grns,id']],
            'adjustments' => ['reason' => ['required', 'string', 'max:255']],
            'transfers' => ['to_branch_id' => ['required', 'integer', Rule::exists('branches', 'id')->where('is_active', true)]],
            'counts' => ['apply' => ['boolean']],
            default => [],
        };
        $data = $request->validate($rules);

        $branch = OrderService::resolveBranch($user, $data['branch_id'] ?? null);
        if ($type === 'transfers' && (int) $data['to_branch_id'] === $branch->id) {
            throw ValidationException::withMessages(['to_branch_id' => 'Destination must be a different branch.']);
        }

        $doc = DB::transaction(function () use ($model, $type, $prefix, $data, $branch, $user) {
            $items = Item::whereIn('id', array_column($data['items'], 'item_id'))->get()->keyBy('id');
            $header = ['ref_no' => Numbering::next($prefix, $branch->code, 4), 'branch_id' => $branch->id, 'user_id' => $user->id,
                'date' => $data['date'], 'notes' => $data['notes'] ?? null];
            $header += match ($type) {
                'grns' => ['supplier_id' => $data['supplier_id'], 'invoice_no' => $data['invoice_no']],
                'supplier-returns' => ['supplier_id' => $data['supplier_id'], 'grn_id' => $data['grn_id'] ?? null],
                'adjustments' => ['reason' => $data['reason']],
                'transfers' => ['to_branch_id' => $data['to_branch_id']],
                'counts' => ['status' => 'draft'],
                default => [],
            };
            $doc = $model::create($header);

            $total = 0;
            foreach ($data['items'] as $row) {
                $item = $items[$row['item_id']];
                $qty = round((float) $row['quantity'], 3);
                $cost = round((float) ($row['unit_cost'] ?? $item->cost_price), 2);
                $line = ['item_id' => $item->id, 'quantity' => $qty, 'unit_cost' => $cost, 'total' => round(abs($qty) * $cost, 2)];
                if ($type === 'counts') {
                    $line['system_quantity'] = Stock::quantity($item->id, $branch->id);
                    $line['total'] = round(($qty - $line['system_quantity']) * $cost, 2);
                }
                $doc->items()->create($line);
                $total += $line['total'];

                match ($type) {
                    'grns' => [Stock::move($item->id, $branch->id, $qty, 'grn', $doc, $doc->ref_no, $cost), $item->update(['cost_price' => $cost])],
                    'supplier-returns' => Stock::move($item->id, $branch->id, -$qty, 'supplier_return', $doc, $doc->ref_no, $cost),
                    'adjustments' => Stock::move($item->id, $branch->id, $qty, 'adjustment', $doc, $doc->ref_no, $cost, false, $data['reason']),
                    'transfers' => [Stock::move($item->id, $branch->id, -$qty, 'transfer_out', $doc, $doc->ref_no, $cost),
                        Stock::move($item->id, (int) $data['to_branch_id'], $qty, 'transfer_in', $doc, $doc->ref_no, $cost)],
                    'opening' => Stock::move($item->id, $branch->id, $qty, 'opening', $doc, $doc->ref_no, $cost),
                    default => null,
                };
            }
            $doc->update(['total' => round($total, 2)]);

            if ($type === 'grns') {
                $supplier = Supplier::find($data['supplier_id']);
                Ledger::supplier($supplier, 'grn', 0, $doc->total, $doc->ref_no, $doc, 'GRN inv# '.$doc->invoice_no, $doc->date->toDateString());
                $paid = min((float) ($data['paid'] ?? 0), $doc->total);
                if ($paid > 0) {
                    SupplierPayments::post($supplier, $branch, $paid, ['method' => $data['payment_method'] ?? 'cash', 'date' => $data['date']], $doc);
                }
            }
            if ($type === 'supplier-returns') {
                Ledger::supplier(Supplier::find($data['supplier_id']), 'return', $doc->total, 0, $doc->ref_no, $doc, 'Return note', $doc->date->toDateString());
            }
            if ($type === 'counts' && ($data['apply'] ?? false)) {
                $this->applyCount($doc);
            }

            return $doc;
        });

        return $this->show($request, $type, $doc->id)->setStatusCode(201);
    }

    /** Apply a draft stock count: post the variance as count movements. */
    public function applyCountRequest(Request $request, int $id): JsonResponse
    {
        $this->authorize('inventory.count');
        $count = StockCount::visibleTo($request->user())->findOrFail($id);
        DB::transaction(fn () => $this->applyCount($count));

        return $this->show($request, 'counts', $id);
    }

    private function applyCount(StockCount $count): void
    {
        $count = StockCount::whereKey($count->id)->lockForUpdate()->with('items')->first();
        if ($count->status === 'applied') {
            throw ValidationException::withMessages(['status' => 'Stock count already applied.']);
        }
        foreach ($count->items as $line) {
            $current = Stock::quantity($line->item_id, $count->branch_id);
            $diff = round($line->quantity - $current, 3);
            if (abs($diff) > 0.0001) {
                Stock::move($line->item_id, $count->branch_id, $diff, 'count', $count, $count->ref_no, $line->unit_cost, true, 'Stock count variance');
            }
        }
        $count->update(['status' => 'applied']);
    }

    /** Stock levels (per item, optionally per branch) with low-stock flag. */
    public function levels(Request $request): JsonResponse
    {
        $this->authorize('inventory.view');
        $user = $request->user();
        $branchId = $user->canAccessAllBranches() ? ($request->integer('branch_id') ?: null) : $user->branch_id;

        $items = Item::where('is_active', true)
            ->when($request->query('q'), fn ($q, $s) => $q->where(fn ($w) => $w->where('name', 'like', '%'.mb_substr($s, 0, 100).'%')->orWhere('code', 'like', '%'.mb_substr($s, 0, 100).'%')))
            ->orderBy('name')->get();
        $stocks = ItemStock::when($branchId, fn ($q) => $q->where('branch_id', $branchId))->get()->groupBy('item_id');

        $rows = $items->map(function ($item) use ($stocks) {
            $qty = (float) ($stocks[$item->id] ?? collect())->sum('quantity');

            return $item->only(['id', 'code', 'name', 'unit', 'cost_price', 'reorder_level']) + [
                'quantity' => round($qty, 3),
                'value' => round($qty * $item->cost_price, 2),
                'low' => $qty <= $item->reorder_level,
            ];
        });
        if ($request->boolean('low_only')) {
            $rows = $rows->where('low', true)->values();
        }

        return response()->json(['data' => $rows->values(), 'total_value' => round($rows->sum('value'), 2)]);
    }

    /** Item x Branch stock matrix. */
    public function branchStock(Request $request): JsonResponse
    {
        $this->authorize('inventory.view');
        $user = $request->user();
        $branches = Branch::where('is_active', true)->when(! $user->canAccessAllBranches(), fn ($q) => $q->whereKey($user->branch_id))->get(['id', 'code', 'name']);
        $stocks = ItemStock::whereIn('branch_id', $branches->pluck('id'))->get();
        $items = Item::where('is_active', true)->orderBy('name')->get(['id', 'code', 'name', 'unit', 'reorder_level']);

        return response()->json([
            'branches' => $branches,
            'items' => $items->map(fn ($i) => $i->toArray() + [
                'stock' => $branches->mapWithKeys(fn ($b) => [$b->id => (float) ($stocks->first(fn ($s) => $s->item_id === $i->id && $s->branch_id === $b->id)?->quantity ?? 0)]),
            ]),
        ]);
    }

    /** Stock records / movement register. */
    public function movements(Request $request): JsonResponse
    {
        $this->authorize('inventory.view');
        $q = StockMovement::visibleTo($request->user(), $request->integer('branch_id') ?: null)
            ->with(['item:id,code,name,unit', 'branch:id,name', 'user:id,name']);
        if ($request->filled('item_id')) {
            $q->where('item_id', $request->integer('item_id'));
        }
        if ($request->filled('type')) {
            $q->where('type', (string) $request->query('type'));
        }
        if ($from = $request->date('from')) {
            $q->whereDate('created_at', '>=', $from);
        }
        if ($to = $request->date('to')) {
            $q->whereDate('created_at', '<=', $to);
        }

        return response()->json($request->boolean('all') ? ['data' => $q->latest('id')->limit(10000)->get()]
            : $q->latest('id')->paginate(min(max($request->integer('per_page', 25), 1), 100)));
    }
}
