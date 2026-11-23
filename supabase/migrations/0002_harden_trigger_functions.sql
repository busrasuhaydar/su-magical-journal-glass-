-- Tetikleyici fonksiyonları API üzerinden çağrılamasın (tetikleyiciler çalışmaya devam eder).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_change() from public, anon, authenticated;
