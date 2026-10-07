<?php

namespace App\Http\Controllers;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controllers\HasMiddleware;
use Illuminate\Routing\Controllers\Middleware;
use Illuminate\Support\Facades\DB;

/**
 * Generic, permission-guarded CRUD controller.
 * Subclasses declare the model, the permission prefix, validation rules,
 * searchable / filterable / sortable columns (whitelists, never raw input).
 */
abstract class ResourceController extends Controller implements HasMiddleware
{
    /** @var class-string<Model> */
    protected string $model;

    /** Permission prefix, e.g. "customers" → customers.view / .create / .update / .delete */
    protected const PERMISSION = '';

    /** Permission overrides per action, e.g. ['view' => 'services.view'] */
    protected const ABILITIES = [];

    protected array $searchable = [];

    protected array $filterable = [];

    protected array $sortable = ['id', 'created_at'];

    protected array $with = [];

    protected string $dateColumn = 'created_at';

    protected bool $branchScoped = false;

    abstract protected function rules(Request $request, ?Model $model = null): array;

    public static function middleware(): array
    {
        $ability = fn (string $action) => 'can:'.(static::ABILITIES[$action] ?? static::PERMISSION.'.'.$action);

        return [
            new Middleware($ability('view'), only: ['index', 'show']),
            new Middleware($ability('create'), only: ['store']),
            new Middleware($ability('update'), only: ['update']),
            new Middleware($ability('delete'), only: ['destroy']),
        ];
    }

    protected function query(Request $request): Builder
    {
        $query = $this->model::query()->with($this->with);
        if ($this->branchScoped) {
            $query->visibleTo($request->user(), $request->integer('branch_id') ?: null);
        }

        return $query;
    }

    public function index(Request $request): JsonResponse
    {
        $query = $this->query($request);

        if (($q = trim((string) $request->query('q'))) !== '' && $this->searchable) {
            $q = mb_substr($q, 0, 100);
            $query->where(function (Builder $w) use ($q) {
                foreach ($this->searchable as $col) {
                    if (str_contains($col, '.')) {
                        [$rel, $c] = explode('.', $col, 2);
                        $w->orWhereHas($rel, fn ($r) => $r->where($c, 'like', "%$q%"));
                    } else {
                        $w->orWhere($col, 'like', "%$q%");
                    }
                }
            });
        }

        foreach ($this->filterable as $col) {
            $val = $request->query($col);
            if ($val !== null && $val !== '' && is_scalar($val)) {
                $query->where($query->qualifyColumn($col), $val);
            }
        }
        if ($from = $request->date('from')) {
            $query->whereDate($query->qualifyColumn($this->dateColumn), '>=', $from);
        }
        if ($to = $request->date('to')) {
            $query->whereDate($query->qualifyColumn($this->dateColumn), '<=', $to);
        }
        $this->filter($query, $request);

        $sort = in_array($request->query('sort'), $this->sortable, true) ? $request->query('sort') : 'id';
        $dir = $request->query('dir') === 'asc' ? 'asc' : 'desc';
        $query->orderBy($query->qualifyColumn($sort), $dir);

        // Dropdown / export mode returns a capped flat list.
        if ($request->boolean('all')) {
            return response()->json(['data' => $query->limit($request->boolean('export') ? 10000 : 1000)->get()]);
        }

        return response()->json($query->paginate(min(max($request->integer('per_page', 15), 1), 100)));
    }

    /** Hook for extra filters. */
    protected function filter(Builder $query, Request $request): void {}

    public function show(Request $request, int $id): JsonResponse
    {
        return response()->json($this->find($request, $id)->load($this->showWith()));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->prepare($request->validate($this->rules($request)), $request);
        $model = DB::transaction(fn () => $this->afterSave($this->model::create($data), $request, true));

        return response()->json($model->load($this->with), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $model = $this->find($request, $id);
        $data = $this->prepare($request->validate($this->rules($request, $model)), $request, $model);
        DB::transaction(function () use ($model, $data, $request) {
            $model->update($data);
            $this->afterSave($model, $request, false);
        });

        return response()->json($model->fresh($this->with));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $model = $this->find($request, $id);
        $this->beforeDelete($model);
        $model->delete();

        return response()->json(['message' => 'Deleted']);
    }

    protected function find(Request $request, int $id): Model
    {
        return $this->query($request)->findOrFail($id);
    }

    protected function showWith(): array
    {
        return $this->with;
    }

    /** Hook to adjust validated data before saving (e.g. force branch). */
    protected function prepare(array $data, Request $request, ?Model $model = null): array
    {
        if ($this->branchScoped && ! $request->user()->canAccessAllBranches()) {
            $data['branch_id'] = $request->user()->branch_id;
        }

        return $data;
    }

    protected function afterSave(Model $model, Request $request, bool $created): Model
    {
        return $model;
    }

    protected function beforeDelete(Model $model): void {}
}
