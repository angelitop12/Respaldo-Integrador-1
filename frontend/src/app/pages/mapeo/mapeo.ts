import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { API } from '../../api';
import { Confirmar } from '../../services/confirmar';
import { Sesion } from '../../services/sesion';
import { Toast } from '../../services/toast';
import { Icono } from '../../ui/icono/icono';
import { Modal } from '../../ui/modal/modal';
import { Vacio } from '../../ui/vacio/vacio';

interface ProductoUbicado { id: number; nombre: string; stock: number; unidad: string; }

interface Ubicacion {
  id: number; codigo: string; zona: string; pasillo: string; estante: string; nivel: number;
  descripcion: string | null; activo: boolean; productos: ProductoUbicado[];
}

interface ProductoInv {
  id: number; nombre: string; stock: number; unidad: string; categoria: string;
  marca?: string | null; ubicacionId?: number | null;
}

interface ProveedorLista { id: number; empresa: string; ruc: string; }

interface Vinculo {
  productoId: number; producto: string; proveedorId: number; proveedor: string; ruc: string | null;
  codigoProveedor: string | null; precioCompra: number; plazoEntregaDias: number; esPrincipal: boolean;
}

interface Pasillo { nombre: string; ubicaciones: Ubicacion[]; }
interface Zona { nombre: string; pasillos: Pasillo[]; }

const FORM_UBICACION = () => ({ zona: '', pasillo: '', estante: '', nivel: 1, descripcion: '', activo: true });
const FORM_VINCULO = () => ({ productoId: null as number | null, proveedorId: null as number | null, codigoProveedor: '', precioCompra: null as number | null, plazoEntregaDias: 1, esPrincipal: false });

@Component({
  selector: 'app-mapeo',
  imports: [DecimalPipe, FormsModule, Icono, Modal, Vacio],
  templateUrl: './mapeo.html',
  styleUrl: './mapeo.css',
})
export class Mapeo implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(Toast);
  private confirmar = inject(Confirmar);
  sesion = inject(Sesion);

  pestana = signal<'ubicacion' | 'proveedor'>('ubicacion');
  cargando = signal(true);

  ubicaciones = signal<Ubicacion[]>([]);
  productos = signal<ProductoInv[]>([]);
  proveedores = signal<ProveedorLista[]>([]);
  vinculos = signal<Vinculo[]>([]);

  busqueda = signal('');

  // ---------- Pestaña 1: ubicación en el almacén ----------
  sinUbicar = computed(() => this.productos().filter(p => !p.ubicacionId));
  ocupadas = computed(() => this.ubicaciones().filter(u => u.productos.length > 0).length);
  libres = computed(() => this.ubicaciones().filter(u => u.activo && u.productos.length === 0).length);

  zonas = computed<Zona[]>(() => {
    const q = this.busqueda().trim().toLowerCase();
    const visibles = this.ubicaciones().filter(u =>
      !q || [u.codigo, u.zona, u.descripcion || '', ...u.productos.map(p => p.nombre)].some(t => t.toLowerCase().includes(q))
    );
    const porZona = new Map<string, Map<string, Ubicacion[]>>();
    for (const u of visibles) {
      if (!porZona.has(u.zona)) porZona.set(u.zona, new Map());
      const pasillos = porZona.get(u.zona)!;
      if (!pasillos.has(u.pasillo)) pasillos.set(u.pasillo, []);
      pasillos.get(u.pasillo)!.push(u);
    }
    return [...porZona].map(([nombre, pasillos]) => ({
      nombre,
      pasillos: [...pasillos].map(([p, ubicaciones]) => ({ nombre: p, ubicaciones })),
    }));
  });

  modalUbicacion = signal(false);
  editandoUbicacion = signal<number | null>(null);
  formUbicacion = FORM_UBICACION();
  errorUbicacion = signal('');

  // ---------- Pestaña 2: producto <-> proveedor ----------
  filtroProveedor = signal<number | ''>('');
  soloSinProveedor = signal(false);

  filasVinculos = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    return this.vinculos().filter(v =>
      (this.filtroProveedor() === '' || v.proveedorId === this.filtroProveedor()) &&
      (!q || [v.producto, v.proveedor, v.ruc || '', v.codigoProveedor || ''].some(t => t.toLowerCase().includes(q)))
    );
  });

  productosSinProveedor = computed(() => {
    const conProveedor = new Set(this.vinculos().map(v => v.productoId));
    const q = this.busqueda().trim().toLowerCase();
    return this.productos().filter(p => !conProveedor.has(p.id) && (!q || p.nombre.toLowerCase().includes(q)));
  });
  cantidadSinProveedor = computed(() => {
    const conProveedor = new Set(this.vinculos().map(v => v.productoId));
    return this.productos().filter(p => !conProveedor.has(p.id)).length;
  });

  modalVinculo = signal(false);
  editandoVinculo = signal(false);
  formVinculo = FORM_VINCULO();
  errorVinculo = signal('');

  ngOnInit() {
    this.cargarTodo();
  }

  cargarTodo() {
    this.cargando.set(true);
    this.cargarUbicaciones();
    this.cargarProductos();
    this.cargarVinculos();
    this.http.get<ProveedorLista[]>(`${API}/proveedores`).subscribe({
      next: (d) => this.proveedores.set((d || []).map(p => ({ id: p.id, empresa: p.empresa, ruc: p.ruc || '' }))),
      error: () => {}
    });
  }

  cargarUbicaciones() {
    this.http.get<any[]>(`${API}/ubicaciones`).subscribe({
      next: (d) => {
        this.ubicaciones.set((d || []).map(u => ({
          ...u, nivel: Number(u.nivel),
          productos: (u.productos || []).map((p: any) => ({ ...p, stock: Number(p.stock) })),
        })));
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false)
    });
  }

  cargarProductos() {
    this.http.get<any[]>(`${API}/inventario`).subscribe({
      next: (d) => this.productos.set((d || []).map(p => ({ ...p, stock: Number(p.stock) }))),
      error: () => {}
    });
  }

  cargarVinculos() {
    this.http.get<Vinculo[]>(`${API}/productos-proveedores`).subscribe({
      next: (d) => this.vinculos.set(d || []),
      error: () => {}
    });
  }

  private refrescarUbicaciones() {
    this.cargarUbicaciones();
    this.cargarProductos();
  }

  // ---------- Ubicaciones ----------
  etiqueta(u: Ubicacion): string {
    return `${u.codigo} · ${u.zona}` + (u.descripcion ? ` (${u.descripcion})` : '');
  }

  abrirNuevaUbicacion() {
    this.editandoUbicacion.set(null);
    this.formUbicacion = FORM_UBICACION();
    this.errorUbicacion.set('');
    this.modalUbicacion.set(true);
  }

  abrirEditarUbicacion(u: Ubicacion) {
    this.editandoUbicacion.set(u.id);
    this.formUbicacion = { zona: u.zona, pasillo: u.pasillo, estante: u.estante, nivel: u.nivel, descripcion: u.descripcion || '', activo: u.activo };
    this.errorUbicacion.set('');
    this.modalUbicacion.set(true);
  }

  guardarUbicacion() {
    const f = this.formUbicacion;
    if (!f.zona.trim() || !String(f.pasillo).trim() || !String(f.estante).trim()) {
      return this.errorUbicacion.set('Escribe la zona, el pasillo y el estante');
    }
    const nivel = Number(f.nivel);
    if (!Number.isInteger(nivel) || nivel < 1) return this.errorUbicacion.set('El nivel debe ser un número entero desde 1');

    const datos = { zona: f.zona.trim(), pasillo: String(f.pasillo).trim(), estante: String(f.estante).trim(), nivel, descripcion: f.descripcion.trim(), activo: f.activo };
    const id = this.editandoUbicacion();
    const peticion = id === null
      ? this.http.post<any>(`${API}/ubicaciones`, datos)
      : this.http.put<any>(`${API}/ubicaciones/${id}`, datos);
    peticion.subscribe({
      next: () => {
        this.toast.ok(id === null ? 'Ubicación creada' : 'Ubicación actualizada');
        this.modalUbicacion.set(false);
        this.refrescarUbicaciones();
      },
      error: (err) => this.errorUbicacion.set(err.error?.error || 'No se pudo guardar la ubicación')
    });
  }

  async eliminarUbicacion(u: Ubicacion) {
    const si = await this.confirmar.pedir({ titulo: 'Eliminar ubicación', texto: `Se quitará la ubicación ${u.codigo}.` });
    if (!si) return;
    this.http.delete<any>(`${API}/ubicaciones/${u.id}`).subscribe({
      next: () => { this.toast.info('Ubicación eliminada'); this.refrescarUbicaciones(); },
      error: (err) => this.toast.error(err.error?.error || 'No se pudo eliminar la ubicación')
    });
  }

  // Asigna (o quita, con null) la ubicación de un producto
  ubicar(productoId: number, ubicacionId: number | null) {
    this.http.put<any>(`${API}/inventario/${productoId}/ubicacion`, { ubicacionId }).subscribe({
      next: (res) => { this.toast.ok(res?.mensaje || 'Ubicación actualizada'); this.refrescarUbicaciones(); },
      error: (err) => { this.toast.error(err.error?.error || 'No se pudo cambiar la ubicación'); this.refrescarUbicaciones(); }
    });
  }

  alElegirUbicacion(productoId: number, valor: string) {
    if (valor === '') return;
    this.ubicar(productoId, Number(valor));
  }

  // ---------- Producto <-> proveedor ----------
  abrirNuevoVinculo(productoId: number | null = null) {
    this.editandoVinculo.set(false);
    this.formVinculo = { ...FORM_VINCULO(), productoId };
    this.errorVinculo.set('');
    this.modalVinculo.set(true);
  }

  abrirEditarVinculo(v: Vinculo) {
    this.editandoVinculo.set(true);
    this.formVinculo = {
      productoId: v.productoId, proveedorId: v.proveedorId, codigoProveedor: v.codigoProveedor || '',
      precioCompra: v.precioCompra, plazoEntregaDias: v.plazoEntregaDias, esPrincipal: v.esPrincipal,
    };
    this.errorVinculo.set('');
    this.modalVinculo.set(true);
  }

  guardarVinculo() {
    const f = this.formVinculo;
    if (f.productoId === null || f.proveedorId === null) return this.errorVinculo.set('Elige el producto y el proveedor');
    const precio = Number(f.precioCompra ?? 0);
    if (!Number.isFinite(precio) || precio < 0) return this.errorVinculo.set('Escribe un precio de compra válido');
    const plazo = Number(f.plazoEntregaDias);
    if (!Number.isInteger(plazo) || plazo < 0) return this.errorVinculo.set('El plazo de entrega debe ser un número entero de días');

    this.http.put<any>(`${API}/productos-proveedores`, {
      productoId: f.productoId, proveedorId: f.proveedorId, codigoProveedor: f.codigoProveedor.trim(),
      precioCompra: precio, plazoEntregaDias: plazo, esPrincipal: f.esPrincipal,
    }).subscribe({
      next: () => { this.toast.ok('Vínculo guardado'); this.modalVinculo.set(false); this.cargarVinculos(); },
      error: (err) => this.errorVinculo.set(err.error?.error || 'No se pudo guardar el vínculo')
    });
  }

  async quitarVinculo(v: Vinculo) {
    const si = await this.confirmar.pedir({ titulo: 'Quitar proveedor', texto: `${v.proveedor} dejará de figurar como proveedor de ${v.producto}.` });
    if (!si) return;
    this.http.delete<any>(`${API}/productos-proveedores/${v.productoId}/${v.proveedorId}`).subscribe({
      next: () => { this.toast.info('Vínculo eliminado'); this.cargarVinculos(); },
      error: (err) => this.toast.error(err.error?.error || 'No se pudo quitar el vínculo')
    });
  }
}
