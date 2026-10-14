import { UnprocessableEntityException } from '@nestjs/common';

/**
 * Lector mínimo de XML para los e-CF. No usa librería: el XML de la DGII es simple (elementos y
 * texto) y así no hay forma de que lleguen entidades externas (XXE) ni "bombas" de entidades:
 * un DOCTYPE o una declaración de entidad se rechazan antes de leer nada.
 */
export interface XmlNode {
  name: string; // sin prefijo de espacio de nombres
  children: XmlNode[];
  text: string;
}

export const MAX_XML_CHARS = 1_048_576; // 1 MB, igual que el tope de subida
const MAX_DEPTH = 30; // PLAN-v0.3 §7.4
const MAX_NODES = 50_000;

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, e: string) =>
    e.startsWith('#x') ? String.fromCodePoint(parseInt(e.slice(2), 16))
      : e.startsWith('#') ? String.fromCodePoint(parseInt(e.slice(1), 10))
        : ENTITIES[e]);
const localName = (qname: string) => qname.slice(qname.indexOf(':') + 1);

const bad = (why: string) => new UnprocessableEntityException(`El archivo no es un XML válido: ${why}`);

export function parseXml(input: string): XmlNode {
  if (input.length > MAX_XML_CHARS) throw bad('es demasiado grande');
  if (/<!DOCTYPE|<!ENTITY/i.test(input)) throw bad('trae declaraciones DOCTYPE/ENTITY, que no se aceptan por seguridad');
  const src = input.replace(/^﻿/, '');
  const root: XmlNode = { name: '#root', children: [], text: '' };
  const stack: XmlNode[] = [root];
  let nodes = 0;
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      stack[stack.length - 1].text += decode(src.slice(i));
      break;
    }
    if (lt > i) stack[stack.length - 1].text += decode(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end === -1) throw bad('comentario sin cerrar');
      i = end + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      if (end === -1) throw bad('CDATA sin cerrar');
      stack[stack.length - 1].text += src.slice(lt + 9, end);
      i = end + 3;
    } else if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt + 2);
      if (end === -1) throw bad('instrucción sin cerrar');
      i = end + 2;
    } else if (src.startsWith('</', lt)) {
      const end = src.indexOf('>', lt);
      if (end === -1) throw bad('etiqueta sin cerrar');
      const name = localName(src.slice(lt + 2, end).trim());
      const open = stack.pop();
      if (!open || open === root || open.name !== name) throw bad(`cierre inesperado de <${name}>`);
      i = end + 1;
    } else {
      const end = src.indexOf('>', lt);
      if (end === -1) throw bad('etiqueta sin cerrar');
      const raw = src.slice(lt + 1, end);
      const selfClosing = raw.endsWith('/');
      const qname = /^[^\s/>]+/.exec(raw)?.[0];
      if (!qname) throw bad('etiqueta sin nombre');
      const node: XmlNode = { name: localName(qname), children: [], text: '' };
      if (++nodes > MAX_NODES) throw bad('tiene demasiados elementos');
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) {
        stack.push(node);
        if (stack.length > MAX_DEPTH) throw bad('anidación demasiado profunda');
      }
      i = end + 1;
    }
  }
  if (stack.length !== 1) throw bad(`falta cerrar <${stack[stack.length - 1].name}>`);
  const top = root.children;
  if (top.length !== 1) throw bad('debe tener un solo elemento raíz');
  return top[0];
}

/** Primer hijo con ese nombre siguiendo la ruta (ej: child(ecf, 'Encabezado', 'IdDoc', 'eNCF')). */
export function child(node: XmlNode | undefined, ...path: string[]): XmlNode | undefined {
  let cur = node;
  for (const p of path) cur = cur?.children.find((c) => c.name === p);
  return cur;
}

export function children(node: XmlNode | undefined, name: string): XmlNode[] {
  return node?.children.filter((c) => c.name === name) ?? [];
}

/** Texto (sin espacios a los lados) del elemento en la ruta, o undefined si no está o está vacío. */
export function text(node: XmlNode | undefined, ...path: string[]): string | undefined {
  const t = child(node, ...path)?.text.trim();
  return t ? t : undefined;
}
