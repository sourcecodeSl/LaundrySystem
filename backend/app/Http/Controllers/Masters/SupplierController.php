<?php

namespace App\Http\Controllers\Masters;

use App\Http\Controllers\ResourceController;
use App\Models\Supplier;
use App\Services\Ledger;
use App\Services\Numbering;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SupplierController extends ResourceController
{
    protected string $model = Supplier::class;

    protected const PERMISSION = 'suppliers';

    protected array $searchable = ['name', 'mobile', 'code', 'contact_person'];

    protected array $filterable = ['is_active'];

    protected array $sortable = ['id', 'name', 'code', 'balance'];

    protected function rules(Request $request, ?Model $model = null): array
    {
        return [
            'name' => ['required', 'string', 'max:150'],
            'contact_person' => ['nullable', 'string', 'max:150'],
            'mobile' => ['nullable', 'string', 'regex:/^\+?[0-9 ]{7,20}$/'],
            'email' => ['nullable', 'email', 'max:150'],
            'address' => ['nullable', 'string', 'max:255'],
            'opening_balance' => [$model ? 'prohibited' : 'nullable', 'numeric', 'min:-99999999', 'max:99999999'],
            'is_active' => ['boolean'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $model = null): array
    {
        if (! $model) {
            $data['code'] = Numbering::next('SUP', null, 4);
            $data['opening_balance'] = (float) ($data['opening_balance'] ?? 0);
            $data['balance'] = 0;
        }

        return $data;
    }

    protected function afterSave(Model $model, Request $request, bool $created): Model
    {
        if ($created && $model->opening_balance != 0) {
            $ob = $model->opening_balance;
            Ledger::supplier($model, 'opening', max(0, -$ob), max(0, $ob), 'OPENING', $model, 'Opening balance');
        }

        return $model->refresh();
    }

    protected function beforeDelete(Model $model): void
    {
        if ($model->grns()->exists() || abs($model->balance) > 0.001) {
            throw ValidationException::withMessages(['supplier' => 'Supplier has GRNs or a balance. Deactivate instead.']);
        }
    }
}
