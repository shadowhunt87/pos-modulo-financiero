import { createRequire } from 'node:module';

/**
 * Versión de la API (la del package.json) y del contrato para sistemas integrados y verticales
 * (CONTRATO-VERTICALES §3.4: compatible si el mayor es igual y el menor del núcleo es mayor o igual).
 * V1a la usa como CORE_CONTRACT_VERSION. Menor = algo nuevo y opcional; mayor = algo que rompe.
 */
export const CONTRACT_VERSION = { major: 1, minor: 0 } as const;
export const API_VERSION: string = (createRequire(import.meta.url)('../../package.json') as { version: string }).version;
