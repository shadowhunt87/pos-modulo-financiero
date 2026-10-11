import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

/** Token de inyección: cambiar a S3/R2 = escribir otra clase que cumpla FileStorage y apuntar el provider a ella. */
export const FILE_STORAGE = Symbol('FILE_STORAGE');

export interface FileStorage {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  /** No falla si el archivo ya no existe. */
  remove(key: string): Promise<void>;
}

/**
 * Disco local. La clave la genera SIEMPRE el servidor (`companyId/uuid`); aun así se
 * verifica que la ruta resuelta no se salga de la carpeta raíz.
 */
@Injectable()
export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('UPLOADS_DIR') ?? './uploads');
  }

  private pathOf(key: string) {
    const full = resolve(this.root, key);
    const rel = relative(this.root, full);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Clave de almacenamiento inválida');
    return full;
  }

  async save(key: string, data: Buffer) {
    const full = this.pathOf(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data, { flag: 'wx' }); // wx: nunca pisa un archivo existente
  }

  async read(key: string) {
    return readFile(this.pathOf(key));
  }

  async remove(key: string) {
    await rm(this.pathOf(key), { force: true });
  }
}
