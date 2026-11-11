import { inject } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { Sesion } from '../services/sesion';

// Solo deja entrar a las pantallas internas si hay una sesión iniciada; si no, manda al login.
// (Es una comodidad de la pantalla: la protección real de los datos la debe dar el backend.)
export const autenticado = (): boolean | UrlTree => {
  return inject(Sesion).activa() ? true : inject(Router).createUrlTree(['/login']);
};
