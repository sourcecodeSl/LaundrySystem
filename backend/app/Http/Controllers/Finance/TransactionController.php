<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\ResourceController;
use App\Models\CashBookEntry;
use App\Models\Transaction;
use App\Models\TransactionCategory;
use App\Services\CashBook;
use App\Services\Numbering;
use App\Services\OrderService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Other incomes & expenses. Posted entries are immutable; delete reverses the cash book. */
class TransactionController extends ResourceController
{
    protected string $model = Transaction::class;

    protected const ABILITIES = [
        'view' => 'finance.transactions', 'create' => 'finance.transactions', 'update' => 'finance.transactions', 'delete' => 'finance.transactions',
    ];

    protected bool $branchScoped = true;

    protected array $searchable = ['ref_no', 'description', 'reference', 'category.name'];

    protected array $filterable = ['type', 'category_id', 'method'];

    protected array $sortable = ['id', 'date', 'amount'];

    protected string $dateColumn = 'date';

    protected array $with = ['category:id,name', 'user:id,name', 'branch:id,name'];

    protected function rules(Request $request, ?Model $model = null): array
    {
        return [
            'type' => ['required', Rule::in(['income', 'expense'])],
            'category_id' => ['required', 'integer', Rule::exists('transaction_categories', 'id')->where('type', $request->input('type'))],
            'date' => ['required', 'date', 'before_or_equal:today'],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:99999999'],
            'method' => ['required', Rule::in(['cash', 'card', 'bank_transfer', 'cheque'])],
            'reference' => ['nullable', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:255'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $model = null): array
    {
        if ($model) {
            throw ValidationException::withMessages(['transaction' => 'Posted transactions cannot be edited. Delete and re-enter instead.']);
        }
        $branch = OrderService::resolveBranch($request->user(), $request->input('branch_id'));

        return $data + [
            'ref_no' => Numbering::next($data['type'] === 'income' ? 'INC' : 'EXP', $branch->code, 4),
            'branch_id' => $branch->id,
            'user_id' => $request->user()->id,
            'shift_id' => CashBook::currentShiftId($branch->id),
        ];
    }

    protected function afterSave(Model $model, Request $request, bool $created): Model
    {
        $cat = TransactionCategory::find($model->category_id);
        CashBook::record($model->type === 'income' ? 'in' : 'out', $model->type, $model->method, $model->amount,
            $model->branch_id, $model, $model->ref_no, $cat?->name.($model->description ? ' - '.$model->description : ''), $model->date->toDateString());

        return $model;
    }

    protected function beforeDelete(Model $model): void
    {
        CashBookEntry::where(['sourceable_type' => Transaction::class, 'sourceable_id' => $model->id])->delete();
    }
}
