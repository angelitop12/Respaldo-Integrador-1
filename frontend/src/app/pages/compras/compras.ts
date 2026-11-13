import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { formatoFecha } from '../../datos-demo';
import { Compra, Proveedor } from '../../models';
import { Almacen } from '../../services/almacen';
import { Toast } from '../../services/toast';
import { Icono } from '../../ui/icono/icono';
import { Modal } from '../../ui/modal/modal';
import { Vacio } from '../../ui/vacio/vacio';
import { API } from '../../api';
import { Sesion } from '../../services/sesion';
import { errNombre, errNumero, primerError } from '../../utils/validaciones';


@Component({
  selector: 'app-compras',
  imports: [DecimalPipe, FormsModule, Icono, Modal, Vacio],
  templateUrl: './compras.html',
  styleUrl: './compras.css',
})
export class Compras implements OnInit {
  sesion = inject(Sesion);
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private almacen = inject(Almacen);
  private toast = inject(Toast);

  private apiUrl = `${API}/compras`;

  moneda = computed(() => this.almacen.empresa().moneda || 'S/');
  proveedores = signal<Proveedor[]>([]);
  compras = signal<Compra[]>([]);
  productos = signal<any[]>([]);

  filtro = signal<'todas' | 'Pendiente' | 'Recibido'>('todas');
  ordenadas = computed(() => [...this.compras()].sort((a, b) => b.ts - a.ts));
  filtradas = computed(() => this.ordenadas().filter(c => this.filtro() === 'todas' || c.estado === this.filtro()));
  pendientes = computed(() => this.compras().filter(c => c.estado === 'Pendiente'));
  montoPendiente = computed(() => this.pendientes().reduce((s, c) => s + Number(c.costoTotal || 0), 0));
  recibidas = computed(() => this.compras().length - this.pendientes().length);

  modalAbierto = signal(false);
  form = {
    proveedor: '',
    descripcion: '',
    producto_id: null as number | null,
    cantidad: null as number | null,
    costoTotal: null as number | null,
    estado: 'Recibido' as 'Recibido' | 'Pendiente'
  };
  errorForm = signal('');

  ngOnInit() {
    this.cargarDatosMunoz();
  }

  cargarDatosMunoz() {
    // 1. Cargar compras reales desde PostgreSQL
    this.http.get<any[]>(this.apiUrl).subscribe({
      next: (datos) => {
        const lista: Compra[] = (datos || []).map(c => ({
          id: c.id,
          proveedor: c.proveedor || '',
          descripcion: c.descripcion || '',
          cantidad: Number(c.cantidad || 0),
          costoTotal: Number(c.costoTotal ?? c.costo_total ?? 0),
          fecha: c.fecha || '',
          ts: Number(c.ts || Date.now()),
          estado: c.estado === 'Recibido' ? 'Recibido' : 'Pendiente'
        }));
        this.compras.set(lista);
        // Sincronizamos también con almacen.compras por si el módulo de Reportes lo lee
        this.almacen.compras.set(lista);
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error al cargar compras:', err)
    });

    // 2. Cargar proveedores reales para el <datalist> del formulario
    this.http.get<any[]>(`${API}/proveedores`).subscribe({
      next: (provs) => {
        if (Array.isArray(provs)) {
          this.proveedores.set(provs);
          this.cdr.detectChanges();
        }
      }
    });

    // 3. Cargar catálogo de inventario para autocompletar productos y sincronizar stock
    this.http.get<any[]>(`${API}/inventario`).subscribe({
      next: (prods) => {
        if (Array.isArray(prods)) {
          this.productos.set(prods);
          this.cdr.detectChanges();
        }
      }
    });
  }

  alCambiarProducto(val: string) {
    const p = this.productos().find(prod => (prod.nombre || '').toLowerCase() === (val || '').trim().toLowerCase());
    if (p) {
      this.form.producto_id = p.id;
      if ((!this.form.costoTotal || this.form.costoTotal === 0) && p.precioCompra && this.form.cantidad) {
        this.form.costoTotal = Number((p.precioCompra * this.form.cantidad).toFixed(2));
      }
    } else {
      this.form.producto_id = null;
    }
  }

  abrir() {
    this.form = {
      proveedor: '',
      descripcion: '',
      producto_id: null,
      cantidad: null,
      costoTotal: null,
      estado: 'Recibido'
    };
    this.errorForm.set('');
    this.modalAbierto.set(true);
  }

  guardar() {
    const f = this.form;
    const problema = primerError(
      errNombre(f.proveedor, 'El proveedor'),
      errNombre(f.descripcion, 'La descripción de la compra', { min: 3, max: 255 }),
      errNumero(f.cantidad, 'La cantidad', { min: 0.01 }),
      errNumero(f.costoTotal, 'El costo total', { max: 100000000 })
    );
    if (problema) return this.errorForm.set(problema);

    // Intentamos resolver el producto_id si aún no estaba seteado
    if (!f.producto_id) {
      const match = this.productos().find(p => (p.nombre || '').toLowerCase() === f.descripcion.trim().toLowerCase());
      if (match) f.producto_id = match.id;
    }

    const ahora = Date.now();
    const payload = {
      proveedor: f.proveedor.trim(),
      descripcion: f.descripcion.trim(),
      producto_id: f.producto_id,
      cantidad: Number(f.cantidad),
      costoTotal: Number(f.costoTotal),
      estado: f.estado || 'Recibido',
      fecha: formatoFecha(ahora),
      ts: ahora
    };

    this.http.post<any>(this.apiUrl, payload).subscribe({
      next: (res) => {
        this.cargarDatosMunoz();
        this.modalAbierto.set(false);
        if (res?.stockActualizado) {
          this.toast.ok(`Compra registrada con éxito. Se sumaron ${f.cantidad} unidades al stock del inventario.`);
        } else if (f.estado === 'Recibido') {
          // Entró como recibida pero su descripción no coincide con ningún producto: el stock no se toca
          this.toast.info('Compra registrada. No coincide con ningún producto del inventario, así que el stock no cambió.');
        } else {
          this.toast.ok('Compra registrada como pendiente. Se sumará al stock al recibir el pedido.');
        }
      },
      error: (err) => this.toast.error(err.error?.error || 'No se pudo registrar la compra')
    });
  }

  marcarRecibida(c: Compra) {
    // Actualización inmediata en interfaz
    this.compras.update(l => l.map(x => (x.id === c.id ? { ...x, estado: 'Recibido' } : x)));

    // Persistir cambio en PostgreSQL
    this.http.put<any>(`${this.apiUrl}/${c.id}/recibir`, {}).subscribe({
      next: (res) => {
        if (res?.stockActualizado === false) this.toast.info(res.mensaje);
        else this.toast.ok('Pedido marcado como recibido y stock sumado al inventario');
        this.cargarDatosMunoz();
      },
      error: (err) => {
        this.toast.error(err.error?.error || 'Error al actualizar el estado en la base de datos');
        this.cargarDatosMunoz(); // la lista vuelve a mostrar lo que realmente hay en la base de datos
      }
    });
  }
}