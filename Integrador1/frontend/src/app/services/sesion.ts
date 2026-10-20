import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Almacen } from './almacen';

// Acciones de sesión del front. El login de prueba sigue siendo admin / 1234;
// cuando haya backend, aquí se hace la llamada a la API.
@Injectable({ providedIn: 'root' })
export class Sesion {
  private router = inject(Router);
  private almacen = inject(Almacen);

  nombre = () => this.almacen.perfil().nombre;

  iniciales(): string {
    const partes = this.nombre().trim().split(/\s+/).filter(Boolean);
    const letras = partes.length > 1 ? partes[0][0] + partes[1][0] : (partes[0] ?? 'U').slice(0, 2);
    return letras.toUpperCase();
  }

  cerrar() {
    this.router.navigate(['/login']);
  }
}
