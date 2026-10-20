import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Sesion } from '../services/sesion';
import { Tema } from '../services/tema';
import { Icono } from '../ui/icono/icono';
import { NombreIcono } from '../ui/icono/iconos';

// riel   → franja de íconos que se abre al pasar el mouse (por defecto)
// fijo   → menú siempre abierto, empuja el contenido
// oculto → no se ve nada; reaparece con el botón ☰, con Ctrl + B o al acercar el mouse al borde izquierdo
type Modo = 'riel' | 'fijo' | 'oculto';
const CLAVE = 'toolstore.menu';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icono],
  host: {
    '(document:keydown.escape)': 'cerrarTodo()',
    '(document:keydown)': 'atajo($event)',
  },
  templateUrl: './layout.html',
  styleUrl: './layout.css',
})
export class Layout {
  sesion = inject(Sesion);
  tema = inject(Tema);

  modo = signal<Modo>(this.leerModo());
  abiertoTemp = signal(false); // menú desplegado de forma temporal (modo oculto)
  menuMovil = signal(false); // cajón en pantallas pequeñas
  private reloj?: ReturnType<typeof setTimeout>;

  menu: { texto: string; icono: NombreIcono; ruta: string }[] = [
    { texto: 'Dashboard', icono: 'casa', ruta: '/dashboard' },
    { texto: 'Historial Mensual', icono: 'calendario', ruta: '/historial-mensual' },
    { texto: 'Inventario', icono: 'caja', ruta: '/inventario' },
    { texto: 'Ventas / POS', icono: 'carrito', ruta: '/ventas' },
    { texto: 'Compras', icono: 'bolsa', ruta: '/compras' },
    { texto: 'Clientes', icono: 'personas', ruta: '/clientes' },
    { texto: 'Proveedores', icono: 'camion', ruta: '/proveedores' },
    { texto: 'Reportes', icono: 'informe', ruta: '/reportes' },
    { texto: 'Configuración', icono: 'ajustes', ruta: '/configuracion' },
  ];

  alternarFijo() {
    this.poner(this.modo() === 'fijo' ? 'riel' : 'fijo');
  }

  ocultar() {
    this.abiertoTemp.set(false);
    this.poner('oculto');
  }

  // Botón ☰ flotante: muestra el menú encima del contenido
  invocar() {
    clearTimeout(this.reloj);
    this.abiertoTemp.set(!this.abiertoTemp());
  }

  // Ctrl + B: esconde el menú o lo devuelve
  alternarOculto() {
    if (typeof matchMedia === 'function' && matchMedia('(max-width: 900px)').matches) {
      this.menuMovil.set(!this.menuMovil());
      return;
    }
    if (this.modo() === 'oculto') this.poner('riel');
    else this.ocultar();
  }

  atajo(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      this.alternarOculto();
    }
  }

  // El mouse toca el borde izquierdo
  entraBorde() {
    if (this.modo() !== 'oculto') return;
    clearTimeout(this.reloj);
    this.abiertoTemp.set(true);
  }

  // El mouse se va del menú: se esconde solo
  saleMenu() {
    if (this.modo() !== 'oculto') return;
    clearTimeout(this.reloj);
    this.reloj = setTimeout(() => this.abiertoTemp.set(false), 280);
  }

  // Un clic en el contenido esconde el menú temporal
  alHacerClicContenido() {
    if (this.abiertoTemp()) this.abiertoTemp.set(false);
    if (this.menuMovil()) this.menuMovil.set(false);
  }

  irA() {
    this.menuMovil.set(false);
    if (this.modo() === 'oculto') this.abiertoTemp.set(false);
  }

  cerrarTodo() {
    this.abiertoTemp.set(false);
    this.menuMovil.set(false);
  }

  private poner(m: Modo) {
    this.modo.set(m);
    try { localStorage.setItem(CLAVE, m); } catch { /* sin almacenamiento: no pasa nada */ }
  }

  private leerModo(): Modo {
    try {
      const v = localStorage.getItem(CLAVE);
      return v === 'fijo' || v === 'oculto' ? v : 'riel';
    } catch {
      return 'riel';
    }
  }
}
