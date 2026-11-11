import { inject } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { Sesion } from '../services/sesion';
import { Toast } from '../services/toast';

// Si alguien escribe a mano la dirección de una pantalla que su rol no puede ver (por ejemplo /compras siendo vendedor),
// lo manda a su pantalla de inicio. (Comodidad de la interfaz: los datos los protege el backend.)
export const rolPermitido = (ruta: { routeConfig?: { path?: string } | null }): boolean | UrlTree => {
  const sesion = inject(Sesion);
  const camino = ruta.routeConfig?.path ?? '';
  if (sesion.puedeVer(camino)) return true;
  inject(Toast).info('Tu rol no tiene acceso a esa pantalla.');
  return inject(Router).createUrlTree([sesion.inicio()]);
};
