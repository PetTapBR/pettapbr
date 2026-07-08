-- Patch de performance/consistencia para vinculacao de tag NFC.
-- Execute no SQL Editor do Supabase em producao.

create unique index if not exists nfc_tags_code_key
  on nfc_tags(code);

create index if not exists idx_nfc_tags_pet_id_not_null
  on nfc_tags(pet_id)
  where pet_id is not null;

create or replace function public.activate_nfc_tag_for_pet(
  p_tag_code text,
  p_pet_id text,
  p_owner_id text
)
returns table (
  ok boolean,
  status_code integer,
  message text,
  id text,
  code text,
  owner_id text,
  pet_id text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tag nfc_tags%rowtype;
  v_existing_tag nfc_tags%rowtype;
  v_normalized_code text := upper(trim(coalesce(p_tag_code, '')));
  v_now timestamptz := now();
begin
  if v_normalized_code = '' or trim(coalesce(p_pet_id, '')) = '' or trim(coalesce(p_owner_id, '')) = '' then
    return query select false, 400, 'tagCode e petId sao obrigatorios.', null::text, null::text, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  if not exists (
    select 1
    from pets
    where pets.id = p_pet_id
      and pets.owner_id = p_owner_id
  ) then
    return query select false, 404, 'Pet nao encontrado para este tutor.', null::text, null::text, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  select *
  into v_tag
  from nfc_tags
  where nfc_tags.code = v_normalized_code
  for update;

  if not found then
    return query select false, 404, 'Tag NFC nao encontrada.', null::text, null::text, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  if v_tag.status = 'disabled' then
    return query select false, 403, 'Esta tag esta desativada.', null::text, null::text, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  if v_tag.owner_id is not null and v_tag.owner_id <> p_owner_id then
    return query select false, 409, 'Esta tag ja pertence a outro tutor.', null::text, null::text, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  select *
  into v_existing_tag
  from nfc_tags
  where nfc_tags.pet_id = p_pet_id
    and nfc_tags.id <> v_tag.id
  limit 1;

  if found then
    return query select false, 409, format('Este pet ja possui uma tag NFC vinculada (%s).', v_existing_tag.code), null::text, null::text, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  if v_tag.owner_id = p_owner_id and v_tag.pet_id = p_pet_id and v_tag.status = 'active' then
    return query select true, 200, 'Esta tag ja esta vinculada a este pet.', v_tag.id, v_tag.code, v_tag.owner_id, v_tag.pet_id, v_tag.status, v_tag.created_at, v_tag.updated_at;
    return;
  end if;

  update nfc_tags
  set
    owner_id = p_owner_id,
    pet_id = p_pet_id,
    status = 'active',
    updated_at = v_now
  where nfc_tags.id = v_tag.id
  returning *
  into v_tag;

  return query select true, 200, 'Tag ativada e vinculada com sucesso.', v_tag.id, v_tag.code, v_tag.owner_id, v_tag.pet_id, v_tag.status, v_tag.created_at, v_tag.updated_at;
exception
  when unique_violation then
    return query select false, 409, 'Este pet ja possui uma tag NFC vinculada.', null::text, null::text, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
end;
$$;

revoke execute on function public.activate_nfc_tag_for_pet(text, text, text) from public;
revoke execute on function public.activate_nfc_tag_for_pet(text, text, text) from anon;
revoke execute on function public.activate_nfc_tag_for_pet(text, text, text) from authenticated;
grant execute on function public.activate_nfc_tag_for_pet(text, text, text) to service_role;
