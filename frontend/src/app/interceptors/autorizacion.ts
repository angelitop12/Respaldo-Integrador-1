import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { API } from '../api';
import { Sesion } from '../services/sesion';
import { Toast } from '../services/toast';

// 1) Agrega el token de sesión a cada petición que va al backend.
// 2) Si el backend dice que el token ya no sirve (venció o fue alterado), cierra la sesión y manda al login.
export const autorizacion: HttpInterceptorFn = (req, next) => {
  const sesion = inject(Sesion);
  const toast = inject(Toast);

  const token = sesion.token();
  const peticion = token && req.url.startsWith(API)
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(peticion).pipe(
    catchError((error: HttpErrorResponse) => {
      // "SESION_INVALIDA" solo lo manda el backend cuando falla el token (no cuando, por ejemplo, la contraseña actual es incorrecta)
      if (error.status === 401 && error.error?.codigo === 'SESION_INVALIDA' && sesion.activa()) {
        toast.error('Tu sesión expiró. Inicia sesión de nuevo.');
        sesion.cerrar();
      }
      return throwError(() => error);
    })
  );
};
