<?php

namespace App\Http\Controllers\Operations;

use App\Http\Controllers\ResourceController;
use App\Models\Complaint;
use App\Models\Order;
use App\Services\Numbering;
use App\Services\OrderService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Re-wash requests and customer complaints. */
class ComplaintController extends ResourceController
{
    protected string $model = Complaint::class;

    protected const PERMISSION = 'complaints';

    protected const ABILITIES = ['delete' => 'complaints.update'];

    protected bool $branchScoped = true;

    protected array $searchable = ['ref_no', 'description', 'order.order_no', 'customer.mobile', 'customer.name'];

    protected array $filterable = ['type', 'status'];

    protected array $sortable = ['id', 'created_at', 'status'];

    protected array $with = ['order:id,order_no', 'customer:id,name,mobile', 'user:id,name'];

    protected function rules(Request $request, ?Model $model = null): array
    {
        return [
            'order_id' => [$model ? 'prohibited' : 'nullable', 'integer'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'type' => ['required', Rule::in(['rewash', 'complaint'])],
            'description' => ['required', 'string', 'max:2000'],
            'status' => ['sometimes', Rule::in(['open', 'in_progress', 'resolved', 'rejected'])],
            'resolution' => ['nullable', 'string', 'max:2000'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $model = null): array
    {
        $user = $request->user();
        if (! $model) {
            $order = ! empty($data['order_id']) ? Order::visibleTo($user)->findOrFail($data['order_id']) : null;
            $branch = $order?->branch ?? OrderService::resolveBranch($user, $request->input('branch_id'));
            $data += ['ref_no' => Numbering::next('CMP', $branch->code, 4), 'branch_id' => $branch->id, 'user_id' => $user->id];
            $data['customer_id'] = $order?->customer_id ?? ($data['customer_id'] ?? null);
        }
        if (in_array($data['status'] ?? null, ['resolved', 'rejected'], true) && ! $model?->resolved_at) {
            $data['resolved_at'] = now();
        }

        return $data;
    }

    protected function afterSave(Model $model, Request $request, bool $created): Model
    {
        if ($created && $model->type === 'rewash' && $model->order_id) {
            OrderService::history($model->order, $model->order->status, "Re-wash requested ({$model->ref_no})");
        }

        return $model;
    }
}
