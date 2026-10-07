<?php

namespace App\Http\Controllers\Operations;

use App\Http\Controllers\ResourceController;
use App\Models\DamageLostItem;
use App\Models\Order;
use App\Services\Numbering;
use App\Services\OrderService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DamageLostController extends ResourceController
{
    protected string $model = DamageLostItem::class;

    protected const PERMISSION = 'damage_lost';

    protected const ABILITIES = ['delete' => 'damage_lost.update'];

    protected bool $branchScoped = true;

    protected array $searchable = ['ref_no', 'item_description', 'order.order_no', 'customer.name', 'customer.mobile'];

    protected array $filterable = ['type', 'status'];

    protected array $sortable = ['id', 'reported_on', 'compensation'];

    protected string $dateColumn = 'reported_on';

    protected array $with = ['order:id,order_no', 'customer:id,name,mobile', 'user:id,name'];

    protected function rules(Request $request, ?Model $model = null): array
    {
        return [
            'order_id' => [$model ? 'prohibited' : 'nullable', 'integer'],
            'order_item_id' => ['nullable', 'integer', 'exists:order_items,id'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'type' => ['required', Rule::in(['damage', 'lost'])],
            'item_description' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'compensation' => ['nullable', 'numeric', 'min:0'],
            'status' => ['sometimes', Rule::in(['reported', 'investigating', 'compensated', 'closed'])],
            'reported_on' => ['required', 'date', 'before_or_equal:today'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $model = null): array
    {
        $user = $request->user();
        $data['compensation'] ??= 0;
        if (! $model) {
            $order = ! empty($data['order_id']) ? Order::visibleTo($user)->findOrFail($data['order_id']) : null;
            $branch = $order?->branch ?? OrderService::resolveBranch($user, $request->input('branch_id'));
            $data += ['ref_no' => Numbering::next('DL', $branch->code, 4), 'branch_id' => $branch->id, 'user_id' => $user->id];
            $data['customer_id'] = $order?->customer_id ?? ($data['customer_id'] ?? null);
        }

        return $data;
    }
}
