<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\ResourceController;
use App\Models\Cheque;
use App\Services\OrderService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/** Cheque print register. */
class ChequeController extends ResourceController
{
    protected string $model = Cheque::class;

    protected const ABILITIES = [
        'view' => 'finance.cheques', 'create' => 'finance.cheques', 'update' => 'finance.cheques', 'delete' => 'finance.cheques',
    ];

    protected bool $branchScoped = true;

    protected array $searchable = ['payee', 'cheque_no', 'bank'];

    protected array $sortable = ['id', 'cheque_date', 'amount'];

    protected string $dateColumn = 'cheque_date';

    protected array $with = ['user:id,name'];

    protected function rules(Request $request, ?Model $model = null): array
    {
        return [
            'payee' => ['required', 'string', 'max:150'],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:999999999'],
            'cheque_date' => ['required', 'date'],
            'cheque_no' => ['nullable', 'string', 'max:50'],
            'bank' => ['nullable', 'string', 'max:100'],
            'ac_payee' => ['boolean'],
            'supplier_payment_id' => ['nullable', 'integer', 'exists:supplier_payments,id'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $model = null): array
    {
        if (! $model) {
            $data['branch_id'] = OrderService::resolveBranch($request->user(), $request->input('branch_id'))->id;
            $data['user_id'] = $request->user()->id;
        }

        return $data;
    }
}
