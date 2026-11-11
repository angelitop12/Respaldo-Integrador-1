import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { API } from '../../api';
import { Toast } from '../../services/toast';
import { Icono } from '../../ui/icono/icono';
import { Vacio } from '../../ui/vacio/vacio';

// Un lote = una entrada de mercadería (compra, stock inicial, ajuste...) con su propio costo
export interface Lote {
  id: number;
  productoId: number;
  producto: string;
  codigoInterno: string | null;
  unidad: string;
  origen: string;
  referencia: string | null;
  fechaIngreso: string;
  cantidadInicial: number;
  cantidadRestante: number;
  costoUnitario: number;
  valor: number;
  ordenSalida: number | null; // 1 = el primero que se va a vender (FIFO)
  fechaTxt?: string;
}

interface GrupoProducto {
  productoId: number;
  producto: string;
  codigoInterno: string | null;
  unidad: string;
  lotes: Lote[];
  stock: number;
  valor: number;
}

interface ProductoLista { id: number; nombre: string; }

const ORIGENES: Record<string, string> = {
  INICIAL: 'Stock inicial',
  COMPRA: 'Compra',
  AJUSTE: 'Ajuste manual',
  ANULACION: 'Venta anulada',
  MIGRACION: 'Stock previo al FIFO',
};

@Component({
  selector: 'app-lotes',
  imports: [DecimalPipe, FormsModule, Icono, Vacio],
  templateUrl: './lotes.html',
  styleUrl: './lotes.css',
})
export class Lotes implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(Toast);
  private ruta = inject(ActivatedRoute);

  moneda = 'S/';
  lotes = signal<Lote[]>([]);
  valorTotal = signal(0);
  productos = signal<ProductoLista[]>([]);
  cargando = signal(true);
  fallo = signal(false);

  filtroProducto: number | '' = '';
  verAgotados = false;

  // Los lotes se agrupan por producto, del más antiguo al más nuevo (el orden en que se van a vender)
  grupos = computed<GrupoProducto[]>(() => {
    const mapa = new Map<number, GrupoProducto>();
    for (const l of this.lotes().filter(x => !this.verAgotados || x.cantidadRestante <= 0)) {
      let g = mapa.get(l.productoId);
      if (!g) {
        g = { productoId: l.productoId, producto: l.producto, codigoInterno: l.codigoInterno, unidad: l.unidad, lotes: [], stock: 0, valor: 0 };
        mapa.set(l.productoId, g);
      }
      g.lotes.push(l);
      g.stock += l.cantidadRestante;
      g.valor += l.valor;
    }
    return [...mapa.values()];
  });
  lotesVigentes = computed(() => this.lotes().filter(l => l.cantidadRestante > 0).length);
  productosConStock = computed(() => new Set(this.lotes().filter(l => l.cantidadRestante > 0).map(l => l.productoId)).size);

  ngOnInit() {
    // Llega desde el Kardex con ?productoId=… para mostrar solo los lotes de ese producto
    const id = Number(this.ruta.snapshot.queryParamMap.get('productoId'));
    if (Number.isInteger(id) && id > 0) this.filtroProducto = id;

    this.http.get<ProductoLista[]>(`${API}/inventario`).subscribe({
      next: (datos) => this.productos.set((datos || []).map(p => ({ id: p.id, nombre: p.nombre }))),
      error: () => {},
    });
    this.cargar();
  }

  cargar() {
    let params = new HttpParams();
    if (this.filtroProducto !== '') params = params.set('productoId', this.filtroProducto);
    if (this.verAgotados) params = params.set('todos', '1');

    this.cargando.set(true);
    this.http.get<{ valorTotal: number; lotes: Lote[] }>(`${API}/lotes`, { params }).subscribe({
      next: (r) => {
        this.lotes.set((r.lotes || []).map(l => ({ ...l, fechaTxt: this.formatoFecha(l.fechaIngreso) })));
        this.valorTotal.set(Number(r.valorTotal || 0));
        this.fallo.set(false);
        this.cargando.set(false);
      },
      error: (err) => {
        this.cargando.set(false);
        this.fallo.set(true);
        if (err.status !== 0 && err.error?.codigo !== 'SESION_INVALIDA') this.toast.error(err.error?.error || 'No se pudieron cargar los lotes');
      },
    });
  }

  limpiar() {
    this.filtroProducto = '';
    this.verAgotados = false;
    this.cargar();
  }

  hayFiltros(): boolean {
    return this.filtroProducto !== '' || this.verAgotados;
  }

  textoOrigen(origen: string): string {
    return ORIGENES[origen] ?? origen;
  }

  // Qué parte del lote sigue en el almacén (para la barra)
  porcentaje(l: Lote): number {
    return l.cantidadInicial > 0 ? Math.round((l.cantidadRestante / l.cantidadInicial) * 100) : 0;
  }

  costoPromedio(g: GrupoProducto): number {
    return g.stock > 0 ? g.valor / g.stock : 0;
  }

  private formatoFecha(iso: string): string {
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) return String(iso ?? '');
    return fecha.toLocaleString('es-PE', {
      timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }
}
