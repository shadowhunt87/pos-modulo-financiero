/**
 * Nombres de campo que parecen secretos (ANEXO-S0 §4.4, inglés y español). Lo usan la guardia de `writeAudit` (§3.12)
 * y la prueba de cobertura de la exportación completa (§4.4).
 */
export const SECRET_NAME_PATTERN =
  /password|secret|hash|token|credential|enc$|apikey|privatekey|p12|certificate|contrasena|contraseña|clave|secreto|credencial|certificado|cifrad/i;
