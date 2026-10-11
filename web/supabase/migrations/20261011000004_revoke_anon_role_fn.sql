-- Sin sesión no hay rol que consultar: quitar la función de la API pública.
revoke execute on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;
