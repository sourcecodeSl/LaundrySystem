<?php

namespace App\Http\Controllers\Masters;

use App\Http\Controllers\ResourceController;
use App\Models\Customer;
use App\Services\Ledger;
use App\Services\Numbering;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Customers are shared across branches (a customer may visit any branch); branch is the home branch. */
class CustomerController extends ResourceController
{
    protected string $model = Customer::class;

    protected const PERMISSION = 'customers';

    protected const ABILITIES = ['view' => 'customers.view'];

    protected array $searchable = ['name', 'mobile', 'code', 'email'];

    protected array $filterable = ['is_active', 'branch_id'];

    protected array $sortable = ['id', 'name', 'code', 'balance', 'created_at'];

    protected array $with = ['branch:id,name'];

    protected function filter(Builder $query, Request $request): void
    {
        if ($request->boolean('with_balance')) {
            $query->where('balance', '>', 0);
        }
    }

    protected function rules(Request $request, ?Model $model = null): array
    {
        return [
            'name' => ['required', 'string', 'max:150'],
            'mobile' => ['required', 'string', 'regex:/^\+?[0-9 ]{7,20}$/', Rule::unique('customers')->ignore($model)->whereNull('deleted_at')],
            'email' => ['nullable', 'email', 'max:150'],
            'address' => ['nullable', 'string', 'max:255'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'credit_limit' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'opening_balance' => [$model ? 'prohibited' : 'nullable', 'numeric', 'min:-99999999', 'max:99999999'],
            'sms_opt_in' => ['boolean'],
            'is_active' => ['boolean'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $model = null): array
    {
        $data['mobile'] = preg_replace('/\s+/', '', $data['mobile']);
        if (! $model) {
            $data['code'] = Numbering::next('CUS', null, 5);
            $data['branch_id'] ??= $request->user()->branch_id;
            $data['opening_balance'] = (float) ($data['opening_balance'] ?? 0);
            $data['balance'] = 0;
        }
        if (! $request->user()->canAccessAllBranches()) {
            $data['branch_id'] = $model?->branch_id ?? $request->user()->branch_id;
        }

        return $data;
    }

    protected function afterSave(Model $model, Request $request, bool $created): Model
    {
        if ($created && $model->opening_balance != 0) {
            $ob = $model->opening_balance;
            Ledger::customer($model, 'opening', max(0, $ob), max(0, -$ob), 'OPENING', $model, 'Opening balance');
        }

        return $model->refresh();
    }

    protected function beforeDelete(Model $model): void
    {
        if ($model->orders()->exists() || abs($model->balance) > 0.001) {
            throw ValidationException::withMessages(['customer' => 'Customer has orders or a balance. Deactivate instead.']);
        }
    }
}
