#!/usr/bin/env node
/**
 * Verifica que la Ayuda integrada esté completa (docs/PLAN-v0.2.md 8.3). Sin dependencias. Uso:
 *   npm run verificar-ayuda            (o: node scripts/verificar-ayuda.mjs [carpeta-del-manual])
 * Sale con código 1 si falta algo. Comprueba:
 *  1. public/manual/ayuda.json existe y es JSON válido; `secciones` con slug, archivo y titulo (sin repetidos).
 *  2. Cada sección tiene su .md. Avisa de los .md que no están en `secciones` (salvo GUIA-DE-ESTILO.md).
 *  3. Cada ruta de los *.routes.ts (con pantalla) tiene su entrada en `pantallas`, con `seccion` existente
 *     y, si trae `ancla`, que exista como título en ese .md.
 *  4. `campos` con seccion/ancla, y los enlaces de `errores` y `siguiente`, apuntan a algo que existe.
 *  5. En los .md: imágenes locales que existan (nada de internet), enlaces internos válidos y sin HTML crudo.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(root, 'src', 'app');
const manualDir = resolve(process.argv[2] ?? join(root, 'public', 'manual'));

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

/** DEBE ser igual a slugify en src/app/features/help/help-slug.ts (así se calculan las anclas). */
function slugify(text) {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------- rutas de la app ----------
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith('.routes.ts') ? [join(dir, d.name)] : []);
}
/** Rutas con pantalla (loadComponent). Se ignoran "**" y "login" (pantalla pública, sin el botón "?"). */
const routes = new Set();
for (const file of walk(appDir)) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /\{\s*path:\s*'([^']*)'.*loadComponent/.exec(line);
    if (!m || m[1] === '**' || m[1] === 'login') continue;
    routes.add('/' + m[1]);
  }
}
if (!routes.size) err('No se encontró ninguna ruta en los *.routes.ts (¿cambió su formato?).');

/** ¿Esta ruta ("/invoices/3f2a", "/payments/new?x=1") existe en la app? Los ":id" aceptan cualquier valor. */
function routeExists(url) {
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const parts = path.split('/');
  if (path === '/login') return true; // pantalla pública: existe, aunque no necesita ayuda propia
  return [...routes].some((r) => {
    const rp = r.split('/');
    return rp.length === parts.length && rp.every((seg, i) => seg.startsWith(':') || seg === parts[i]);
  });
}

// ---------- ayuda.json ----------
const jsonPath = join(manualDir, 'ayuda.json');
if (!existsSync(jsonPath)) {
  err(`Falta ${jsonPath}`);
  finish();
}
let ayuda;
try { ayuda = JSON.parse(readFileSync(jsonPath, 'utf8')); }
catch (e) { err(`ayuda.json no es JSON válido: ${e.message}`); finish(); }

const secciones = Array.isArray(ayuda.secciones) ? ayuda.secciones : [];
if (!secciones.length) err('ayuda.json: "secciones" está vacía o no es una lista.');
const bySlug = new Map();
for (const s of secciones) {
  if (!s || !s.slug || !s.archivo || !s.titulo) { err(`ayuda.json: sección incompleta (hace falta slug, archivo y titulo): ${JSON.stringify(s)}`); continue; }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s.slug)) err(`ayuda.json: slug no válido "${s.slug}" (solo minúsculas, números y guiones).`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(s.archivo)) err(`ayuda.json: archivo no válido "${s.archivo}" (nombre simple terminado en .md).`);
  if (bySlug.has(s.slug)) err(`ayuda.json: slug repetido "${s.slug}".`);
  bySlug.set(s.slug, s);
}
const byFile = new Map([...bySlug.values()].map((s) => [s.archivo, s]));

// ---------- los .md: existencia, anclas, imágenes, enlaces, HTML ----------
const anchors = new Map(); // slug de sección -> Set de anclas
for (const s of bySlug.values()) {
  const p = join(manualDir, s.archivo);
  if (!existsSync(p)) { err(`La sección "${s.slug}" apunta a ${s.archivo}, que no existe en ${manualDir}.`); continue; }
  const text = readFileSync(p, 'utf8');
  const set = new Set();
  const used = new Set();
  let inCode = false;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const h = /^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!h) continue;
    // mismo criterio que el visor: texto visible del título, sin marcas de énfasis, enlaces ni código
    const plain = h[2].replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_~]/g, '');
    const base = slugify(plain) || 'seccion';
    let id = base, n = 2;
    while (used.has(id)) id = base + '-' + n++;
    used.add(id); set.add(id);
  }
  anchors.set(s.slug, set);
  checkMarkdown(s, text);
}
for (const f of existsSync(manualDir) ? readdirSync(manualDir) : []) {
  if (f.endsWith('.md') && f !== 'GUIA-DE-ESTILO.md' && !byFile.has(f)) warn(`${f} está en el manual pero no figura en "secciones" (no se publica).`);
}

function checkAnchor(where, slug, ancla) {
  if (!bySlug.has(slug)) { err(`${where}: la sección "${slug}" no existe en "secciones".`); return; }
  if (ancla && anchors.has(slug) && !anchors.get(slug).has(ancla)) err(`${where}: la ancla "${ancla}" no existe en ${bySlug.get(slug).archivo}.`);
}

function checkMarkdown(s, text) {
  const where = (extra) => `${s.archivo}: ${extra}`;
  // se ignoran los bloques y el código en línea
  const body = text.replace(/^(```|~~~)[\s\S]*?^\1/gm, '').replace(/`[^`\n]*`/g, '');
  for (const m of body.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)/g)) {
    const src = m[1];
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(src)) { err(where(`imagen de internet o no permitida: ${src} (las imágenes van en manual/img/).`)); continue; }
    if (!/^(\.\/)?img\//.test(src) || src.includes('..')) { err(where(`imagen fuera de manual/img/: ${src}`)); continue; }
    if (!existsSync(join(manualDir, src.replace(/^\.\//, '')))) err(where(`la imagen ${src} no existe.`));
  }
  for (const m of body.matchAll(/(?<!!)\[[^\]]*\]\(\s*([^)\s]+)/g)) {
    const href = m[1];
    if (/^(https?:\/\/|mailto:)/i.test(href)) continue;
    if (href.startsWith('#')) { if (!anchors.get(s.slug)?.has(href.slice(1))) err(where(`el enlace ${href} no existe en esta sección.`)); continue; }
    const md = /^(?:\.\/)?([^#]+\.md)(#.*)?$/.exec(href);
    if (md) {
      const target = byFile.get(md[1]);
      if (!target) err(where(`el enlace ${href} apunta a un .md que no está en "secciones".`));
      else if (md[2]) checkAnchor(where(`enlace ${href}`), target.slug, md[2].slice(1));
      continue;
    }
    if (href.startsWith('/')) {
      const hp = /^\/help\/([^#?/]+)(?:#(.+))?$/.exec(href);
      if (hp) checkAnchor(where(`enlace ${href}`), hp[1], hp[2]);
      else if (href !== '/help' && !routeExists(href)) err(where(`el enlace ${href} no corresponde a ninguna pantalla.`));
      continue;
    }
    err(where(`enlace no permitido: ${href} (solo https://, mailto:, rutas de la app o secciones del manual).`));
  }
  const html = /<\/?[A-Za-z][A-Za-z0-9-]*(\s[^>]*)?\/?>/.exec(body);
  if (html) err(where(`HTML incrustado "${html[0].slice(0, 40)}": la guía de estilo lo prohíbe (el visor lo mostraría como texto).`));
}

// ---------- pantallas ----------
const pantallas = ayuda.pantallas && typeof ayuda.pantallas === 'object' ? ayuda.pantallas : {};
for (const r of [...routes].sort()) {
  const e = pantallas[r];
  if (!e) { err(`Ruta sin ayuda: "${r}" no tiene entrada en "pantallas" de ayuda.json.`); continue; }
  if (!e.seccion) { err(`pantallas["${r}"]: falta "seccion".`); continue; }
  checkAnchor(`pantallas["${r}"]`, e.seccion, e.ancla);
}
for (const [r, e] of Object.entries(pantallas)) {
  if (!routes.has(r) && r !== '/login' && r !== '') warn(`pantallas["${r}"] no corresponde a ninguna ruta actual (¿se renombró?).`);
  if (e?.siguiente?.ruta && !routeExists(e.siguiente.ruta)) err(`pantallas["${r}"].siguiente.ruta "${e.siguiente.ruta}" no corresponde a ninguna pantalla.`);
}

// ---------- campos y errores ----------
for (const [k, v] of Object.entries(ayuda.campos ?? {})) {
  if (typeof v === 'string') { if (!v.trim()) err(`campos["${k}"] está vacío.`); continue; }
  if (!v?.texto) err(`campos["${k}"]: falta "texto".`);
  if (v?.seccion) checkAnchor(`campos["${k}"]`, v.seccion, v.ancla);
}
const errores = Array.isArray(ayuda.errores) ? ayuda.errores : Object.entries(ayuda.errores ?? {}).map(([patron, v]) => ({ patron, ...v }));
errores.forEach((e, i) => {
  const id = `errores[${i}]`;
  if (!e.patron || !e.explicacion) err(`${id}: faltan "patron" o "explicacion".`);
  try { new RegExp(e.patron, 'i'); } catch { err(`${id}: "patron" no es una expresión regular válida: ${e.patron}`); }
  const ruta = e.enlace?.ruta;
  if (ruta) {
    const hp = /^\/help\/([^#?/]+)(?:#(.+))?$/.exec(ruta);
    if (hp) checkAnchor(`${id}.enlace`, hp[1], hp[2]);
    else if (ruta !== '/help' && !routeExists(ruta)) err(`${id}.enlace.ruta "${ruta}" no corresponde a ninguna pantalla.`);
  }
});

finish();

function finish() {
  for (const w of warnings) console.warn('AVISO  ' + w);
  for (const e of errors) console.error('ERROR  ' + e);
  if (errors.length) {
    console.error(`\nverificar-ayuda: ${errors.length} problema(s). La Ayuda no está completa.`);
    process.exit(1);
  }
  console.log(`verificar-ayuda: todo en orden (${routes.size} rutas, ${secciones.length} secciones, ${Object.keys(ayuda.campos ?? {}).length} ayudas de campo, ${errores.length} errores explicados).`);
  process.exit(0);
}
