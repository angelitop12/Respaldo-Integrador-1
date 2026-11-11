import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { Toast } from '../services/toast';

let ultimoAviso = 0;

// Si el backend está apagado, antes las pantallas se quedaban vacías sin explicar nada.
// Ahora se avisa una vez (aunque fallen varias peticiones a la vez).
export const erroresDeRed: HttpInterceptorFn = (req, next) => {
  const toast = inject(Toast);
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // status 0 = el navegador no pudo hablar con el servidor (apagado, otra dirección, CORS...)
      if (error.status === 0 && Date.now() - ultimoAviso > 8000) {
        ultimoAviso = Date.now();
        toast.error('No se pudo conectar con el servidor. Revisa que el backend esté encendido (npm run dev).');
      }
      return throwError(() => error);
    })
  );
};
