/**
 * Convierte el texto de un título en el "ancla" que se usa en /help/<seccion>#ancla.
 * "En pocas palabras" -> "en-pocas-palabras". DEBE ser idéntica a `slugify` en scripts/verificar-ayuda.mjs
 * (el guion comprueba con esta misma regla que cada ancla de ayuda.json exista en el .md).
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
