import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Almacen } from './almacen';
import { INICIO, puedeVerRuta } from './permisos';

export interface UsuarioSesion {
  id: number;
  nombre: string;
  usuario: string;
  email: string;
  rol: string;
}

const CLAVE = 'toolstore.sesion';
const CLAVE_TOKEN = 'toolstore.token';

// Quién tiene la sesión abierta. Se guarda en sessionStorage: sobrevive a recargar la página
// pero se pierde al cerrar la pestaña.
@Injectable({ providedIn: 'root' })
export class Sesion {
  private router = inject(Router);
  private almacen = inject(Almacen);

  // El token lo entrega el backend al iniciar sesión y viaja en cada petición (ver interceptors/autorizacion.ts)
  token = signal<string | null>(this.leerToken());
  usuario = signal<UsuarioSesion | null>(this.leerToken() ? this.leer() : null);

  constructor() {
    // Tras recargar la página, el nombre del menú vuelve a ser el del usuario logueado
    const u = this.usuario();
    if (u) this.almacen.perfil.set({ nombre: u.nombre, correo: u.email });
  }

  activa = () => this.usuario() !== null && this.token() !== null;

  // ¿El usuario tiene alguno de estos roles? El administrador siempre puede. Solo sirve para mostrar u ocultar
  // botones: el backend es quien realmente bloquea (responde 403) si alguien lo intenta sin permiso.
  puede = (...roles: string[]) => {
    const rol = this.usuario()?.rol;
    return rol === 'ADMINISTRADOR' || (!!rol && roles.includes(rol));
  };
  // ¿Su rol puede abrir esta pantalla? (para el menú y para bloquear direcciones escritas a mano)
  puedeVer = (ruta: string) => puedeVerRuta(this.usuario()?.rol, ruta);
  // Pantalla con la que arranca según su rol: administrador → Dashboard, almacenero → Inventario, vendedor → Ventas
  inicio = () => INICIO[this.usuario()?.rol ?? ''] ?? '/configuracion';
  nombre = () => this.almacen.perfil().nombre;

  // Se llama con la respuesta del backend en /api/auth/login
  iniciar(datos: any, token: string) {
    const u: UsuarioSesion = {
      id: Number(datos.id),
      nombre: datos.nombre || datos.nombre_completo || datos.usuario || '',
      usuario: datos.usuario || '',
      email: datos.email || '',
      rol: datos.rol || '',
    };
    this.token.set(token);
    try { sessionStorage.setItem(CLAVE_TOKEN, token); } catch { /* sin almacenamiento: no pasa nada */ }
    this.guardar(u);
    this.almacen.perfil.set({ nombre: u.nombre, correo: u.email });
  }

  // Después de editar el perfil en Configuración
  actualizarPerfil(nombre: string, correo: string) {
    const u = this.usuario();
    if (!u) return;
    this.guardar({ ...u, nombre, email: correo });
    this.almacen.perfil.set({ nombre, correo });
  }

  iniciales(): string {
    const partes = this.nombre().trim().split(/\s+/).filter(Boolean);
    const letras = partes.length > 1 ? partes[0][0] + partes[1][0] : (partes[0] ?? 'U').slice(0, 2);
    return letras.toUpperCase();
  }

  cerrar() {
    this.usuario.set(null);
    this.token.set(null);
    try { sessionStorage.removeItem(CLAVE_TOKEN); } catch { /* sin almacenamiento: no pasa nada */ }
    try { sessionStorage.removeItem(CLAVE); } catch { /* sin almacenamiento: no pasa nada */ }
    this.almacen.perfil.set({ nombre: 'Administrador', correo: '' });
    this.router.navigate(['/login']);
  }

  private guardar(u: UsuarioSesion) {
    this.usuario.set(u);
    try { sessionStorage.setItem(CLAVE, JSON.stringify(u)); } catch { /* sin almacenamiento: no pasa nada */ }
  }

  private leerToken(): string | null {
    try { return sessionStorage.getItem(CLAVE_TOKEN); } catch { return null; }
  }

  private leer(): UsuarioSesion | null {
    try {
      const crudo = sessionStorage.getItem(CLAVE);
      if (!crudo) return null;
      const u = JSON.parse(crudo);
      return u && Number.isFinite(Number(u.id)) ? (u as UsuarioSesion) : null;
    } catch {
      return null;
    }
  }
}
