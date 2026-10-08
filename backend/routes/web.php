<?php

use Illuminate\Support\Facades\Route;

// Serve the built React SPA (copied into public/ at deploy time). API routes
// live under /api and are registered separately, so they take precedence.
// In local dev the SPA is served by Vite (:5173), so index.html may be absent.
Route::fallback(function () {
    $spa = public_path('index.html');
    abort_unless(is_file($spa), 404);

    return response()->file($spa);
});

Route::get('/', function () {
    $spa = public_path('index.html');

    return is_file($spa) ? response()->file($spa) : view('welcome');
});
