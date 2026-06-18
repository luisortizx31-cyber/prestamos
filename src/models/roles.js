// Roles del sistema. Coinciden 1:1 con el campo `role` que se guarda en
// /usuarios/{uid} en Firestore (ver services/authService.js) y con lo que
// validan las Security Rules.
export const ROLES = {
  MASTER: 'master',
  COLLECTOR: 'collector',
  CLIENT: 'client',
}

export const ROLE_LABELS = {
  [ROLES.MASTER]: 'Usuario Maestro',
  [ROLES.COLLECTOR]: 'Comisionista',
  [ROLES.CLIENT]: 'Cliente',
}
