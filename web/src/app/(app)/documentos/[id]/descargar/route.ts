import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";

/** Enlace temporal (60 s) para descargar. Se revisa el acceso activo en cada solicitud. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.profile) return NextResponse.redirect(new URL("/login", request.url));
  const { id } = await params;
  const { data: doc } = await session.supabase.from("documents").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!doc) return new NextResponse("Documento no encontrado.", { status: 404 });
  const { data, error } = await session.supabase.storage
    .from("documents")
    .createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
  if (error || !data) return new NextResponse("No se pudo generar el enlace de descarga.", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
