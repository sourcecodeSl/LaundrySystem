<?php

namespace App\Http\Controllers\Masters;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\VariantPrice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Variant x Service price list, plus bulk price update. */
class PriceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('services.view');

        return response()->json(VariantPrice::get(['id', 'variant_id', 'service_id', 'price']));
    }

    /** Save a set of cells: [{variant_id, service_id, price|null}] (null removes the price). */
    public function save(Request $request): JsonResponse
    {
        $this->authorize('services.prices');
        $data = $request->validate([
            'prices' => ['required', 'array', 'max:5000'],
            'prices.*.variant_id' => ['required', 'integer', 'exists:service_variants,id'],
            'prices.*.service_id' => ['required', 'integer', 'exists:services,id'],
            'prices.*.price' => ['nullable', 'numeric', 'min:0', 'max:9999999'],
        ]);

        DB::transaction(function () use ($data) {
            foreach ($data['prices'] as $p) {
                $key = ['variant_id' => $p['variant_id'], 'service_id' => $p['service_id']];
                if ($p['price'] === null || $p['price'] === '') {
                    VariantPrice::where($key)->delete();
                } else {
                    VariantPrice::updateOrCreate($key, ['price' => round((float) $p['price'], 2)]);
                }
            }
        });
        ActivityLog::record('prices_updated', null, ['count' => count($data['prices'])], 'Price list updated ('.count($data['prices']).' cells)');

        return $this->index($request);
    }

    public function bulk(Request $request): JsonResponse
    {
        $this->authorize('services.bulk_price');
        $data = $request->validate([
            'mode' => ['required', Rule::in(['percent', 'amount', 'set'])],
            'value' => ['required', 'numeric', 'min:-100000', 'max:9999999'],
            'service_ids' => ['array'],
            'service_ids.*' => ['integer'],
            'category_ids' => ['array'],
            'category_ids.*' => ['integer'],
            'pricing_type' => ['nullable', Rule::in(['weight_range', 'per_piece', 'per_item'])],
            'round_to' => ['nullable', 'numeric', 'min:0', 'max:1000'],
            'preview' => ['boolean'],
        ]);
        if ($data['mode'] === 'percent' && $data['value'] < -100) {
            $data['value'] = -100;
        }

        $q = VariantPrice::with(['variant:id,name,category_id,pricing_type', 'service:id,name'])
            ->when($data['service_ids'] ?? null, fn ($q, $ids) => $q->whereIn('service_id', $ids))
            ->whereHas('variant', function ($v) use ($data) {
                $v->when($data['category_ids'] ?? null, fn ($q, $ids) => $q->whereIn('category_id', $ids))
                    ->when($data['pricing_type'] ?? null, fn ($q, $t) => $q->where('pricing_type', $t));
            });

        $round = (float) ($data['round_to'] ?? 0);
        $rows = $q->get()->map(function ($p) use ($data, $round) {
            $new = match ($data['mode']) {
                'percent' => $p->price * (1 + $data['value'] / 100),
                'amount' => $p->price + $data['value'],
                'set' => $data['value'],
            };
            $new = max(0, $round > 0 ? round($new / $round) * $round : round($new, 2));

            return ['id' => $p->id, 'variant' => $p->variant?->name, 'service' => $p->service?->name, 'old' => $p->price, 'new' => round($new, 2)];
        });

        if (! ($data['preview'] ?? false)) {
            DB::transaction(fn () => $rows->each(fn ($r) => VariantPrice::whereKey($r['id'])->update(['price' => $r['new']])));
            ActivityLog::record('bulk_price_update', null, collect($data)->except('preview')->all() + ['affected' => $rows->count()], 'Bulk price update on '.$rows->count().' prices');
        }

        return response()->json(['affected' => $rows->count(), 'rows' => $rows->take(500)->values(), 'applied' => ! ($data['preview'] ?? false)]);
    }
}
