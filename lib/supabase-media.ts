import { supabase } from "@/lib/supabase";

function sanitizeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function ensureSupabase() {
  if (!supabase) {
    throw new Error("Supabase nao configurado.");
  }

  return supabase;
}

export const PET_MEDIA_BUCKET = "pet-media";

export async function uploadPetFile(options: {
  ownerId: string;
  petId: string;
  file: File;
  mediaFolder: "avatar" | "photos" | "videos";
}) {
  const client = ensureSupabase();
  const safeName = sanitizeFileName(options.file.name || "arquivo");
  const ext = safeName.includes(".") ? safeName.split(".").pop() : "bin";
  const fileName = `${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const path = `${options.ownerId}/${options.petId}/${options.mediaFolder}/${fileName}`;

  const { error: uploadError } = await client.storage
    .from(PET_MEDIA_BUCKET)
    .upload(path, options.file, {
      upsert: true,
      cacheControl: "3600",
      contentType: options.file.type || undefined,
    });

  if (uploadError) {
    throw new Error(`Falha no upload: ${uploadError.message}`);
  }

  const { data } = client.storage.from(PET_MEDIA_BUCKET).getPublicUrl(path);

  return {
    path,
    publicUrl: data.publicUrl,
  };
}
